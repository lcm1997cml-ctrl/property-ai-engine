/**
 * One-time migration: normalize all English district names in the DB to Chinese.
 *
 * Usage (from repo root, DATABASE_URL in .env):
 *   npx tsx scripts/fixDistricts.ts
 *
 * What it does:
 *   1. Reads every listing from the DB (all statuses).
 *   2. Runs normalizeDistrict() on the stored district value.
 *   3. If the value changed, updates the record.
 *   4. Prints a summary and warns about any districts that remain unknown.
 */

import { PrismaClient } from "@prisma/client";
import { normalizeDistrict } from "../lib/districtCanonical";

const prisma = new PrismaClient();

async function main() {
  console.log("=== District normalization migration ===\n");

  const listings = await prisma.listing.findMany({
    select: { id: true, estateName: true, district: true, status: true },
  });

  console.log(`Found ${listings.length} listing(s) in DB.\n`);

  const updates: { id: string; from: string; to: string; name: string }[] = [];
  const unknowns: { id: string; district: string; name: string }[] = [];

  for (const row of listings) {
    const normalized = normalizeDistrict(row.district);

    if (normalized !== row.district) {
      updates.push({ id: row.id, from: row.district, to: normalized, name: row.estateName });
    }

    // Flag any result that looks like it's still English (ASCII-only, non-Chinese)
    if (/^[\x20-\x7E]+$/.test(normalized)) {
      unknowns.push({ id: row.id, district: normalized, name: row.estateName });
    }
  }

  if (updates.length === 0) {
    console.log("✓ No district updates needed — all values are already normalized.\n");
  } else {
    console.log(`Updating ${updates.length} listing(s):\n`);
    for (const u of updates) {
      console.log(`  [${u.id.slice(0, 8)}] ${u.name}: "${u.from}" → "${u.to}"`);
      await prisma.listing.update({
        where: { id: u.id },
        data: { district: u.to },
      });
    }
    console.log(`\n✓ Updated ${updates.length} listing(s).\n`);
  }

  if (unknowns.length > 0) {
    console.warn(`\n⚠️  ${unknowns.length} listing(s) still have unrecognized (non-Chinese) districts after normalization:`);
    for (const u of unknowns) {
      console.warn(`  [${u.id.slice(0, 8)}] ${u.name}: "${u.district}"`);
    }
    console.warn("\nAdd these to DISTRICT_MAP in lib/districtCanonical.ts and re-run this script.\n");
  } else {
    console.log("✓ All districts are now normalized to Chinese.\n");
  }

  // Print a final summary of distinct district values in DB
  const grouped = await prisma.listing.groupBy({
    by: ["district"],
    _count: { district: true },
    orderBy: { district: "asc" },
  });
  console.log("District distribution in DB after migration:");
  for (const g of grouped) {
    console.log(`  "${g.district}": ${g._count.district} listing(s)`);
  }
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
