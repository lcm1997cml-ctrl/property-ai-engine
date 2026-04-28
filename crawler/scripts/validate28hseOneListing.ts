/**
 * End-to-end validation: one 28Hse new-homes listing (list → detail → parse → normalize → DB).
 *
 * Usage (from repo root, DATABASE_URL in .env):
 *   npx tsx crawler/scripts/validate28hseOneListing.ts
 *
 * Optional env:
 *   VALIDATE_28HSE_LIST_URL   (default: https://www.28hse.com/en/new-properties/)
 *   VALIDATE_28HSE_DETAIL_SLUG (default: cloudview)
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fetchProjectDetailPage } from "../fetchers/28hseProjectDetailFetcher";
import { parseNewProjectsListPage } from "../parsers/28hseNewProjectsParser";
import { parseProjectDetailPage } from "../parsers/28hseProjectDetailParser";
import { normalizeProject } from "../normalizers/normalizeProject";
import { normalizeMedia } from "../normalizers/normalizeMedia";
import { createLogger } from "../utils/logging";
import { prisma } from "@/lib/db";
import type { NewProjectsListPage } from "../fetchers/28hseNewProjectsFetcher";

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function printSection(title: string, body: Record<string, unknown>): void {
  console.log(`\n── ${title} ──`);
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) {
      console.log(`${k}:`);
      v.slice(0, 15).forEach((item, i) => console.log(`  [${i}] ${item}`));
      if (v.length > 15) console.log(`  ... (${v.length} total)`);
    } else {
      console.log(`${k}: ${v === undefined ? "(undefined)" : String(v)}`);
    }
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const logger = createLogger("validate28hseOneListing");

  const listUrlRaw =
    process.env.VALIDATE_28HSE_LIST_URL?.trim() || "https://www.28hse.com/en/new-properties/";
  const listUrl = listUrlRaw.replace(/\/?$/, "/");
  const targetSlug = (process.env.VALIDATE_28HSE_DETAIL_SLUG?.trim() || "cloudview").toLowerCase();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set (.env or environment).");
    process.exit(1);
  }

  console.log("Fetching list page:", listUrl);
  const { fetchHtml } = await import("../utils/request");
  const listHtml = await fetchHtml(listUrl, { rateDelayMs: 2000 });
  const listPage: NewProjectsListPage = {
    url: listUrl,
    html: listHtml,
    pageNumber: 1,
    fetchedAt: new Date().toISOString(),
  };

  const { projects, hasProjects } = parseNewProjectsListPage(listPage, logger);
  if (!hasProjects) {
    console.error("List parser found no projects — check selectors / URL.");
    process.exit(1);
  }

  const summary =
    projects.find((p) => p.detailUrl.toLowerCase().includes(`/${targetSlug}`)) ?? projects[0];

  console.log("\nUsing list card:", summary.rawName, "→", summary.detailUrl);

  const detailPage = await fetchProjectDetailPage(summary.detailUrl, logger);
  if (!detailPage) {
    console.error("Detail fetch failed.");
    process.exit(1);
  }

  const raw = parseProjectDetailPage(detailPage, logger);

  printSection("Parsed fields (verification)", {
    title: raw.rawName,
    district: raw.rawDistrict,
    area: raw.rawAddress ?? raw.rawDistrict,
    price_from: raw.rawPriceFrom,
    price_to: raw.rawPriceTo,
    room_summary: raw.rawRoomSummary,
    saleable_area_from: raw.rawSaleableAreaFrom,
    saleable_area_to: raw.rawSaleableAreaTo,
    developer: raw.rawDeveloper,
    media_urls: raw.media.map((m) => m.url),
    source_url: raw.sourceUrl,
    parse_warnings: raw.parseWarnings,
  });

  const normalized = normalizeProject(raw);
  if (!normalized) {
    console.error("Normalizer returned null (missing name or price_from).");
    process.exit(1);
  }

  printSection("Normalized (DB-ready)", {
    slug: normalized.slug,
    estateName: normalized.estateName,
    district: normalized.district,
    subDistrict: normalized.subDistrict,
    price: normalized.price,
    priceMax: normalized.priceMax,
    saleableArea: normalized.saleableArea,
    saleableAreaMax: normalized.saleableAreaMax,
    psf: normalized.psf,
    bedrooms: normalized.bedrooms,
    developer: normalized.developer,
    status: normalized.status,
  });

  const mediaRows = normalizeMedia(raw.media, raw.sourceUrl);
  const heroImage =
    mediaRows.find((m) => m.mediaType === "image" && /\.(jpe?g|webp|png)$/i.test(m.url))?.url ??
    mediaRows.find((m) => m.mediaType === "image")?.url ??
    mediaRows[0]?.url;

  const existing = await prisma.listing.findFirst({
    where: { sourceUrl: summary.detailUrl },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    await prisma.listingUnit.deleteMany({ where: { listingId: existing.id } });
    await prisma.listingMedia.deleteMany({ where: { listingId: existing.id } });
  }

  let slug = normalized.slug;
  const slugOwner = await prisma.listing.findUnique({ where: { slug } });
  if (slugOwner && slugOwner.sourceUrl !== summary.detailUrl) {
    slug = `${normalized.slug}-28hse`;
  }

  const listing = existing
    ? await prisma.listing.update({
        where: { id: existing.id },
        data: {
          slug,
          estateName: normalized.estateName,
          district: normalized.district,
          subDistrict: normalized.subDistrict,
          developer: normalized.developer,
          price: normalized.price,
          priceMax: normalized.priceMax,
          saleableArea: normalized.saleableArea,
          saleableAreaMax: normalized.saleableAreaMax,
          psf: normalized.psf,
          bedrooms: normalized.bedrooms,
          propertyType: normalized.propertyType,
          description: normalized.description,
          status: "active",
          source: "28hse",
          sourceUrl: summary.detailUrl,
          sourceType: "new",
          comparisonRole: "primary",
          tags: normalized.tags,
          imageUrl: heroImage ?? null,
          lastSeenAt: new Date(),
        },
      })
    : await prisma.listing.create({
        data: {
          slug,
          estateName: normalized.estateName,
          district: normalized.district,
          subDistrict: normalized.subDistrict,
          developer: normalized.developer,
          price: normalized.price,
          priceMax: normalized.priceMax,
          saleableArea: normalized.saleableArea,
          saleableAreaMax: normalized.saleableAreaMax,
          psf: normalized.psf,
          bedrooms: normalized.bedrooms,
          propertyType: normalized.propertyType,
          description: normalized.description,
          status: "active",
          source: "28hse",
          sourceUrl: summary.detailUrl,
          sourceType: "new",
          comparisonRole: "primary",
          tags: normalized.tags,
          imageUrl: heroImage ?? null,
        },
      });

  for (const m of mediaRows) {
    await prisma.listingMedia.upsert({
      where: { listingId_url: { listingId: listing.id, url: m.url } },
      update: { sortOrder: m.sortOrder, mediaType: m.mediaType },
      create: {
        listingId: listing.id,
        mediaType: m.mediaType,
        url: m.url,
        sortOrder: m.sortOrder,
        sourceUrl: m.sourceUrl,
      },
    });
  }

  printSection("Database", {
    id: listing.id,
    slug: listing.slug,
    sourceUrl: listing.sourceUrl,
    imageUrl: listing.imageUrl,
  });

  console.log(
    `\nDone. Set USE_MOCK_DATA=false and open /listing/${listing.slug} to verify the UI reads this row.\n`
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
