/**
 * Diagnostic: list every new-development listing that has zero ListingUnit
 * rows. These are the listings whose search card falls back to the listing-
 * level bedrooms (compare page behaviour) because the parser never produced
 * a per-room-type breakdown.
 *
 * Typical symptom (observed with Sierra Sea 1B期 / Belgravia Place 2期):
 *   - Compare page shows "1房" (from Listing.bedrooms)
 *   - Search card shows "戶型一覽 · 詳細戶型整理中" (from empty units[])
 *
 * The fix is upstream in the 28hse detail parser (or a re-crawl). This
 * script tells you which listings to prioritise.
 *
 * Usage (from repo root):
 *   npx tsx crawler/scripts/listUnitsGaps.ts                # brief summary
 *   npx tsx crawler/scripts/listUnitsGaps.ts --csv          # machine-readable
 *   npx tsx crawler/scripts/listUnitsGaps.ts --detail       # include price/area
 *
 * Optional env:
 *   DISTRICT   only list listings in a specific district (e.g. DISTRICT=啟德)
 *   LIMIT      cap the number of rows printed (default: all)
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

async function main(): Promise<void> {
  loadDotEnv();

  const csv = process.argv.includes("--csv");
  const detail = process.argv.includes("--detail");
  const districtFilter = process.env.DISTRICT?.trim() || undefined;
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : undefined;

  // Pull every new-development listing, then filter in JS to those with
  // no ListingUnit rows. This keeps the query simple without needing a
  // raw relation-count Prisma call.
  const listings = await prisma.listing.findMany({
    where: {
      sourceType: "new",
      status: { in: ["active", "sold_out"] },
      ...(districtFilter ? { district: districtFilter } : {}),
    },
    select: {
      id: true,
      slug: true,
      estateName: true,
      titleZh: true,
      district: true,
      subDistrict: true,
      bedrooms: true,
      saleableArea: true,
      price: true,
      priceMax: true,
      status: true,
      dataCompleteness: true,
      sourceUrl: true,
      units: {
        select: { id: true },
      },
    },
    orderBy: [{ district: "asc" }, { estateName: "asc" }],
  });

  const gaps = listings.filter((l) => l.units.length === 0);
  const capped = limit ? gaps.slice(0, limit) : gaps;

  if (csv) {
    console.log(
      "slug,estateName,titleZh,district,subDistrict,bedrooms,saleableArea,price,priceMax,status,dataCompleteness,sourceUrl"
    );
    for (const l of capped) {
      const row = [
        l.slug,
        l.estateName,
        l.titleZh ?? "",
        l.district,
        l.subDistrict ?? "",
        l.bedrooms,
        l.saleableArea ?? "",
        l.price ?? "",
        l.priceMax ?? "",
        l.status,
        l.dataCompleteness,
        l.sourceUrl ?? "",
      ];
      // naive csv escape — these fields don't usually contain commas, but
      // wrap the ones that might just in case
      console.log(
        row
          .map((v) =>
            typeof v === "string" && (v.includes(",") || v.includes('"'))
              ? `"${v.replace(/"/g, '""')}"`
              : String(v)
          )
          .join(",")
      );
    }
    return;
  }

  console.log(`\n${gaps.length} new-development listings have 0 ListingUnit rows`);
  if (districtFilter) console.log(`Filter: district = ${districtFilter}`);
  if (limit) console.log(`Showing first ${capped.length} (LIMIT=${limit})`);
  console.log("");

  // Group by district for easier scanning
  const byDistrict = new Map<string, typeof capped>();
  for (const l of capped) {
    if (!byDistrict.has(l.district)) byDistrict.set(l.district, []);
    byDistrict.get(l.district)!.push(l);
  }

  for (const [district, rows] of [...byDistrict.entries()].sort()) {
    console.log(`【${district}】 ${rows.length}`);
    for (const l of rows) {
      const displayName = l.titleZh ?? l.estateName;
      const badge =
        l.status === "sold_out"
          ? " [售罄]"
          : l.dataCompleteness === "partial"
            ? " [未開價]"
            : "";
      if (detail) {
        // Null-safe price formatting.
        //
        // Both `l.price` and `l.priceMax` are nullable on the Prisma row
        // (schema: `Int?`). We never cast or default — missing data stays
        // missing, mirroring the same rule the production listing card uses.
        //
        // Logic:
        //   1. partial record OR price is null → "售價待公布"
        //   2. price + priceMax both present  → "$X萬–$Y萬"
        //   3. only price present              → "$X萬起"
        const priceBit =
          l.dataCompleteness === "partial" || l.price == null
            ? "售價待公布"
            : l.priceMax != null
              ? `$${(l.price / 10_000).toFixed(0)}萬–$${(l.priceMax / 10_000).toFixed(0)}萬`
              : `$${(l.price / 10_000).toFixed(0)}萬起`;
        const areaBit = l.saleableArea ? `${l.saleableArea}呎²` : "面積待更新";
        console.log(
          `  - ${displayName}${badge}  | ${l.bedrooms}房 · ${areaBit} · ${priceBit}  | slug=${l.slug}`
        );
      } else {
        console.log(`  - ${displayName}${badge}  (${l.bedrooms}房, slug=${l.slug})`);
      }
    }
    console.log("");
  }

  const totalListings = listings.length;
  const gapPct = totalListings > 0 ? ((gaps.length / totalListings) * 100).toFixed(1) : "0";
  console.log(
    `Summary: ${gaps.length} / ${totalListings} new-dev listings (${gapPct}%) need ListingUnit backfill`
  );
  console.log("");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
