/**
 * Re-fetch + re-parse + refresh a SINGLE listing's data (or a small batch).
 *
 * Use when inspectListing.ts shows "parser found N, DB stored M" and the
 * ListingUnit rows are stale. Runs the same code path as the batch ingest
 * but targets specific listings by slug / id — no list-page crawl needed.
 *
 * What it does (for each listing):
 *   1. Fetch the 28hse detail page (the English /en/new-properties/{slug} URL
 *      stored in Listing.sourceUrl).
 *   2. Parse it with parseProjectDetailPage.
 *   3. Normalize with normalizeProject / normalizeUnits.
 *   4. (Optional) Fetch the Chinese title + description again.
 *   5. Update the Listing row with fresh scalars.
 *   6. Delete-then-insert ListingUnit rows from the fresh parse.
 *   7. Upsert ListingMedia rows.
 *   8. Write a new ListingSource row (so inspectListing sees the latest
 *      rawPayloadJson next time).
 *
 * Usage (from repo root, requires DATABASE_URL in .env):
 *   # Dry-run (default): shows what would change, DOES NOT write
 *   SLUG=sierra-sea-1b             npx tsx crawler/scripts/reparseListing.ts
 *
 *   # Actually write to the DB
 *   SLUG=sierra-sea-1b             npx tsx crawler/scripts/reparseListing.ts --apply
 *
 *   # Multiple slugs (comma-separated) — good for targeted backfills
 *   SLUGS=sierra-sea-1b,belgravia-place-2 npx tsx crawler/scripts/reparseListing.ts --apply
 *
 *   # By ID
 *   ID=clxxxxxxxxxx  npx tsx crawler/scripts/reparseListing.ts --apply
 *
 *   # Refresh every new-dev listing with 0 ListingUnit rows (big batch!)
 *   ONLY_GAPS=1 BATCH_LIMIT=20 npx tsx crawler/scripts/reparseListing.ts --apply
 *
 * Safety:
 *   - Dry-run is the default. Requires `--apply` to touch the DB.
 *   - Rate-limited (2s between listings) to match batchIngestNewDevelopments.
 *   - Skips listings with no sourceUrl (nothing to re-fetch).
 *   - Never deletes a Listing — only refreshes its fields / child rows.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fetchProjectDetailPage } from "../fetchers/28hseProjectDetailFetcher";
import { parseProjectDetailPage } from "../parsers/28hseProjectDetailParser";
import { normalizeProject } from "../normalizers/normalizeProject";
import { normalizeUnits } from "../normalizers/normalizeUnit";
import { normalizeMedia } from "../normalizers/normalizeMedia";
import { validateDataQuality } from "../normalizers/validateDataQuality";
import { hashNormalized } from "../utils/hashing";
import { createLogger } from "../utils/logging";
import { fetchChineseTitle } from "../utils/chineseTitle";
import { prisma } from "@/lib/db";

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

function hasChinese(s: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s);
}

interface ListingTarget {
  id: string;
  slug: string;
  estateName: string;
  titleZh: string | null;
  sourceUrl: string | null;
}

async function resolveTargets(): Promise<ListingTarget[]> {
  const slug = process.env.SLUG?.trim();
  const slugs = process.env.SLUGS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const id = process.env.ID?.trim();
  const onlyGaps = process.env.ONLY_GAPS === "1";
  const batchLimit = process.env.BATCH_LIMIT
    ? parseInt(process.env.BATCH_LIMIT, 10)
    : undefined;

  if (onlyGaps) {
    // Find every new-dev listing with 0 ListingUnit rows
    const listings = await prisma.listing.findMany({
      where: { sourceType: "new", sourceUrl: { not: null } },
      select: {
        id: true,
        slug: true,
        estateName: true,
        titleZh: true,
        sourceUrl: true,
        units: { select: { id: true } },
      },
      orderBy: [{ district: "asc" }, { estateName: "asc" }],
    });
    const gaps = listings.filter((l) => l.units.length === 0);
    const capped = batchLimit ? gaps.slice(0, batchLimit) : gaps;
    return capped.map((l) => ({
      id: l.id,
      slug: l.slug,
      estateName: l.estateName,
      titleZh: l.titleZh,
      sourceUrl: l.sourceUrl,
    }));
  }

  if (id) {
    const row = await prisma.listing.findUnique({
      where: { id },
      select: { id: true, slug: true, estateName: true, titleZh: true, sourceUrl: true },
    });
    return row ? [row] : [];
  }

  const slugList = slugs && slugs.length > 0 ? slugs : slug ? [slug] : [];
  if (slugList.length === 0) return [];

  const rows = await prisma.listing.findMany({
    where: { slug: { in: slugList } },
    select: { id: true, slug: true, estateName: true, titleZh: true, sourceUrl: true },
  });
  return rows;
}

interface ChangeReport {
  slug: string;
  estateName: string;
  fetched: boolean;
  parseWarnings: string[];
  priceStrategy: string;
  unitsBefore: number;
  unitsAfter: number;
  priceBefore: number | null;
  priceAfter: number | null;
  priceMaxBefore: number | null;
  priceMaxAfter: number | null;
  status: "applied" | "dry-run" | "skipped";
  reason?: string;
}

async function reparseOne(
  target: ListingTarget,
  apply: boolean,
  logger: ReturnType<typeof createLogger>
): Promise<ChangeReport> {
  const label = target.titleZh ?? target.estateName;

  if (!target.sourceUrl) {
    return {
      slug: target.slug,
      estateName: label,
      fetched: false,
      parseWarnings: [],
      priceStrategy: "-",
      unitsBefore: 0,
      unitsAfter: 0,
      priceBefore: null,
      priceAfter: null,
      priceMaxBefore: null,
      priceMaxAfter: null,
      status: "skipped",
      reason: "no_source_url",
    };
  }

  const before = await prisma.listing.findUniqueOrThrow({
    where: { id: target.id },
    select: {
      price: true,
      priceMax: true,
      units: { select: { id: true } },
    },
  });

  console.log(`\n→ ${label} (${target.slug})`);
  console.log(`  source: ${target.sourceUrl}`);
  const page = await fetchProjectDetailPage(target.sourceUrl, logger);
  if (!page) {
    console.log("  ✗ fetch failed — skipping");
    return {
      slug: target.slug,
      estateName: label,
      fetched: false,
      parseWarnings: [],
      priceStrategy: "-",
      unitsBefore: before.units.length,
      unitsAfter: before.units.length,
      priceBefore: before.price,
      priceAfter: before.price,
      priceMaxBefore: before.priceMax,
      priceMaxAfter: before.priceMax,
      status: "skipped",
      reason: "fetch_failed",
    };
  }

  const raw = parseProjectDetailPage(page, logger);
  const normalized = normalizeProject(raw);
  if (!normalized) {
    console.log("  ✗ normalize failed (missing listing name) — skipping");
    return {
      slug: target.slug,
      estateName: label,
      fetched: true,
      parseWarnings: raw.parseWarnings,
      priceStrategy: raw.priceStrategy,
      unitsBefore: before.units.length,
      unitsAfter: before.units.length,
      priceBefore: before.price,
      priceAfter: before.price,
      priceMaxBefore: before.priceMax,
      priceMaxAfter: before.priceMax,
      status: "skipped",
      reason: "normalize_failed",
    };
  }

  const unitInputs = normalizeUnits(raw.units, raw.sourceUrl);
  const mediaRows = normalizeMedia(raw.media, raw.sourceUrl);
  const heroImage =
    mediaRows.find(
      (m) => m.mediaType === "image" && /\.(jpe?g|webp|png)$/i.test(m.url)
    )?.url ??
    mediaRows.find((m) => m.mediaType === "image")?.url ??
    mediaRows[0]?.url;

  const quality = validateDataQuality(normalized, unitInputs.length, raw.rawRoomSummary);

  // Chinese title + description re-fetch
  const hseSlug = target.sourceUrl.split("/en/new-properties/")[1]?.split("?")[0] ?? "";
  const chineseResult = hseSlug ? await fetchChineseTitle(hseSlug, logger) : null;
  const titleZhToStore =
    chineseResult && hasChinese(chineseResult.titleZh) ? chineseResult.titleZh : target.titleZh;
  const chineseDesc = chineseResult?.descriptionZh?.trim() || null;

  console.log(`  parser: ${unitInputs.length} unit(s), priceStrategy=${raw.priceStrategy}`);
  if (raw.parseWarnings.length > 0) {
    console.log(`  warnings: ${raw.parseWarnings.join(" | ")}`);
  }
  console.log(
    `  DB was: ${before.units.length} unit(s), price=${before.price ?? "—"}, priceMax=${before.priceMax ?? "—"}`
  );

  if (!apply) {
    console.log("  ◇ dry-run — not writing. Re-run with --apply to persist.");
    return {
      slug: target.slug,
      estateName: label,
      fetched: true,
      parseWarnings: raw.parseWarnings,
      priceStrategy: raw.priceStrategy,
      unitsBefore: before.units.length,
      unitsAfter: unitInputs.length,
      priceBefore: before.price,
      priceAfter: normalized.price ?? null,
      priceMaxBefore: before.priceMax,
      priceMaxAfter: normalized.priceMax ?? null,
      status: "dry-run",
    };
  }

  // ── Write ──────────────────────────────────────────────────────────────
  await prisma.listing.update({
    where: { id: target.id },
    data: {
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
      imageUrl: heroImage ?? null,
      dataCompleteness: normalized.dataCompleteness,
      dataQuality: quality.quality,
      lastSeenAt: new Date(),
    },
  });

  // Units: delete stale, insert fresh
  await prisma.listingUnit.deleteMany({ where: { listingId: target.id } });
  for (const unit of unitInputs) {
    await prisma.listingUnit.create({
      data: {
        listingId: target.id,
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

  // Media: upsert (don't delete — preserve any manually curated rows)
  for (const m of mediaRows) {
    await prisma.listingMedia.upsert({
      where: { listingId_url: { listingId: target.id, url: m.url } },
      update: { sortOrder: m.sortOrder, mediaType: m.mediaType },
      create: {
        listingId: target.id,
        mediaType: m.mediaType,
        url: m.url,
        sortOrder: m.sortOrder,
        sourceUrl: m.sourceUrl,
      },
    });
  }

  // Audit: record the fresh parse so inspectListing sees it next time
  await prisma.listingSource.create({
    data: {
      listingId: target.id,
      sourceName: "28hse",
      sourceUrl: raw.sourceUrl,
      rawPayloadJson: JSON.stringify(raw),
      normalizedHash: hashNormalized(normalized),
    },
  });

  console.log(`  ✓ applied — DB now has ${unitInputs.length} unit(s)`);

  return {
    slug: target.slug,
    estateName: label,
    fetched: true,
    parseWarnings: raw.parseWarnings,
    priceStrategy: raw.priceStrategy,
    unitsBefore: before.units.length,
    unitsAfter: unitInputs.length,
    priceBefore: before.price,
    priceAfter: normalized.price ?? null,
    priceMaxBefore: before.priceMax,
    priceMaxAfter: normalized.priceMax ?? null,
    status: "applied",
  };
}

async function main(): Promise<void> {
  loadDotEnv();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set (.env or environment).");
    process.exit(1);
  }

  const apply = process.argv.includes("--apply");
  const targets = await resolveTargets();

  if (targets.length === 0) {
    console.error(
      "No targets. Provide SLUG=, SLUGS=, ID=, or ONLY_GAPS=1 (and optionally BATCH_LIMIT=)."
    );
    process.exit(2);
  }

  console.log(
    `\nReparse ${targets.length} listing(s) — mode: ${apply ? "APPLY (writes to DB)" : "dry-run (read-only)"}`
  );

  const logger = createLogger("reparseListing");
  const reports: ChangeReport[] = [];

  for (let i = 0; i < targets.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000));
    const report = await reparseOne(targets[i]!, apply, logger);
    reports.push(report);
  }

  // ── Summary table ────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(100));
  console.log(`SUMMARY (${apply ? "applied" : "dry-run"})`);
  console.log("═".repeat(100));
  const col = (s: string | number | undefined | null, w: number) =>
    String(s ?? "").slice(0, w).padEnd(w);
  console.log(
    [
      col("Slug", 24),
      col("Name", 22),
      col("Units Δ", 12),
      col("Price Δ (min)", 20),
      col("PriceStrategy", 16),
      col("Status", 10),
    ].join(" │ ")
  );
  console.log("─".repeat(100));
  for (const r of reports) {
    const delta = `${r.unitsBefore}→${r.unitsAfter}`;
    const priceDelta =
      r.priceBefore === r.priceAfter
        ? "(same)"
        : `${r.priceBefore ?? "—"}→${r.priceAfter ?? "—"}`;
    console.log(
      [
        col(r.slug, 24),
        col(r.estateName, 22),
        col(delta, 12),
        col(priceDelta, 20),
        col(r.priceStrategy, 16),
        col(r.status, 10),
      ].join(" │ ")
    );
  }
  console.log("─".repeat(100));

  const gained = reports.filter((r) => r.unitsAfter > r.unitsBefore).length;
  const lost = reports.filter((r) => r.unitsAfter < r.unitsBefore).length;
  const unchanged = reports.filter((r) => r.unitsAfter === r.unitsBefore).length;
  console.log(
    `  Gained room-types: ${gained}   Lost: ${lost}   Unchanged: ${unchanged}`
  );

  if (!apply) {
    console.log("\n  (Dry-run only — re-run with `--apply` to persist these changes.)");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
