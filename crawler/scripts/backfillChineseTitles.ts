/**
 * Backfill titleEn and titleZh for all listings that currently have NULL values.
 *
 * Usage (from repo root):
 *   npx tsx crawler/scripts/backfillChineseTitles.ts
 *
 * Optional env:
 *   BATCH_LIMIT   max number of listings to process (default: all)
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

async function main(): Promise<void> {
  loadDotEnv();

  const batchLimit = process.env.BATCH_LIMIT
    ? parseInt(process.env.BATCH_LIMIT, 10)
    : undefined;

  const logger = createLogger("backfillChineseTitles");
  logger.info("Starting Chinese title backfill", { batchLimit });

  const listings = await prisma.listing.findMany({
    where: {
      titleZh: null,
      sourceUrl: { not: null },
    },
    select: { id: true, slug: true, estateName: true, sourceUrl: true },
    ...(batchLimit ? { take: batchLimit } : {}),
    orderBy: { createdAt: "asc" },
  });

  console.log(`\nFound ${listings.length} listings missing titleZh\n`);

  let filled = 0;
  let failed = 0;

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i]!;
    const hseSlug =
      listing.sourceUrl?.split("/en/new-properties/")[1]?.split("?")[0] ?? "";

    if (!hseSlug) {
      logger.warn("Cannot derive hseSlug from sourceUrl", {
        slug: listing.slug,
        sourceUrl: listing.sourceUrl,
      });
      failed++;
      continue;
    }

    console.log(
      `[${i + 1}/${listings.length}] ${listing.estateName} (${hseSlug})`
    );

    // Rate-limit between requests
    if (i > 0) await new Promise((r) => setTimeout(r, 2000));

    const chineseResult = await fetchChineseTitle(hseSlug, logger);

    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        titleEn: listing.estateName,
        titleZh: chineseResult?.titleZh ?? null,
      },
    });

    if (chineseResult) {
      console.log(`  → titleZh = ${chineseResult.titleZh}`);
      filled++;
    } else {
      console.log(`  → titleZh not found (kept NULL)`);
      failed++;
    }
  }

  console.log(`\nDone: ${filled} filled, ${failed} not found / failed\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
