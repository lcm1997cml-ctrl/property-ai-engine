/**
 * Backfill descriptionZh by re-fetching the Traditional Chinese 28hse page
 * for every listing that currently lacks it.
 *
 * Why: historically the crawler ingested from `/en/new-properties/{slug}`
 * (English page) and stored that as `description`. Chinese content was only
 * fetched opportunistically via `fetchChineseTitle`, which — depending on
 * version — may not have extracted the Chinese description at all. Result:
 * many legacy listings have English text in `description` and NULL in
 * `descriptionZh`, so the Chinese UI has nothing to show.
 *
 * 28hse locale URL map (confirmed via hreflang tags):
 *   /en/new-properties/{slug}   → English
 *   /new-properties/{slug}      → Traditional Chinese (zh-Hant)   ← what we want
 *   /cn/new-properties/{slug}   → Simplified Chinese (zh-Hans)
 *
 * This script visits /new-properties/{slug} per listing, extracts the Chinese
 * description from `.column.intro`, and writes it into Listing.descriptionZh.
 * It does NOT touch `description` (English stays put as a fallback).
 *
 * Usage (from repo root):
 *   npx tsx crawler/scripts/backfillChineseDescriptions.ts            # dry-run
 *   npx tsx crawler/scripts/backfillChineseDescriptions.ts --apply    # write
 *
 * Optional env:
 *   BATCH_LIMIT   max number of listings to process (default: all)
 *   REFETCH_ALL   "1" → also re-visit listings that already have descriptionZh
 *                 (useful if you want to refresh stale Chinese text)
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fetchChineseTitle } from "../utils/chineseTitle";
import { createLogger } from "../utils/logging";
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

/**
 * Extract the 28hse slug component out of a stored sourceUrl. The sourceUrl
 * shape is `https://www.28hse.com/en/new-properties/{slug}` (with optional
 * trailing slash / query). We strip everything up to `/en/new-properties/`.
 */
function hseSlugFromSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = "/en/new-properties/";
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const tail = url.slice(idx + marker.length).split("?")[0] ?? "";
  const slug = tail.replace(/\/+$/, "");
  return slug || null;
}

async function main(): Promise<void> {
  loadDotEnv();

  const apply = process.argv.includes("--apply");
  const refetchAll = process.env.REFETCH_ALL === "1";
  const batchLimit = process.env.BATCH_LIMIT
    ? parseInt(process.env.BATCH_LIMIT, 10)
    : undefined;

  const logger = createLogger("backfillChineseDescriptions");
  logger.info("Starting Chinese description backfill", {
    apply,
    refetchAll,
    batchLimit,
  });

  const listings = await prisma.listing.findMany({
    where: {
      sourceUrl: { not: null },
      ...(refetchAll ? {} : { descriptionZh: null }),
    },
    select: {
      id: true,
      slug: true,
      estateName: true,
      sourceUrl: true,
      descriptionZh: true,
    },
    ...(batchLimit ? { take: batchLimit } : {}),
    orderBy: { createdAt: "asc" },
  });

  console.log(`\nFound ${listings.length} listings to process`);
  console.log(`Mode: ${apply ? "APPLY (writing)" : "DRY-RUN (no writes)"}`);
  console.log(
    `Selector: ${refetchAll ? "ALL listings" : "only descriptionZh IS NULL"}\n`
  );

  let filled = 0;
  let noChinese = 0;
  let noSlug = 0;
  let errored = 0;

  for (let i = 0; i < listings.length; i++) {
    const l = listings[i]!;
    const hseSlug = hseSlugFromSourceUrl(l.sourceUrl);

    if (!hseSlug) {
      noSlug++;
      logger.warn("Cannot derive hseSlug from sourceUrl", {
        slug: l.slug,
        sourceUrl: l.sourceUrl,
      });
      continue;
    }

    // Rate-limit: 2s gap between listings (matches backfillChineseTitles)
    if (i > 0) await new Promise((r) => setTimeout(r, 2000));

    let chineseResult;
    try {
      chineseResult = await fetchChineseTitle(hseSlug, logger);
    } catch (err) {
      errored++;
      logger.warn("Chinese fetch threw", {
        slug: l.slug,
        hseSlug,
        err: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const descZh = chineseResult?.descriptionZh?.trim();
    if (!descZh) {
      noChinese++;
      console.log(
        `[${i + 1}/${listings.length}] ${l.estateName} (${hseSlug}) — no Chinese description extracted`
      );
      continue;
    }

    const preview = descZh.slice(0, 40).replace(/\s+/g, " ");
    console.log(
      `[${i + 1}/${listings.length}] ${l.estateName} → descriptionZh (${descZh.length} chars): "${preview}…"`
    );

    if (apply) {
      await prisma.listing.update({
        where: { id: l.id },
        data: { descriptionZh: descZh },
      });
    }
    filled++;
  }

  console.log(
    `\nDone: ${filled} filled, ${noChinese} no Chinese found, ${noSlug} no slug, ${errored} errored`
  );
  if (!apply) {
    console.log("Re-run with --apply to actually write.\n");
  } else {
    console.log("");
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
