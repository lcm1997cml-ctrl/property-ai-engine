/**
 * Job: Crawl 28Hse new-project list pages.
 *
 * This job:
 * 1. Fetches all list pages
 * 2. Parses project summaries (name + detail URL) from each page
 * 3. Saves the list of detail URLs to the DB (as pending crawl items)
 * 4. Logs a CrawlJob record
 *
 * Run this before crawlProjectDetailsJob to populate the queue of detail pages.
 *
 * List surface: https://www.28hse.com/en/new-properties/ (see 28hseNewProjectsFetcher).
 */

import { fetchNewProjectsListPages } from "../fetchers/28hseNewProjectsFetcher";
import { parseAllListPages } from "../parsers/28hseNewProjectsParser";
import { createLogger } from "../utils/logging";
import { prisma } from "@/lib/db";

const JOB_NAME = "crawlNewProjects";

export async function crawlNewProjectsJob(): Promise<{
  found: number;
  jobId: string;
}> {
  const logger = createLogger(JOB_NAME);
  logger.info("Job started");

  // ── Create job record ──────────────────────────────────────────────────────
  const job = await prisma.crawlJob.create({
    data: { jobName: JOB_NAME, status: "running", startedAt: new Date() },
  });

  try {
    // ── Fetch list pages ───────────────────────────────────────────────────
    const pages = await fetchNewProjectsListPages(logger, 20);
    logger.info(`Fetched ${pages.length} list pages`);

    // ── Parse summaries ────────────────────────────────────────────────────
    const summaries = parseAllListPages(pages, logger);
    logger.info(`Found ${summaries.length} unique project detail URLs`);

    // ── Persist detail URLs for the detail crawler job ─────────────────────
    // We upsert stub listings keyed by sourceUrl so the detail job can pick them up.
    // The detail job will fill in all the real fields.
    let inserted = 0;
    for (const summary of summaries) {
      // Check if a listing with this sourceUrl already exists
      const existing = await prisma.listingSource.findFirst({
        where: { sourceUrl: summary.detailUrl },
      });
      if (existing) {
        logger.debug("Skipping already-known detail URL", { url: summary.detailUrl });
        continue;
      }

      // Create a placeholder listing row so we can attach a source record
      const slug = summary.rawName
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 80);

      const uniqueSlug = `${slug}-${Date.now()}-${inserted}`;

      const listing = await prisma.listing.upsert({
        where: { slug: uniqueSlug },
        update: { lastSeenAt: new Date() },
        create: {
          slug: uniqueSlug,
          estateName: summary.rawName,
          district: summary.rawDistrict ?? "待確認",
          price: 0,       // placeholder — will be filled by detail crawler
          saleableArea: 0, // placeholder
          psf: 0,          // placeholder
          bedrooms: 0,     // placeholder
          status: "pending_detail_crawl",
          source: "28hse",
          sourceUrl: summary.detailUrl,
          sourceType: "new",
          comparisonRole: "primary",
          tags: [],
        },
      });

      await prisma.listingSource.create({
        data: {
          listingId: listing.id,
          sourceName: "28hse",
          sourceUrl: summary.detailUrl,
          rawPayloadJson: JSON.stringify(summary),
        },
      });

      inserted++;
    }

    logger.info(`Inserted ${inserted} new detail URL stubs`);

    // ── Update job record ──────────────────────────────────────────────────
    await prisma.crawlJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        recordsFound: summaries.length,
        recordsInserted: inserted,
      },
    });

    logger.info("Job completed", { found: summaries.length, inserted });
    return { found: summaries.length, jobId: job.id };
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
