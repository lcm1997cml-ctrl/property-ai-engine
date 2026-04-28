/**
 * Diagnostic: dump everything we have on a single listing, side-by-side with
 * what the crawler originally parsed. Answers the question:
 *
 *   “Does the search-card display match what the crawler actually found?”
 *
 * Why this exists
 * ---------------
 * The search card reads ListingUnit rows via listingService.getListingRoomTypes…
 * If ListingUnit is empty, the card falls back to Listing.bedrooms. Several
 * new-dev listings (Sierra Sea 1B期, Belgravia Place 2期, …) show a big price
 * range ($3M–$10M) that implies 1/2/3-room units exist, yet render only one
 * room line. This script shows exactly where that divergence happens:
 *
 *   1. Listing row (price range, bedrooms, saleableArea…)
 *   2. ListingUnit rows (what the card actually displays)
 *   3. The last parsed snapshot from ListingSource.rawPayloadJson:
 *        - raw.units (what the PARSER extracted at crawl time)
 *        - raw.parseWarnings (selectors that were missed)
 *        - raw.priceStrategy (how the price range got determined)
 *   4. A diff table: “parser found N room types, DB stored M rows”.
 *
 * Usage (from repo root):
 *   SLUG=sierra-sea-1b npx tsx crawler/scripts/inspectListing.ts
 *   NAME="Sierra Sea"  npx tsx crawler/scripts/inspectListing.ts
 *   ID=cl…             npx tsx crawler/scripts/inspectListing.ts
 *
 * Add `--json` for machine-readable output (full dump without truncation).
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
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

interface RawProjectUnitLike {
  rawLabel?: string;
  rawRoomCount?: string;
  rawSaleableArea?: string;
  rawSaleableAreaMax?: string;
  rawPrice?: string;
  rawPriceMax?: string;
  rawAvailability?: string;
  rawUnitCount?: string;
}

interface RawProjectDetailLike {
  rawName?: string;
  rawDistrict?: string;
  rawPriceFrom?: string;
  rawPriceTo?: string;
  rawSaleableAreaFrom?: string;
  rawSaleableAreaTo?: string;
  rawRoomSummary?: string;
  priceStrategy?: string;
  parseWarnings?: string[];
  units?: RawProjectUnitLike[];
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${(n / 10_000).toFixed(0)}萬 (${n.toLocaleString()})`;
}

function fmtArea(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n} ft²`;
}

async function main(): Promise<void> {
  loadDotEnv();

  const wantJson = process.argv.includes("--json");
  const slug = process.env.SLUG?.trim();
  const id = process.env.ID?.trim();
  const name = process.env.NAME?.trim();

  if (!slug && !id && !name) {
    console.error(
      "Provide one of: SLUG=<slug>, ID=<cuid>, or NAME=<estate-name-fragment>"
    );
    process.exit(1);
  }

  // ── Locate the listing ──────────────────────────────────────────────────
  const where = id
    ? { id }
    : slug
      ? { slug }
      : {
          OR: [
            { estateName: { contains: name!, mode: "insensitive" as const } },
            { titleZh: { contains: name!, mode: "insensitive" as const } },
            { titleEn: { contains: name!, mode: "insensitive" as const } },
          ],
        };

  const listing = await prisma.listing.findFirst({
    where,
    include: {
      units: { orderBy: { roomCount: "asc" } },
      sources: { orderBy: { crawledAt: "desc" }, take: 1 },
    },
  });

  if (!listing) {
    console.error(`No listing found for ${JSON.stringify({ slug, id, name })}`);
    process.exit(2);
  }

  if (wantJson) {
    // Dump everything verbatim (including raw payload)
    console.log(
      JSON.stringify(
        {
          listing: { ...listing, sources: undefined, units: undefined },
          units: listing.units,
          latestSource: listing.sources[0]
            ? {
                ...listing.sources[0],
                rawPayloadJson: listing.sources[0].rawPayloadJson
                  ? JSON.parse(listing.sources[0].rawPayloadJson)
                  : null,
              }
            : null,
        },
        null,
        2
      )
    );
    await prisma.$disconnect();
    return;
  }

  // ── Section 1: Listing row ──────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  ${listing.titleZh ?? listing.titleEn ?? listing.estateName}`);
  console.log(`  slug=${listing.slug}  id=${listing.id}`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`District:           ${listing.district}${listing.subDistrict ? " · " + listing.subDistrict : ""}`);
  console.log(`Developer:          ${listing.developer ?? "—"}`);
  console.log(`Status:             ${listing.status}   completeness=${listing.dataCompleteness}   quality=${listing.dataQuality}`);
  console.log(`Source URL:         ${listing.sourceUrl ?? "—"}`);
  console.log("");
  console.log(`Listing.price:        ${fmtMoney(listing.price)}`);
  console.log(`Listing.priceMax:     ${fmtMoney(listing.priceMax)}`);
  console.log(`Listing.saleableArea: ${fmtArea(listing.saleableArea)}`);
  console.log(`Listing.bedrooms:     ${listing.bedrooms}`);

  // ── Section 2: ListingUnit rows (what the card renders) ────────────────
  console.log("\n───────────────────────────────────────────────────────────────");
  console.log(`ListingUnit rows in DB (what 戶型一覽 renders): ${listing.units.length}`);
  console.log("───────────────────────────────────────────────────────────────");
  if (listing.units.length === 0) {
    console.log("  (empty — card falls back to Listing.bedrooms + Listing.saleableArea)");
  } else {
    for (const u of listing.units) {
      const areaBit = u.saleableAreaMax && u.saleableAreaMax !== u.saleableArea
        ? `${u.saleableArea ?? "—"}–${u.saleableAreaMax} ft²`
        : fmtArea(u.saleableArea);
      const priceBit = u.priceMax && u.priceMax !== u.price
        ? `${fmtMoney(u.price)} – ${fmtMoney(u.priceMax)}`
        : fmtMoney(u.price);
      console.log(
        `  [${u.roomCount}房] ${u.unitLabel ?? "?"}  ${areaBit}  ${priceBit}  avail=${u.availability}  count=${u.unitCount ?? "?"}`
      );
    }
  }

  // ── Section 3: Latest parser snapshot ──────────────────────────────────
  const latest = listing.sources[0];
  console.log("\n───────────────────────────────────────────────────────────────");
  console.log("Latest crawler snapshot (ListingSource.rawPayloadJson)");
  console.log("───────────────────────────────────────────────────────────────");
  if (!latest) {
    console.log("  (no ListingSource rows — listing was never routed through the detail crawler,");
    console.log("   or sources were pruned. Run reparseListing.ts to refresh.)");
  } else if (!latest.rawPayloadJson) {
    console.log(`  (source exists but rawPayloadJson is empty; crawledAt=${latest.crawledAt.toISOString()})`);
  } else {
    let raw: RawProjectDetailLike;
    try {
      raw = JSON.parse(latest.rawPayloadJson) as RawProjectDetailLike;
    } catch (e) {
      console.log(`  (could not parse rawPayloadJson: ${(e as Error).message})`);
      await prisma.$disconnect();
      return;
    }

    console.log(`crawledAt:          ${latest.crawledAt.toISOString()}`);
    console.log(`rawName:            ${raw.rawName ?? "—"}`);
    console.log(`rawDistrict:        ${raw.rawDistrict ?? "—"}`);
    console.log(`rawPriceFrom:       ${raw.rawPriceFrom ?? "—"}`);
    console.log(`rawPriceTo:         ${raw.rawPriceTo ?? "—"}`);
    console.log(`rawSaleableAreaFrom:${raw.rawSaleableAreaFrom ?? "—"}`);
    console.log(`rawSaleableAreaTo:  ${raw.rawSaleableAreaTo ?? "—"}`);
    console.log(`rawRoomSummary:     ${raw.rawRoomSummary ?? "—"}`);
    console.log(`priceStrategy:      ${raw.priceStrategy ?? "—"}`);

    if (raw.parseWarnings && raw.parseWarnings.length > 0) {
      console.log(`parseWarnings (${raw.parseWarnings.length}):`);
      for (const w of raw.parseWarnings) console.log(`  • ${w}`);
    } else {
      console.log("parseWarnings:      (none)");
    }

    const parserUnits = raw.units ?? [];
    console.log("");
    console.log(`Parser extracted ${parserUnits.length} unit(s):`);
    if (parserUnits.length === 0) {
      console.log("  (none — parser found no room-type buttons in the page)");
    } else {
      for (const u of parserUnits) {
        console.log(
          `  [${u.rawRoomCount ?? "?"}] ${u.rawLabel ?? "?"}  area=${u.rawSaleableArea ?? "—"}${u.rawSaleableAreaMax ? "–" + u.rawSaleableAreaMax : ""}  price=${u.rawPrice ?? "—"}${u.rawPriceMax ? "–" + u.rawPriceMax : ""}  avail=${u.rawAvailability ?? "—"}  count=${u.rawUnitCount ?? "—"}`
        );
      }
    }

    // ── Section 4: parser vs DB diff ─────────────────────────────────────
    console.log("\n───────────────────────────────────────────────────────────────");
    console.log("Parser vs DB — where did the data go?");
    console.log("───────────────────────────────────────────────────────────────");
    console.log(`  parser.units.length = ${parserUnits.length}`);
    console.log(`  DB.listingUnit rows = ${listing.units.length}`);

    if (parserUnits.length > listing.units.length) {
      console.log("  ⚠  parser found more room types than the DB stored.");
      console.log("     → Most likely cause: the crawl that created the DB rows ran against an");
      console.log("        older parser, OR the normalizer rejected some entries. Re-run");
      console.log("        `npx tsx crawler/scripts/reparseListing.ts SLUG=" + listing.slug + "`");
      console.log("        to refresh ListingUnit from the current parser output.");
    } else if (parserUnits.length === 0 && listing.units.length === 0) {
      console.log("  ⚠  neither parser nor DB has room-type rows.");
      console.log("     → The 28hse page structure may differ for this listing (no");
      console.log("        #roomtype_segment_result buttons). Inspect the source URL directly.");
    } else if (parserUnits.length === listing.units.length) {
      console.log("  ✓  parser and DB agree on the number of room types.");
    }
  }

  console.log("");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
