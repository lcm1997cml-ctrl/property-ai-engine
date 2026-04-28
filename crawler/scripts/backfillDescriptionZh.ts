/**
 * Backfill descriptionZh for listings ingested before the crawler started
 * populating it.
 *
 * Background: before this fix, both crawler entry points (crawlProjectDetailsJob
 * and batchIngestNewDevelopments) stored "Chinese if available, otherwise
 * English" into the single `description` column and never wrote descriptionZh.
 * The frontend reads `descriptionZh ?? description`, so listings whose original
 * ingest grabbed English text display English. Re-crawling is one fix — this
 * script is the non-destructive alternative:
 *
 *   For every listing where descriptionZh IS NULL and description contains CJK
 *   characters, copy description → descriptionZh. We never clear `description`
 *   (so English fallback still works after future re-crawls).
 *
 * Usage (from repo root):
 *   npx tsx crawler/scripts/backfillDescriptionZh.ts           # dry-run
 *   npx tsx crawler/scripts/backfillDescriptionZh.ts --apply   # actually write
 *
 * Optional env:
 *   BATCH_LIMIT   max number of listings to process (default: all)
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
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
 * True if the string contains at least one CJK Unified Ideograph.
 * Range covers the main Han block plus common extensions — good enough to
 * distinguish "this looks Chinese" from "this is English".
 */
function containsCjk(s: string): boolean {
  // Basic CJK + Extension A + Extension B (via surrogate pair approximation)
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(s);
}

/**
 * Rough ratio of CJK chars to total non-whitespace chars. Used to decide
 * whether a description is "mostly Chinese" vs "mostly English with one stray
 * character" (e.g. "The 駿 building"). We only migrate rows clearly written
 * in Chinese.
 */
function cjkRatio(s: string): number {
  const compact = s.replace(/\s+/g, "");
  if (compact.length === 0) return 0;
  const matches = compact.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g);
  return (matches?.length ?? 0) / compact.length;
}

async function main(): Promise<void> {
  loadDotEnv();

  const apply = process.argv.includes("--apply");
  const batchLimit = process.env.BATCH_LIMIT
    ? parseInt(process.env.BATCH_LIMIT, 10)
    : undefined;

  const logger = createLogger("backfillDescriptionZh");
  logger.info("Starting descriptionZh backfill", { apply, batchLimit });

  const listings = await prisma.listing.findMany({
    where: {
      descriptionZh: null,
      description: { not: null },
    },
    select: { id: true, slug: true, estateName: true, description: true },
    ...(batchLimit ? { take: batchLimit } : {}),
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `\nFound ${listings.length} listings with description but no descriptionZh`
  );
  console.log(`Mode: ${apply ? "APPLY (writing)" : "DRY-RUN (no writes)"}\n`);

  let migrated = 0;
  let skippedEnglish = 0;
  let skippedMixed = 0;

  for (let i = 0; i < listings.length; i++) {
    const l = listings[i]!;
    const desc = l.description ?? "";
    if (!containsCjk(desc)) {
      skippedEnglish++;
      continue;
    }

    // Require descriptions to be predominantly Chinese before migrating — a
    // stray single CJK char inside English text shouldn't become descriptionZh.
    const ratio = cjkRatio(desc);
    if (ratio < 0.3) {
      skippedMixed++;
      console.log(
        `[${i + 1}/${listings.length}] ${l.estateName} — skipped (CJK ratio ${ratio.toFixed(2)})`
      );
      continue;
    }

    const preview = desc.slice(0, 40).replace(/\s+/g, " ");
    console.log(
      `[${i + 1}/${listings.length}] ${l.estateName} → descriptionZh (${desc.length} chars): "${preview}…"`
    );

    if (apply) {
      await prisma.listing.update({
        where: { id: l.id },
        data: { descriptionZh: desc },
      });
    }
    migrated++;
  }

  console.log(
    `\nDone: ${migrated} migrated, ${skippedEnglish} English (skipped), ${skippedMixed} mixed (skipped)`
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
