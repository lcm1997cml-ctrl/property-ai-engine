/**
 * Batch-ingest new 28Hse developments into the database.
 *
 * Phase A: crawl list pages → collect up to BATCH_LIMIT project detail URLs.
 * Phase B: for each project — fetch detail → parse → normalize → upsert listing
 *          + delete-then-insert ListingUnit rows + upsert ListingMedia rows.
 *
 * Usage (from repo root, DATABASE_URL in .env):
 *   npx tsx crawler/scripts/batchIngestNewDevelopments.ts
 *
 * Optional env:
 *   BATCH_LIMIT      number of projects to ingest (default: 100)
 *   LIST_MAX_PAGES   max list pages to crawl     (default: 10)
 *
 * Safety guards (abort early if exceeded):
 *   SAFETY_MAX_FAILURE_RATE      fraction 0–1  (default: 0.10 = 10%)
 *   SAFETY_MAX_UNKNOWN_DISTRICT  integer count (default: 5)
 *   SAFETY_MAX_MISSING_TITLE_ZH  integer count (default: 5)
 *   SAFETY_MIN_SAMPLE            min items before failure-rate check kicks in (default: 10)
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fetchNewProjectsListPages } from "../fetchers/28hseNewProjectsFetcher";
import { fetchProjectDetailPage } from "../fetchers/28hseProjectDetailFetcher";
import { parseAllListPages } from "../parsers/28hseNewProjectsParser";
import { parseProjectDetailPage } from "../parsers/28hseProjectDetailParser";
import { normalizeProject } from "../normalizers/normalizeProject";
import { normalizeUnits } from "../normalizers/normalizeUnit";
import { normalizeMedia } from "../normalizers/normalizeMedia";
import { validateDataQuality } from "../normalizers/validateDataQuality";
import { createLogger } from "../utils/logging";
import { fetchChineseTitle } from "../utils/chineseTitle";
import { prisma } from "@/lib/db";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectSummaryRow {
  title: string;
  slug: string;
  district: string;
  developer: string;
  priceFrom: number | undefined;
  priceTo: number | undefined;
  areaFrom: number;
  areaTo: number | undefined;
  roomSummary: string;
  unitRows: number;
  status: "inserted" | "updated" | "partial" | "skipped" | "failed";
  reason?: string;
  priceStrategy?: string;
  // Quality tracking fields
  titleZh: string | null;
  /** True when the Chinese-language page returned an English-only name (intentional English branding). */
  isEnglishBranded: boolean;
  dataCompleteness: "full" | "partial" | null;
  isUnknownDistrict: boolean;
  isSoldOut: boolean;
  sourceUrl: string;
  dataQuality: "normal" | "suspicious";
  suspiciousReasons: string[];
}

// ─── Env loader ───────────────────────────────────────────────────────────────

function loadDotEnv(): void {
  const p = resolve(process.cwd(), ".env");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// ─── Slug helpers ─────────────────────────────────────────────────────────────

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

async function ensureUniqueSlug(
  baseSlug: string,
  excludeId?: string
): Promise<string> {
  let slug = baseSlug;
  let suffix = 1;
  while (true) {
    const collision = await prisma.listing.findFirst({
      where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    });
    if (!collision) return slug;
    slug = `${baseSlug}-${suffix++}`;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadDotEnv();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set (.env or environment).");
    process.exit(1);
  }

  const batchLimit = parseInt(process.env.BATCH_LIMIT ?? "100", 10);
  const listMaxPages = parseInt(process.env.LIST_MAX_PAGES ?? "10", 10);

  // ── Safety guard thresholds ───────────────────────────────────────────────
  const SAFETY_MAX_FAILURE_RATE = parseFloat(process.env.SAFETY_MAX_FAILURE_RATE ?? "0.10");
  const SAFETY_MAX_UNKNOWN_DISTRICT = parseInt(process.env.SAFETY_MAX_UNKNOWN_DISTRICT ?? "5", 10);
  const SAFETY_MAX_MISSING_TITLE_ZH = parseInt(process.env.SAFETY_MAX_MISSING_TITLE_ZH ?? "5", 10);
  // Failure-rate check only kicks in after this many items (avoids false positives at the start)
  const SAFETY_MIN_SAMPLE = parseInt(process.env.SAFETY_MIN_SAMPLE ?? "10", 10);

  const logger = createLogger("batchIngestNewDevelopments");
  logger.info("Starting batch ingest", {
    batchLimit,
    listMaxPages,
    safetyMaxFailureRate: SAFETY_MAX_FAILURE_RATE,
    safetyMaxUnknownDistrict: SAFETY_MAX_UNKNOWN_DISTRICT,
    safetyMaxMissingTitleZh: SAFETY_MAX_MISSING_TITLE_ZH,
  });

  // ── Phase A: collect project URLs ─────────────────────────────────────────
  console.log(`\nFetching up to ${listMaxPages} list page(s)...`);
  const listPages = await fetchNewProjectsListPages(logger, listMaxPages);
  const summaries = parseAllListPages(listPages, logger);
  const targets = summaries.slice(0, batchLimit);
  console.log(
    `Found ${summaries.length} projects — processing first ${targets.length}\n`
  );

  // ── Phase B: detail fetch → parse → normalize → upsert ───────────────────
  const results: ProjectSummaryRow[] = [];
  let delay = 2000; // ms between detail fetches
  let abortReason: string | null = null;

  for (let i = 0; i < targets.length; i++) {
    const summary = targets[i]!;
    const projectLabel = `[${i + 1}/${targets.length}] ${summary.rawName}`;
    console.log(`${projectLabel} — fetching...`);

    // Throttle between requests
    if (i > 0) await new Promise((r) => setTimeout(r, delay));

    // Fetch detail page
    const page = await fetchProjectDetailPage(summary.detailUrl, logger);
    if (!page) {
      logger.warn("Detail fetch failed", { url: summary.detailUrl });
      results.push({
        title: summary.rawName,
        slug: "",
        district: summary.rawDistrict ?? "",
        developer: "",
        priceFrom: 0,
        priceTo: undefined,
        areaFrom: 0,
        areaTo: undefined,
        roomSummary: "",
        unitRows: 0,
        status: "failed",
        reason: "fetch_failed",
        titleZh: null,
        isEnglishBranded: false,
        dataCompleteness: null,
        isUnknownDistrict: false,
        isSoldOut: false,
        sourceUrl: summary.detailUrl,
        dataQuality: "normal",
        suspiciousReasons: [],
      });
      continue;
    }

    // Parse
    const raw = parseProjectDetailPage(page, logger);

    // Normalize — only returns null when the listing name is entirely missing
    const normalized = normalizeProject(raw);
    if (!normalized) {
      logger.warn("Normalization failed (missing listing name)", {
        url: summary.detailUrl,
      });
      results.push({
        title: raw.rawName ?? summary.rawName,
        slug: "",
        district: raw.rawDistrict ?? summary.rawDistrict ?? "",
        developer: raw.rawDeveloper ?? "",
        priceFrom: undefined,
        priceTo: undefined,
        areaFrom: 0,
        areaTo: undefined,
        roomSummary: raw.rawRoomSummary ?? "",
        unitRows: 0,
        status: "failed",
        reason: "normalize_failed:no_name",
        titleZh: null,
        isEnglishBranded: false,
        dataCompleteness: null,
        isUnknownDistrict: false,
        isSoldOut: false,
        sourceUrl: summary.detailUrl,
        dataQuality: "normal",
        suspiciousReasons: [],
      });
      continue;
    }

    // Fetch Chinese project name
    const hseSlug = summary.detailUrl.split("/en/new-properties/")[1]?.split("?")[0] ?? "";
    const chineseResult = hseSlug ? await fetchChineseTitle(hseSlug, logger) : null;
    // Only store titleZh if it actually contains Chinese characters.
    // Developments with English-only branding return the English name from
    // the Chinese page; storing that would mask the clean titleEn fallback.
    const hasChinese = (s: string) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s);
    const titleZhToStore =
      chineseResult && hasChinese(chineseResult.titleZh) ? chineseResult.titleZh : null;
    // English-branded: Chinese page was reachable but returned no Chinese characters.
    // Truly missing: fetch failed entirely (null chineseResult) or no slug.
    const isEnglishBranded = chineseResult !== null && !hasChinese(chineseResult.titleZh);
    if (!chineseResult) {
      logger.info("titleZh not found — will store null", { hseSlug });
    } else if (isEnglishBranded) {
      logger.info("titleZh: English-branded listing (Chinese page returned English-only title)", {
        hseSlug,
        titleZh: chineseResult.titleZh,
      });
    }

    // Prepare media
    const mediaRows = normalizeMedia(raw.media, raw.sourceUrl);
    const heroImage =
      mediaRows.find(
        (m) => m.mediaType === "image" && /\.(jpe?g|webp|png)$/i.test(m.url)
      )?.url ??
      mediaRows.find((m) => m.mediaType === "image")?.url ??
      mediaRows[0]?.url;

    // Prepare units
    const unitInputs = normalizeUnits(raw.units, raw.sourceUrl);

    // Validate data quality after units are known
    const qualityResult = validateDataQuality(normalized, unitInputs.length, raw.rawRoomSummary);
    if (qualityResult.quality === "suspicious") {
      logger.warn("Suspicious listing flagged", {
        title: normalized.estateName,
        reasons: qualityResult.reasons,
      });
    }

    // Check for existing listing
    const existing = await prisma.listing.findFirst({
      where: { sourceUrl: summary.detailUrl },
    });

    const baseSlug = makeSlug(normalized.estateName);
    const slug = await ensureUniqueSlug(baseSlug, existing?.id);

    let listing;

    const rowStatus: "inserted" | "updated" | "partial" = existing
      ? "updated"
      : normalized.dataCompleteness === "partial"
      ? "partial"
      : "inserted";

    // Store English (main detail page) and Chinese (zh-hk page) into their
    // dedicated columns. Frontend does `descriptionZh ?? description`, so
    // Chinese takes precedence whenever we have it.
    //
    // descriptionZh only gets set this run if we actually fetched a Chinese
    // description; otherwise we skip the field so we don't clobber existing
    // Chinese text with NULL on re-crawl.
    const chineseDesc = chineseResult?.descriptionZh?.trim() || null;

    const listingData = {
      slug,
      estateName: normalized.estateName,
      titleEn: normalized.estateName,
      titleZh: titleZhToStore,
      district: normalized.district,
      subDistrict: normalized.subDistrict,
      address: normalized.address ?? null,
      developer: normalized.developer,
      completionYear: normalized.completionYear ?? null,
      price: normalized.price ?? null,
      priceMax: normalized.priceMax ?? null,
      saleableArea: normalized.saleableArea,
      saleableAreaMax: normalized.saleableAreaMax ?? null,
      psf: normalized.psf ?? null,
      bedrooms: normalized.bedrooms,
      propertyType: normalized.propertyType,
      description: normalized.description ?? null,
      ...(chineseDesc ? { descriptionZh: chineseDesc } : {}),
      status: normalized.status,
      source: "28hse" as const,
      sourceUrl: summary.detailUrl,
      sourceType: "new" as const,
      comparisonRole: "primary" as const,
      tags: normalized.tags,
      imageUrl: heroImage ?? null,
      dataCompleteness: normalized.dataCompleteness,
      dataQuality: qualityResult.quality,
    };

    if (existing) {
      listing = await prisma.listing.update({
        where: { id: existing.id },
        data: { ...listingData, lastSeenAt: new Date() },
      });
    } else {
      listing = await prisma.listing.create({ data: listingData });
    }

    // Units: delete stale rows, then insert fresh ones
    await prisma.listingUnit.deleteMany({ where: { listingId: listing.id } });
    for (const unit of unitInputs) {
      await prisma.listingUnit.create({
        data: {
          listingId: listing.id,
          unitLabel: unit.unitLabel,
          roomCount: unit.roomCount,
          saleableArea: unit.saleableArea ?? null,
          saleableAreaMax: unit.saleableAreaMax ?? null,
          price: unit.price ?? null,
          priceMax: unit.priceMax ?? null,
          pricePerSqft: unit.pricePerSqft ?? null,
          unitCount: unit.unitCount ?? null,
          availability: unit.availability,
          sourceUrl: unit.sourceUrl,
        },
      });
    }

    // Media: upsert by (listingId, url)
    for (const m of mediaRows) {
      await prisma.listingMedia.upsert({
        where: { listingId_url: { listingId: listing.id, url: m.url } },
        update: { sortOrder: m.sortOrder, mediaType: m.mediaType },
        create: {
          listingId: listing.id,
          mediaType: m.mediaType,
          url: m.url,
          sortOrder: m.sortOrder,
          sourceUrl: m.sourceUrl,
        },
      });
    }

    console.log(
      `  → ${rowStatus} slug=${slug} units=${unitInputs.length} media=${mediaRows.length}`
    );

    results.push({
      title: normalized.estateName,
      slug,
      district: normalized.district,
      developer: normalized.developer ?? "",
      priceFrom: normalized.price,
      priceTo: normalized.priceMax,
      areaFrom: normalized.saleableArea,
      areaTo: normalized.saleableAreaMax,
      roomSummary: raw.rawRoomSummary ?? "",
      unitRows: unitInputs.length,
      status: rowStatus,
      priceStrategy: normalized.priceStrategy,
      titleZh: titleZhToStore,
      isEnglishBranded,
      dataCompleteness: normalized.dataCompleteness,
      // Unknown = stored "其他" (empty raw) OR raw English value wasn't in DISTRICT_MAP
      isUnknownDistrict: !hasChinese(normalized.district),
      isSoldOut: normalized.status === "sold_out",
      sourceUrl: summary.detailUrl,
      dataQuality: qualityResult.quality,
      suspiciousReasons: qualityResult.reasons,
    });

    // ── Safety guard check (runs after every item, including failures) ───────
    const runProcessed = results.length;
    const runFailed = results.filter((r) => r.status === "failed").length;
    // Only check quality thresholds on NEW inserts (status "inserted" or "partial"),
    // not on updates of existing listings — updated rows may already have null titleZh
    // or "其他" district from a previous run and that is expected.
    const runNewInserts = results.filter(
      (r) => r.status === "inserted" || r.status === "partial"
    );
    const runUnknownDistrict = runNewInserts.filter((r) => r.isUnknownDistrict).length;
    // Only count truly-missing titleZh against the threshold.
    // English-branded listings intentionally have no Chinese title and should not trigger the guard.
    const runTrulyMissingZh = runNewInserts.filter((r) => !r.titleZh && !r.isEnglishBranded).length;

    if (
      runProcessed >= SAFETY_MIN_SAMPLE &&
      runFailed / runProcessed > SAFETY_MAX_FAILURE_RATE
    ) {
      abortReason =
        `failure rate ${(runFailed / runProcessed * 100).toFixed(1)}% exceeds ` +
        `${(SAFETY_MAX_FAILURE_RATE * 100).toFixed(0)}% threshold ` +
        `(${runFailed} failures in ${runProcessed} items)`;
      break;
    }
    if (runUnknownDistrict > SAFETY_MAX_UNKNOWN_DISTRICT) {
      abortReason =
        `unknown district count ${runUnknownDistrict} exceeds ` +
        `threshold of ${SAFETY_MAX_UNKNOWN_DISTRICT}`;
      break;
    }
    if (runTrulyMissingZh > SAFETY_MAX_MISSING_TITLE_ZH) {
      abortReason =
        `truly-missing titleZh count ${runTrulyMissingZh} exceeds ` +
        `threshold of ${SAFETY_MAX_MISSING_TITLE_ZH} (English-branded excluded)`;
      break;
    }
  }

  // ── Summary table ─────────────────────────────────────────────────────────
  const COL_W = 130;
  console.log("\n" + "═".repeat(COL_W));
  if (abortReason) {
    console.log(`BATCH INGEST SUMMARY  ⚠  ABORTED EARLY`);
    console.log(`Abort reason: ${abortReason}`);
    console.log(`Processed ${results.length} of ${targets.length} targets (${targets.length - results.length} skipped).`);
  } else {
    console.log("BATCH INGEST SUMMARY");
  }
  console.log("═".repeat(COL_W));

  const col = (s: string | number | undefined, w: number) =>
    String(s ?? "").slice(0, w).padEnd(w);

  const header = [
    col("Title", 26),
    col("District", 12),
    col("Developer", 16),
    col("Price HK$", 16),
    col("Area ft²", 11),
    col("Rooms", 22),
    col("Units", 5),
    col("Status", 9),
    col("PriceStrategy", 18),
  ].join(" │ ");
  console.log(header);
  console.log("─".repeat(COL_W));

  for (const r of results) {
    const priceRange = r.priceFrom
      ? r.priceTo
        ? `${(r.priceFrom / 1e6).toFixed(2)}M-${(r.priceTo / 1e6).toFixed(2)}M`
        : `${(r.priceFrom / 1e6).toFixed(2)}M`
      : r.reason ?? "(no price)";

    const areaRange =
      r.areaFrom > 0
        ? r.areaTo
          ? `${r.areaFrom}-${r.areaTo}`
          : String(r.areaFrom)
        : "";

    const row = [
      col(r.title, 26),
      col(r.district, 12),
      col(r.developer, 16),
      col(priceRange, 16),
      col(areaRange, 11),
      col(r.roomSummary, 22),
      col(r.unitRows, 5),
      col(r.status, 9),
      col(r.priceStrategy, 18),
    ].join(" │ ");
    console.log(row);
  }

  console.log("─".repeat(COL_W));

  const stored = results.filter((r) => r.status !== "failed");
  const inserted = results.filter((r) => r.status === "inserted").length;
  const updated = results.filter((r) => r.status === "updated").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const fullListings = stored.filter((r) => r.dataCompleteness === "full").length;
  const partialListings = stored.filter((r) => r.dataCompleteness === "partial").length;
  const titleZhTrulyMissing = stored.filter((r) => !r.titleZh && !r.isEnglishBranded).length;
  const titleZhEnglishBranded = stored.filter((r) => r.isEnglishBranded).length;
  const unknownDistrict = stored.filter((r) => r.isUnknownDistrict).length;
  // Collect distinct non-Chinese district values for audit
  const englishDistrictValues = [...new Set(
    stored.filter((r) => r.isUnknownDistrict).map((r) => r.district)
  )].sort();
  const soldOut = stored.filter((r) => r.isSoldOut).length;
  const totalUnits = results.reduce((s, r) => s + r.unitRows, 0);

  const skipped = targets.length - results.length;
  console.log(
    `Total: ${results.length} processed (${skipped > 0 ? `${skipped} skipped due to early abort, ` : ""}` +
    `${inserted} inserted, ${updated} updated, ${partial} partial-inserted, ${failed} failed)`
  );
  console.log(`  Full listings (price confirmed):   ${fullListings}`);
  console.log(`  Partial listings (no price):       ${partialListings}`);
  console.log(`  Truly-missing Chinese title:       ${titleZhTrulyMissing}  ${titleZhTrulyMissing > SAFETY_MAX_MISSING_TITLE_ZH ? "⚠ exceeds threshold" : ""}`);
  console.log(`  English-branded (no titleZh):      ${titleZhEnglishBranded}`);
  console.log(`  Unknown district count:            ${unknownDistrict}  ${unknownDistrict > SAFETY_MAX_UNKNOWN_DISTRICT ? "⚠ exceeds threshold" : ""}`);
  console.log(`  Sold out:                          ${soldOut}`);
  console.log(`  Total ListingUnit rows created:    ${totalUnits}`);
  if (abortReason) {
    console.log(`\n  ⚠  Run stopped early: ${abortReason}`);
    console.log(`  Re-check thresholds or fix data issues before retrying.`);
  }

  // Price strategy breakdown
  const strategyCount = new Map<string, number>();
  for (const r of results) {
    if (r.priceStrategy) {
      strategyCount.set(r.priceStrategy, (strategyCount.get(r.priceStrategy) ?? 0) + 1);
    }
  }
  if (strategyCount.size > 0) {
    console.log("\nPrice strategy breakdown:");
    for (const [strategy, count] of [...strategyCount.entries()].sort()) {
      console.log(`  ${strategy.padEnd(24)} ${count}`);
    }
  }

  // ── Data quality warnings ──────────────────────────────────────────────────
  const warnings: string[] = [];

  const trulyMissingZh = stored.filter((r) => !r.titleZh && !r.isEnglishBranded);
  if (trulyMissingZh.length > 0) {
    warnings.push(`\n[WARN] ${trulyMissingZh.length} listing(s) with truly-missing titleZh (fetch failed or no slug):`);
    for (const r of trulyMissingZh) {
      warnings.push(`  • ${r.title} (${r.sourceUrl})`);
    }
  }

  const englishBrandedListings = stored.filter((r) => r.isEnglishBranded);
  if (englishBrandedListings.length > 0) {
    warnings.push(`\n[INFO] ${englishBrandedListings.length} English-branded listing(s) — Chinese page returned English-only title (expected, not a failure):`);
    for (const r of englishBrandedListings) {
      warnings.push(`  • ${r.title} (${r.sourceUrl})`);
    }
  }

  const unknownDist = stored.filter((r) => r.isUnknownDistrict);
  if (unknownDist.length > 0) {
    warnings.push(`\n[WARN] ${unknownDist.length} listing(s) with unrecognized district:`);
    for (const r of unknownDist) {
      warnings.push(`  • ${r.title} — district="${r.district}" (${r.sourceUrl})`);
    }
  }

  // ── District audit: any non-Chinese values remaining after normalization ──
  if (englishDistrictValues.length > 0) {
    warnings.push(`\n[AUDIT] ${englishDistrictValues.length} distinct non-Chinese district value(s) still present after normalization — add these to DISTRICT_MAP:`);
    for (const d of englishDistrictValues) {
      warnings.push(`  • "${d}"`);
    }
  } else {
    warnings.push(`\n[AUDIT] All district values are Chinese after normalization. ✓`);
  }

  const soldOutListings = stored.filter((r) => r.isSoldOut);
  if (soldOutListings.length > 0) {
    warnings.push(`\n[INFO] ${soldOutListings.length} listing(s) marked sold_out:`);
    for (const r of soldOutListings) {
      warnings.push(`  • ${r.title} (${r.sourceUrl})`);
    }
  }

  const noPriceStrategy = stored.filter((r) => r.dataCompleteness === "full" && !r.priceStrategy);
  if (noPriceStrategy.length > 0) {
    warnings.push(`\n[WARN] ${noPriceStrategy.length} full listing(s) have no price strategy recorded:`);
    for (const r of noPriceStrategy) {
      warnings.push(`  • ${r.title} (${r.sourceUrl})`);
    }
  }

  if (warnings.length > 0) {
    console.log("\n" + "─".repeat(COL_W));
    console.log("DATA QUALITY WARNINGS");
    console.log("─".repeat(COL_W));
    for (const w of warnings) console.log(w);
  }

  // ── Suspicious listings (for manual review) ───────────────────────────────
  const suspiciousListings = stored.filter((r) => r.dataQuality === "suspicious");
  const suspiciousCount = suspiciousListings.length;
  console.log(`\n  Suspicious listings (data quality):  ${suspiciousCount}`);

  if (suspiciousCount > 0) {
    console.log("\n" + "─".repeat(COL_W));
    console.log(`SUSPICIOUS LISTINGS — ${suspiciousCount} listing(s) flagged for manual review`);
    console.log("─".repeat(COL_W));

    const sCol = (s: string | number | undefined, w: number) =>
      String(s ?? "").slice(0, w).padEnd(w);

    const sHeader = [
      sCol("Title", 28),
      sCol("District", 12),
      sCol("Rooms", 22),
      sCol("Area ft²", 10),
      sCol("Price HK$", 16),
      "Source URL",
    ].join(" │ ");
    console.log(sHeader);
    console.log("─".repeat(COL_W));

    for (const r of suspiciousListings) {
      const priceStr = r.priceFrom
        ? r.priceTo
          ? `${(r.priceFrom / 1e6).toFixed(2)}M-${(r.priceTo / 1e6).toFixed(2)}M`
          : `${(r.priceFrom / 1e6).toFixed(2)}M`
        : "(no price)";
      const areaStr = r.areaFrom > 0
        ? r.areaTo ? `${r.areaFrom}-${r.areaTo}` : String(r.areaFrom)
        : "";

      const sRow = [
        sCol(r.title, 28),
        sCol(r.district, 12),
        sCol(r.roomSummary, 22),
        sCol(areaStr, 10),
        sCol(priceStr, 16),
        r.sourceUrl,
      ].join(" │ ");
      console.log(sRow);

      for (const reason of r.suspiciousReasons) {
        console.log(`    ↳ ${reason}`);
      }
    }
    console.log("─".repeat(COL_W));
    console.log("Review the above listings before publishing or using in market analysis.");
  }

  console.log("\n" + "═".repeat(COL_W) + "\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
