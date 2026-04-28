/**
 * Job: Crawl and normalize 28Hse project detail pages.
 *
 * This job:
 * 1. Finds listings with status "pending_detail_crawl" in the DB
 * 2. Fetches each detail page
 * 3. Parses structured fields from the HTML
 * 4. Normalizes parsed data
 * 5. Upserts the listing with real data (or updates if already exists)
 * 6. Saves units and media
 * 7. Deduplicates via normalized_hash
 * 8. Logs a CrawlJob record
 */

import { fetchProjectDetailPage } from "../fetchers/28hseProjectDetailFetcher";
import { parseProjectDetailPage } from "../parsers/28hseProjectDetailParser";
import { normalizeProject } from "../normalizers/normalizeProject";
import { normalizeUnits } from "../normalizers/normalizeUnit";
import { normalizeMedia } from "../normalizers/normalizeMedia";
import { hashNormalized, slugify } from "../utils/hashing";
import { createLogger } from "../utils/logging";
import { fetchChineseTitle } from "../utils/chineseTitle";
import { prisma } from "@/lib/db";

const JOB_NAME = "crawlProjectDetails";

interface JobResult {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  jobId: string;
}

export async function crawlProjectDetailsJob(
  /** Max number of detail pages to process in a single run (default: 50) */
  batchSize = 50
): Promise<JobResult> {
  const logger = createLogger(JOB_NAME);
  logger.info("Job started", { batchSize });

  const job = await prisma.crawlJob.create({
    data: { jobName: JOB_NAME, status: "running", startedAt: new Date() },
  });

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  try {
    // ── Find listings pending detail crawl ─────────────────────────────────
    const pending = await prisma.listing.findMany({
      where: { status: "pending_detail_crawl", sourceUrl: { not: null } },
      take: batchSize,
      orderBy: { createdAt: "asc" },
    });

    logger.info(`Found ${pending.length} listings pending detail crawl`);

    for (const stub of pending) {
      if (!stub.sourceUrl) continue;
      processed++;

      // ── Fetch detail page ────────────────────────────────────────────────
      const page = await fetchProjectDetailPage(stub.sourceUrl, logger);
      if (!page) {
        logger.warn("Skipping — fetch failed", { url: stub.sourceUrl });
        skipped++;
        continue;
      }

      // ── Parse ────────────────────────────────────────────────────────────
      const raw = parseProjectDetailPage(page, logger);

      // ── Normalize ────────────────────────────────────────────────────────
      const normalized = normalizeProject(raw);
      if (!normalized) {
        logger.warn("Skipping — normalization failed (missing required fields)", {
          url: stub.sourceUrl,
        });
        skipped++;
        // Mark as skipped so we don't retry repeatedly
        await prisma.listing.update({
          where: { id: stub.id },
          data: { status: "parse_failed" },
        });
        continue;
      }

      const hash = hashNormalized(normalized);

      // ── Deduplicate via hash ──────────────────────────────────────────────
      const existingSource = await prisma.listingSource.findFirst({
        where: { normalizedHash: hash },
      });
      if (existingSource) {
        logger.debug("No change detected — skipping update", { hash });
        await prisma.listing.update({
          where: { id: stub.id },
          data: { lastSeenAt: new Date() },
        });
        skipped++;
        continue;
      }

      // ── Ensure unique slug ────────────────────────────────────────────────
      const baseSlug = slugify(normalized.estateName);
      let slug = baseSlug;
      let collision = await prisma.listing.findFirst({
        where: { slug, NOT: { id: stub.id } },
      });
      let suffix = 1;
      while (collision) {
        slug = `${baseSlug}-${suffix++}`;
        collision = await prisma.listing.findFirst({
          where: { slug, NOT: { id: stub.id } },
        });
      }

      // ── Fetch Chinese project name (second step) ─────────────────────────
      const hseSlug = stub.sourceUrl.split("/en/new-properties/")[1]?.split("?")[0] ?? "";
      const chineseResult = hseSlug
        ? await fetchChineseTitle(hseSlug, logger)
        : null;

      const hasChinese = (s: string) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s);
      const titleZhToStore =
        chineseResult && hasChinese(chineseResult.titleZh) ? chineseResult.titleZh : null;

      if (!chineseResult) {
        logger.info("titleZh not found — storing null", { slug });
      } else if (!titleZhToStore) {
        logger.info("titleZh has no Chinese characters — discarding", {
          slug,
          titleZh: chineseResult.titleZh,
        });
      }

      // ── Upsert listing ────────────────────────────────────────────────────
      const isNew = stub.price === 0; // placeholder stub

      // Store English (from the main detail page) and Chinese (from the
      // zh-hk page, via chineseResult) into their dedicated columns. Frontend
      // does `descriptionZh ?? description`, so Chinese takes precedence
      // whenever we have it.
      //
      // We only write `descriptionZh` when we actually fetched a Chinese
      // description this run — otherwise we `undefined` the field so we don't
      // clobber any previously-stored Chinese text with NULL.
      const chineseDesc = chineseResult?.descriptionZh?.trim() || null;

      await prisma.listing.update({
        where: { id: stub.id },
        data: {
          slug,
          estateName: normalized.estateName,
          titleEn: normalized.estateName,
          titleZh: titleZhToStore,
          buildingName: normalized.buildingName,
          district: normalized.district,
          subDistrict: normalized.subDistrict,
          address: normalized.address,
          developer: normalized.developer,
          completionYear: normalized.completionYear,
          price: normalized.price,
          priceMax: normalized.priceMax,
          saleableArea: normalized.saleableArea,
          saleableAreaMax: normalized.saleableAreaMax,
          psf: normalized.psf,
          bedrooms: normalized.bedrooms,
          propertyType: normalized.propertyType,
          description: normalized.description ?? null,
          ...(chineseDesc ? { descriptionZh: chineseDesc } : {}),
          status: normalized.status,
          sourceType: normalized.sourceType,
          comparisonRole: normalized.comparisonRole,
          tags: normalized.tags,
          lastSeenAt: new Date(),
        },
      });

      if (isNew) inserted++;
      else updated++;

      // ── Upsert units ──────────────────────────────────────────────────────
      const units = normalizeUnits(raw.units, raw.sourceUrl);
      // Delete stale unit rows before re-inserting so re-runs stay idempotent
      await prisma.listingUnit.deleteMany({ where: { listingId: stub.id } });
      for (const unit of units) {
        await prisma.listingUnit.create({
          data: {
            listingId: stub.id,
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

      // ── Upsert media ──────────────────────────────────────────────────────
      const media = normalizeMedia(raw.media, raw.sourceUrl);
      for (const item of media) {
        await prisma.listingMedia.upsert({
          where: { listingId_url: { listingId: stub.id, url: item.url } },
          update: { sortOrder: item.sortOrder },
          create: {
            listingId: stub.id,
            mediaType: item.mediaType,
            url: item.url,
            sortOrder: item.sortOrder,
            sourceUrl: item.sourceUrl,
          },
        });
      }

      // ── Save source audit record ──────────────────────────────────────────
      await prisma.listingSource.create({
        data: {
          listingId: stub.id,
          sourceName: "28hse",
          sourceUrl: raw.sourceUrl,
          rawPayloadJson: JSON.stringify(raw),
          normalizedHash: hash,
        },
      });

      logger.info(`${isNew ? "Inserted" : "Updated"} listing`, {
        slug,
        district: normalized.district,
        price: normalized.price,
      });
    }

    await prisma.crawlJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        recordsFound: processed,
        recordsInserted: inserted,
        recordsUpdated: updated,
      },
    });

    logger.info("Job completed", { processed, inserted, updated, skipped });
    return { processed, inserted, updated, skipped, jobId: job.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Job failed", { err: msg });

    await prisma.crawlJob.update({
      where: { id: job.id },
      data: { status: "failed", finishedAt: new Date(), errorMessage: msg },
    });

    throw err;
  }
}
