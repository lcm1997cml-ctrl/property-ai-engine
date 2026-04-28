/**
 * Report which listings have structured room-type data
 * and which are still missing coverage.
 *
 * Usage:
 *   npx tsx scripts/reportRoomTypeCoverage.ts
 */

import { prisma } from "@/lib/db";

async function main() {
  const listings = await prisma.listing.findMany({
    where: { status: { in: ["active", "sold_out"] } },
    select: {
      id: true,
      slug: true,
      estateName: true,
      titleZh: true,
      district: true,
      dataCompleteness: true,
      dataQuality: true,
      _count: { select: { units: true } },
    },
    orderBy: [{ district: "asc" }, { estateName: "asc" }],
  });

  const withRoomTypes = listings.filter((l) => l._count.units > 0);
  const withoutRoomTypes = listings.filter((l) => l._count.units === 0);

  console.log("\n========================================");
  console.log(" Room-Type Coverage Report");
  console.log(`  ${new Date().toLocaleString("zh-HK")}`);
  console.log("========================================\n");

  console.log(`Total active/sold listings:   ${listings.length}`);
  console.log(`✅ With room-type data:        ${withRoomTypes.length}`);
  console.log(`❌ Missing room-type data:     ${withoutRoomTypes.length}`);
  console.log();

  if (withRoomTypes.length > 0) {
    console.log("────────────────────────────────────────");
    console.log(" ✅ Listings with room-type table data");
    console.log("────────────────────────────────────────");
    for (const l of withRoomTypes) {
      const name = l.titleZh ?? l.estateName;
      const flags = [
        l.dataCompleteness === "partial" ? "售價待公布" : "",
        l.dataQuality === "suspicious" ? "⚠ suspicious" : "",
      ]
        .filter(Boolean)
        .join(", ");
      console.log(
        `  [${l.district.padEnd(4)}] ${name.padEnd(20)}  ${l._count.units} types${flags ? `  (${flags})` : ""}`
      );
    }
    console.log();
  }

  if (withoutRoomTypes.length > 0) {
    console.log("────────────────────────────────────────");
    console.log(" ❌ Listings missing room-type data");
    console.log("────────────────────────────────────────");
    for (const l of withoutRoomTypes) {
      const name = l.titleZh ?? l.estateName;
      const flags = [
        l.dataCompleteness === "partial" ? "售價待公布" : "",
        l.dataQuality === "suspicious" ? "⚠ suspicious" : "",
      ]
        .filter(Boolean)
        .join(", ");
      console.log(
        `  [${l.district.padEnd(4)}] ${name.padEnd(20)}  /listing/${l.slug}${flags ? `  (${flags})` : ""}`
      );
    }
    console.log();
  }

  // Coverage by district
  const byDistrict = new Map<string, { total: number; covered: number }>();
  for (const l of listings) {
    if (!byDistrict.has(l.district)) byDistrict.set(l.district, { total: 0, covered: 0 });
    const d = byDistrict.get(l.district)!;
    d.total++;
    if (l._count.units > 0) d.covered++;
  }

  console.log("────────────────────────────────────────");
  console.log(" Coverage by district");
  console.log("────────────────────────────────────────");
  for (const [district, { total, covered }] of [...byDistrict.entries()].sort()) {
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
    const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
    console.log(`  ${district.padEnd(5)}  ${bar}  ${covered}/${total} (${pct}%)`);
  }
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
