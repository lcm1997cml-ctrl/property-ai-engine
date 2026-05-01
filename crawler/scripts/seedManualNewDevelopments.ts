/**
 * Seed manually-curated NEW developments that the 28Hse crawler hasn't
 * picked up yet (e.g. just-launched projects whose detail page is up but
 * which haven't appeared in the main /new-properties index).
 *
 * Each entry uses the SAME slug as 28Hse — so when the crawler eventually
 * crawls the project, the upsert will overwrite this manual entry with
 * authoritative scraped data. No cleanup needed.
 *
 * Why this exists:
 *   - 28Hse occasionally lags behind a project's market launch by days/weeks.
 *   - Operator wants the listing visible NOW so users searching the project
 *     name (e.g. "首匯") find it immediately.
 *
 * ⚠️ ACCURACY POLICY ⚠️
 *   Only enter data we can verify (developer site, news article, government
 *   pricelist). When pricelist isn't published yet, set dataCompleteness =
 *   "partial" and OMIT price fields rather than fabricating numbers.
 *
 * Usage:
 *   npx tsx crawler/scripts/seedManualNewDevelopments.ts
 *
 * Env:
 *   DRY_RUN=true   → log what would be written, write nothing
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

interface SeedUnit {
  bedrooms: number;            // 0 = studio
  saleableAreaMin: number;
  saleableAreaMax?: number;
  priceMin?: number;           // omit when pricelist not yet published
  priceMax?: number;
  unitCount?: number;
}

interface SeedNewDev {
  /** MUST match the 28Hse path so the crawler upsert collides cleanly. */
  slug: string;
  estateName: string;          // English / pinyin name (e.g. "Chester")
  titleZh: string;             // Chinese name (e.g. "首匯")
  buildingName?: string;
  district: string;            // canonical Chinese label (must match DISTRICT_MAP)
  subDistrict?: string;
  address?: string;
  developer?: string;
  completionYear?: number;
  /** "full" if pricelist published; "partial" if only area / room mix known. */
  dataCompleteness: "full" | "partial";
  /** "active" | "sold_out" | "pending_detail_crawl" */
  status?: string;
  descriptionZh: string;
  tags?: string[];
  units: SeedUnit[];
  /** Operator's verified source URL (28Hse / official site / news). */
  sourceUrl?: string;
}

// ─── Curated picks ───────────────────────────────────────────────────────────
//
// Each entry must cite a verifiable source. Update when official pricelist
// drops — then change dataCompleteness from "partial" → "full" and add prices.

const SEED: SeedNewDev[] = [
  {
    slug: "chester",
    estateName: "Chester",
    titleZh: "首匯",
    district: "紅磡",
    subDistrict: "紅磡南",
    address: "紅磡黃埔街8號",
    developer: "恒基兆業",
    completionYear: 2026,
    // Pricelist not yet published at time of seeding (per recent reports).
    // Once pricelist drops, edit this entry: dataCompleteness → "full",
    // and add priceMin/priceMax to each unit row.
    dataCompleteness: "partial",
    status: "active",
    descriptionZh:
      "首匯（CHESTER）係恒基兆業紅磡 MIDTOWN SOUTH 系列最新住宅項目，位於紅磡黃埔街8號，鄰近紅磡站、何文田站及黃埔站，部分單位享維港景。全盤共241伙，戶型由1房至4房，2房佔逾4成，預計2026年底入伙。",
    tags: ["新樓推薦", "近港鐵", "維港景", "三鐵交匯"],
    sourceUrl: "https://www.28hse.com/en/new-properties/chester",
    // Unit-type breakdown — areas verified from public reports; prices omitted
    // (partial). Conservative ranges; refine when pricelist lands.
    units: [
      { bedrooms: 1, saleableAreaMin: 265, saleableAreaMax: 320, unitCount: 60 },
      { bedrooms: 2, saleableAreaMin: 347, saleableAreaMax: 480, unitCount: 96 },
      { bedrooms: 3, saleableAreaMin: 500, saleableAreaMax: 650, unitCount: 50 },
      { bedrooms: 4, saleableAreaMin: 700, saleableAreaMax: 850, unitCount: 35 },
    ],
  },
];

// ─── Listing-level summary derived from units ────────────────────────────────

function deriveListingSummary(units: SeedUnit[], dataCompleteness: "full" | "partial"): {
  bedrooms: number;
  saleableArea: number;
  saleableAreaMax: number | null;
  price: number | null;
  priceMax: number | null;
  psf: number | null;
} {
  const sortedByArea = [...units].sort((a, b) => a.saleableAreaMin - b.saleableAreaMin);
  const headline = sortedByArea[0]!;
  const allMinAreas = units.map((u) => u.saleableAreaMin);
  const allMaxAreas = units.map((u) => u.saleableAreaMax ?? u.saleableAreaMin);
  const minArea = Math.min(...allMinAreas);
  const maxArea = Math.max(...allMaxAreas);

  // Prices only when published (full)
  const priced = units.filter((u): u is SeedUnit & { priceMin: number } =>
    typeof u.priceMin === "number" && u.priceMin > 0
  );
  const allMinPrices = priced.map((u) => u.priceMin);
  const allMaxPrices = priced.map((u) => u.priceMax ?? u.priceMin);
  const minPrice = priced.length > 0 ? Math.min(...allMinPrices) : null;
  const maxPrice = priced.length > 0 ? Math.max(...allMaxPrices) : null;
  const psf = minPrice && headline.saleableAreaMin > 0
    ? Math.round(minPrice / headline.saleableAreaMin)
    : null;

  return {
    bedrooms: headline.bedrooms,
    saleableArea: minArea,
    saleableAreaMax: maxArea !== minArea ? maxArea : null,
    price: dataCompleteness === "partial" ? null : minPrice,
    priceMax: dataCompleteness === "partial" ? null : maxPrice,
    psf,
  };
}

async function upsertEstate(seed: SeedNewDev): Promise<"created" | "updated"> {
  const summary = deriveListingSummary(seed.units, seed.dataCompleteness);
  const existing = await prisma.listing.findUnique({ where: { slug: seed.slug } });

  // If the row was last touched by the 28Hse crawler, DON'T overwrite —
  // the crawled data is authoritative. We only seed when the listing
  // doesn't exist yet OR the existing row is also operator-managed.
  if (existing && existing.source !== "manual") {
    console.log(
      `  → ${seed.titleZh} already crawled (source=${existing.source}) — skipping`
    );
    return "updated";
  }

  const data = {
    estateName: seed.estateName,
    titleEn: seed.estateName,
    titleZh: seed.titleZh,
    buildingName: seed.buildingName ?? null,
    district: seed.district,
    subDistrict: seed.subDistrict ?? null,
    address: seed.address ?? null,
    price: summary.price,
    priceMax: summary.priceMax,
    saleableArea: summary.saleableArea,
    saleableAreaMax: summary.saleableAreaMax,
    psf: summary.psf,
    bedrooms: summary.bedrooms,
    bathrooms: null,
    propertyType: "住宅",
    floor: null,
    facing: null,
    age: null,
    completionYear: seed.completionYear ?? null,
    developer: seed.developer ?? null,
    description: seed.descriptionZh,
    descriptionZh: seed.descriptionZh,
    source: "manual",
    sourceUrl: seed.sourceUrl ?? null,
    sourceType: "new",
    comparisonRole: "primary",
    isFeatured: false,
    tags: seed.tags ?? [],
    status: seed.status ?? "active",
    dataCompleteness: seed.dataCompleteness,
    dataQuality: "normal",
    lastSeenAt: new Date(),
  };

  await prisma.listing.upsert({
    where: { slug: seed.slug },
    update: data,
    create: { slug: seed.slug, ...data },
  });

  // Replace the manual unit rows; never touch crawler-owned rows
  const listing = await prisma.listing.findUnique({
    where: { slug: seed.slug },
    select: { id: true },
  });
  if (!listing) return existing ? "updated" : "created";

  await prisma.listingUnit.deleteMany({
    where: { listingId: listing.id, sourceUrl: "seed:manual-new" },
  });

  for (const u of seed.units) {
    const psf = u.priceMin && u.saleableAreaMin > 0
      ? Math.round(u.priceMin / u.saleableAreaMin)
      : null;
    const labelMap: Record<number, string> = { 0: "開放式", 1: "1房", 2: "2房", 3: "3房" };
    const label = u.bedrooms >= 4 ? "4房或以上" : labelMap[u.bedrooms] ?? `${u.bedrooms}房`;
    await prisma.listingUnit.create({
      data: {
        listingId: listing.id,
        unitLabel: label,
        roomCount: u.bedrooms,
        saleableArea: u.saleableAreaMin,
        saleableAreaMax: u.saleableAreaMax ?? null,
        price: u.priceMin ?? null,
        priceMax: u.priceMax && u.priceMin && u.priceMax !== u.priceMin ? u.priceMax : null,
        pricePerSqft: psf,
        unitCount: u.unitCount ?? null,
        availability: "available",
        sourceUrl: "seed:manual-new",
      },
    });
  }

  return existing ? "updated" : "created";
}

async function main(): Promise<void> {
  loadDotEnv();
  const dryRun = process.env.DRY_RUN === "true";

  const totalUnits = SEED.reduce((acc, s) => acc + s.units.length, 0);
  console.log(
    `\n[seedManualNewDevelopments] ${dryRun ? "DRY-RUN — " : ""}` +
      `Seeding ${SEED.length} manual new-dev entries (${totalUnits} unit rows)\n`
  );

  if (dryRun) {
    for (const s of SEED) {
      console.log(`\n  ${s.titleZh}（${s.estateName}） — ${s.district}`);
      console.log(`    address: ${s.address ?? "—"}`);
      console.log(`    developer: ${s.developer ?? "—"}`);
      console.log(`    completion: ${s.completionYear ?? "—"}`);
      console.log(`    dataCompleteness: ${s.dataCompleteness}`);
      for (const u of s.units) {
        const areaTxt = u.saleableAreaMax
          ? `${u.saleableAreaMin}–${u.saleableAreaMax}呎`
          : `${u.saleableAreaMin}呎`;
        const priceTxt = u.priceMin
          ? `HK$${(u.priceMin / 1e6).toFixed(1)}M${u.priceMax ? `–${(u.priceMax / 1e6).toFixed(1)}M` : ""}`
          : "(price 待公布)";
        console.log(`    • ${u.bedrooms}房  ${areaTxt}  ${priceTxt}  · ${u.unitCount ?? "?"}伙`);
      }
    }
    console.log("\n[DRY-RUN] no DB writes performed.\n");
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  let updated = 0;
  for (const seed of SEED) {
    try {
      const result = await upsertEstate(seed);
      if (result === "created") created++;
      else updated++;
      console.log(
        `  ✓ ${result === "created" ? "+" : "~"} ${seed.titleZh}  (${seed.district})`
      );
    } catch (err) {
      console.error(
        `  ✗ failed: ${seed.titleZh}`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `\n[seedManualNewDevelopments] Done — created ${created}, updated ${updated}\n`
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
