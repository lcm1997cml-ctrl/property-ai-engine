/**
 * Listing Service — async data access layer.
 *
 * When USE_MOCK_DATA=true  → reads from data/mockListings.ts (dev only)
 * When USE_MOCK_DATA=false → reads from PostgreSQL via Prisma
 *
 * Frontend must NEVER import mock data directly. All data access goes through here.
 */

import type {
  NormalizedListing,
  AIInsight,
  EnrichedListing,
  SearchParams,
  MarketSummary,
  SortOption,
  BedroomFilter,
  MarketFocus,
  ListingSourceType,
  ListingUnitRow,
  RoomTypeSummary,
  District,
  PropertyType,
} from "@/types/listing";
import type { Prisma as PrismaNamespace } from "@prisma/client";
import {
  normalizeDistrict,
  rawDistrictValuesMatchingCanonical,
} from "@/lib/districtCanonical";
import { mergeDistrictOptions } from "@/lib/searchDistricts";
import { DISTRICTS } from "@/types/listing";
import { USE_MOCK_DATA } from "@/lib/env";

// ─── Mock path (dev only) ────────────────────────────────────────────────────
// These imports are only evaluated when USE_MOCK_DATA=true.
// In production builds with USE_MOCK_DATA=false the mock data is never loaded.

async function getMockListings(): Promise<NormalizedListing[]> {
  const { MOCK_LISTINGS } = await import("@/data/mockListings");
  const { applyProductDefaults } = await import("@/lib/listingProduct");
  return MOCK_LISTINGS.map(applyProductDefaults);
}

async function getMockInsight(listingId: string): Promise<AIInsight | undefined> {
  const { MOCK_AI_INSIGHTS } = await import("@/data/mockListings");
  return MOCK_AI_INSIGHTS.find((i) => i.listingId === listingId);
}

async function attachMockInsights(listings: NormalizedListing[]): Promise<EnrichedListing[]> {
  const { MOCK_AI_INSIGHTS } = await import("@/data/mockListings");
  return listings.map((l) => ({
    ...l,
    insight: MOCK_AI_INSIGHTS.find((i) => i.listingId === l.id),
  }));
}

// ─── DB path (production) ────────────────────────────────────────────────────

type DbListing = {
  id: string;
  slug: string;
  estateName: string;
  titleEn: string | null;
  titleZh: string | null;
  buildingName: string | null;
  district: string;
  subDistrict: string | null;
  address: string | null;
  developer: string | null;
  completionYear: number | null;
  price: number | null;
  priceMax: number | null;
  saleableArea: number;
  saleableAreaMax: number | null;
  grossArea: number | null;
  psf: number | null;
  bedrooms: number;
  bathrooms: number | null;
  propertyType: string;
  floor: string | null;
  facing: string | null;
  age: number | null;
  status: string;
  description: string | null;
  descriptionZh: string | null;
  dataQuality: string;
  source: string;
  sourceUrl: string | null;
  sourceType: string;
  comparisonRole: string;
  isFeatured: boolean;
  imageUrl: string | null;
  tags: string[];
  dataCompleteness: string;
  lastSeenAt: Date;
};

/** Returns true if the string contains at least one CJK (Chinese) character. */
function hasChinese(s: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s);
}

function dbListingToNormalized(row: DbListing): NormalizedListing {
  // Only treat titleZh as Chinese if it actually contains Chinese characters.
  // English-branded values stored by the crawler (e.g. "Blue Coast") are
  // discarded here so the titleEn fallback renders correctly downstream.
  const titleZhResolved =
    row.titleZh && hasChinese(row.titleZh) ? row.titleZh : undefined;

  return {
    id: row.id,
    slug: row.slug,
    estateName: row.estateName,
    titleEn: row.titleEn ?? undefined,
    titleZh: titleZhResolved,
    status: row.status,
    buildingName: row.buildingName ?? undefined,
    district: normalizeDistrict(row.district) as District,
    subDistrict: row.subDistrict ?? undefined,
    address: row.address ?? undefined,
    developer: row.developer ?? undefined,
    completionYear: row.completionYear ?? undefined,
    price: row.price ?? 0,
    priceMax: row.priceMax ?? undefined,
    saleableArea: row.saleableArea,
    saleableAreaMax: row.saleableAreaMax ?? undefined,
    grossArea: row.grossArea ?? undefined,
    psf: row.psf ?? 0,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms ?? undefined,
    propertyType: row.propertyType as PropertyType,
    floor: row.floor ?? undefined,
    facing: row.facing ?? undefined,
    age: row.age ?? undefined,
    description: row.description ?? undefined,
    descriptionZh: row.descriptionZh ?? undefined,
    dataQuality: row.dataQuality === "suspicious" ? "suspicious" : "normal",
    source: row.source as NormalizedListing["source"],
    sourceUrl: row.sourceUrl ?? "",
    lastSeenAt: row.lastSeenAt.toISOString(),
    imageUrl: row.imageUrl ?? undefined,
    tags: row.tags,
    dataCompleteness: row.dataCompleteness === "partial" ? "partial" : "full",
    sourceType: row.sourceType as ListingSourceType,
    comparisonRole: row.comparisonRole as NormalizedListing["comparisonRole"],
    isFeaturedComparison: row.isFeatured,
  };
}

/** Curated district order + any labels present on active listings (for search filter dropdown). */
export async function getSearchDistrictOptions(): Promise<string[]> {
  if (USE_MOCK_DATA) return [...DISTRICTS];
  const { prisma } = await import("@/lib/db");
  const grouped = await prisma.listing.groupBy({
    by: ["district"],
    where: { status: { in: ["active", "sold_out"] } },
  });
  return mergeDistrictOptions(grouped.map((g) => g.district));
}

async function searchListingsFromDB(params: SearchParams): Promise<NormalizedListing[]> {
  const { prisma } = await import("@/lib/db");

  const where: PrismaNamespace.ListingWhereInput = {
    // Include sold_out so the full listing set is visible (with badge in UI).
    // Statuses like pending_detail_crawl and parse_failed are never shown.
    status: { in: ["active", "sold_out"] },
  };

  // District filter (match canonical + English aliases still stored in DB).
  //
  // Special handling for Tseung Kwan O area:
  //   - 將軍澳 (TKO umbrella): match TKO proper + 康城 (LOHAS Park), because in
  //     HK user mental model 康城 is part of 將軍澳 and most active TKO new
  //     developments on 28Hse are labelled under Lohas Park → normalized to 康城.
  //     Without this, clicking "將軍澳" returns zero results.
  //   - 康城 (specific sub-area): match only 康城, either as its own canonical
  //     district or as a sub-district of legacy 將軍澳 rows.
  if (params.district) {
    if (params.district === "康城") {
      where.OR = [
        ...(Array.isArray(where.OR) ? where.OR : []),
        { district: { in: rawDistrictValuesMatchingCanonical("康城") } },
        {
          AND: [
            { district: { in: rawDistrictValuesMatchingCanonical("將軍澳") } },
            { subDistrict: { contains: "康城" } },
          ],
        },
      ];
    } else if (params.district === "將軍澳") {
      where.district = {
        in: [
          ...rawDistrictValuesMatchingCanonical("將軍澳"),
          ...rawDistrictValuesMatchingCanonical("康城"),
        ],
      };
    } else {
      where.district = {
        in: rawDistrictValuesMatchingCanonical(params.district),
      };
    }
  }

  // Price filters
  const priceConditions: PrismaNamespace.ListingWhereInput[] = [];
  const minPrice = Math.max(
    params.minPrice ?? 0,
    params.priceFloor1500 ? 15_000_000 : 0
  );
  if (minPrice > 0) priceConditions.push({ price: { gte: minPrice } });
  if (params.maxPrice) priceConditions.push({ price: { lte: params.maxPrice } });
  // 已公布售價 filter — only listings with confirmed price
  if (params.priceKnown) priceConditions.push({ dataCompleteness: "full" });
  if (priceConditions.length > 0) {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ...priceConditions];
  }

  // Bedrooms + Area filter — room-type-aware.
  //
  // New developments: a Listing can have multiple ListingUnit rows, one per
  // room type (1房 / 2房 / 3房 / 4房+). The listing-level `bedrooms` and
  // `saleableArea` columns are only rough proxies written by the parser — for
  // projects that ship multiple room types they typically reflect the smallest
  // unit, which means an old listing-level filter would miss listings that
  // actually contain a matching unit.
  //
  // Combined rule:
  //   OR(
  //     some ListingUnit row matches (bedrooms AND area on the SAME unit),
  //     listing has no units AND listing.bedrooms/saleableArea matches
  //   )
  //
  // Secondary listings have no ListingUnit rows, so for those we fall back to
  // listing-level fields.
  if (
    (params.bedrooms !== undefined && params.bedrooms !== "") ||
    params.minArea ||
    params.maxArea
  ) {
    const unitFilter: PrismaNamespace.ListingUnitWhereInput = {};
    const listingFallback: PrismaNamespace.ListingWhereInput = {};

    if (params.bedrooms !== undefined && params.bedrooms !== "") {
      const roomCountCondition: PrismaNamespace.IntFilter | number =
        params.bedrooms === "gte4" ? { gte: 4 } : Number(params.bedrooms);
      unitFilter.roomCount = roomCountCondition;
      listingFallback.bedrooms = roomCountCondition;
    }

    if (params.minArea || params.maxArea) {
      const unitAreaCondition: PrismaNamespace.IntNullableFilter = {};
      const listingAreaCondition: PrismaNamespace.IntFilter = {};
      if (params.minArea) {
        unitAreaCondition.gte = params.minArea;
        listingAreaCondition.gte = params.minArea;
      }
      if (params.maxArea) {
        unitAreaCondition.lte = params.maxArea;
        listingAreaCondition.lte = params.maxArea;
      }
      unitFilter.saleableArea = unitAreaCondition;
      listingFallback.saleableArea = listingAreaCondition;
    }

    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        OR: [
          // Match listings with a ListingUnit satisfying ALL active filters on the SAME unit
          { units: { some: unitFilter } },
          // Fallback: listings without units, use listing-level columns
          {
            AND: [{ units: { none: {} } }, listingFallback],
          },
        ],
      },
    ];
  }

  // Source type filter
  const focus = resolveMarketFocus(params);
  if (focus === "new") {
    where.sourceType = "new";
  } else if (focus === "secondary") {
    where.sourceType = "secondary";
  }
  // "all" → no sourceType filter; post-process below

  // Sorting — default puts full (confirmed price) before partial, then newest first
  type ListingOrderBy = PrismaNamespace.ListingOrderByWithRelationInput;
  let orderBy: ListingOrderBy | ListingOrderBy[] = [
    { dataCompleteness: "asc" }, // "full" < "partial" alphabetically → full first
    { createdAt: "desc" },
  ];
  switch (params.sortBy) {
    case "price_asc":  orderBy = [{ dataCompleteness: "asc" }, { price: "asc" }];  break;
    case "price_desc": orderBy = [{ dataCompleteness: "asc" }, { price: "desc" }]; break;
    case "psf_asc":    orderBy = [{ dataCompleteness: "asc" }, { psf: "asc" }];    break;
    case "psf_desc":   orderBy = [{ dataCompleteness: "asc" }, { psf: "desc" }];   break;
    case "area_asc":   orderBy = { saleableArea: "asc" }; break;
    case "area_desc":  orderBy = { saleableArea: "desc" }; break;
  }

  const rows = await prisma.listing.findMany({ where, orderBy });
  let listings = rows.map(dbListingToNormalized);

  // For "all": limit secondary rows (same logic as mock service)
  if (focus === "all") {
    const primary = listings.filter((l) => l.sourceType === "new");
    const secondary = listings.filter((l) => l.sourceType === "secondary");
    const capped = selectComparisonSecondaries(primary, secondary, 5);
    listings = [...primary, ...capped];
  }

  return listings;
}

async function getListingBySlugFromDB(slug: string): Promise<NormalizedListing | null> {
  const { prisma } = await import("@/lib/db");
  const row = await prisma.listing.findUnique({ where: { slug } });
  if (!row) return null;
  return dbListingToNormalized(row);
}

async function getListingsByIdsFromDB(ids: string[]): Promise<NormalizedListing[]> {
  const { prisma } = await import("@/lib/db");
  const rows = await prisma.listing.findMany({ where: { id: { in: ids } } });
  return rows.map(dbListingToNormalized);
}

async function getSimilarFromDB(
  budget: number,
  district?: string,
  limit = 6
): Promise<NormalizedListing[]> {
  const { prisma } = await import("@/lib/db");
  const lower = Math.round(budget * 0.8);
  const upper = Math.round(budget * 1.2);

  const where: PrismaNamespace.ListingWhereInput = {
    status: "active",
    price: { gte: lower, lte: upper },
  };

  if (district) {
    const districtRows = await prisma.listing.findMany({
      where: {
        ...where,
        district: { in: rawDistrictValuesMatchingCanonical(district) },
      },
      orderBy: [{ sourceType: "asc" }, { price: "asc" }],
      take: limit,
    });
    if (districtRows.length >= 3) return districtRows.map(dbListingToNormalized);
  }

  const rows = await prisma.listing.findMany({
    where,
    orderBy: [{ sourceType: "asc" }, { price: "asc" }],
    take: limit,
  });
  return rows.map(dbListingToNormalized);
}

async function getListingRoomTypesByIdFromDB(listingId: string): Promise<RoomTypeSummary[]> {
  const { prisma } = await import("@/lib/db");
  const rows = await prisma.listingUnit.findMany({
    where: { listingId },
    orderBy: { roomCount: "asc" },
  });
  return rows.map((u) => ({
    id: u.id,
    unitLabel: u.unitLabel ?? labelFromRoomCount(u.roomCount),
    roomCount: u.roomCount,
    minSaleableArea: u.saleableArea ?? undefined,
    maxSaleableArea: u.saleableAreaMax ?? undefined,
    minPrice: u.price ?? undefined,
    maxPrice: u.priceMax ?? undefined,
    pricePerSqft: u.pricePerSqft ?? undefined,
    unitCount: u.unitCount ?? undefined,
    availability: u.availability,
    confidence: computeRoomTypeConfidence(u),
  }));
}

async function getListingRoomTypesBatchFromDB(
  ids: string[]
): Promise<Map<string, RoomTypeSummary[]>> {
  if (ids.length === 0) return new Map();
  const { prisma } = await import("@/lib/db");
  const rows = await prisma.listingUnit.findMany({
    where: { listingId: { in: ids } },
    orderBy: [{ listingId: "asc" }, { roomCount: "asc" }],
  });
  const map = new Map<string, RoomTypeSummary[]>();
  for (const u of rows) {
    if (!map.has(u.listingId)) map.set(u.listingId, []);
    map.get(u.listingId)!.push({
      id: u.id,
      unitLabel: u.unitLabel ?? labelFromRoomCount(u.roomCount),
      roomCount: u.roomCount,
      minSaleableArea: u.saleableArea ?? undefined,
      maxSaleableArea: u.saleableAreaMax ?? undefined,
      minPrice: u.price ?? undefined,
      maxPrice: u.priceMax ?? undefined,
      pricePerSqft: u.pricePerSqft ?? undefined,
      unitCount: u.unitCount ?? undefined,
      availability: u.availability,
      confidence: computeRoomTypeConfidence(u),
    });
  }
  return map;
}

function labelFromRoomCount(n: number): string {
  if (n === 0) return "開放式";
  if (n >= 4) return "4房或以上";
  return `${n}房`;
}

/**
 * Compute confidence for a single room-type row.
 *
 * Scoring:
 *   +2  minPrice present and > 0
 *   +2  minSaleableArea present and > 0
 *   +1  maxPrice also present (range data)
 *   +1  maxSaleableArea also present
 *   +1  unitCount present (unit inventory data agrees)
 *   +1  pricePerSqft present (derived field present — parser found enough structure)
 *
 * Result:
 *   score >= 4 → "high"   (price + area confirmed; multiple data points)
 *   score  2-3 → "medium" (partial data: only price OR only area)
 *   score  0-1 → "low"    (no price, no area; too few signals)
 */
function computeRoomTypeConfidence(u: {
  saleableArea: number | null;
  saleableAreaMax: number | null;
  price: number | null;
  priceMax: number | null;
  pricePerSqft: number | null;
  unitCount: number | null;
}): "high" | "medium" | "low" {
  let score = 0;
  if (u.price && u.price > 0) score += 2;
  if (u.saleableArea && u.saleableArea > 0) score += 2;
  if (u.priceMax && u.priceMax > 0) score += 1;
  if (u.saleableAreaMax && u.saleableAreaMax > 0) score += 1;
  if (u.unitCount && u.unitCount > 0) score += 1;
  if (u.pricePerSqft && u.pricePerSqft > 0) score += 1;
  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

/** @deprecated Use getListingRoomTypes instead */
async function getListingUnitsByIdFromDB(listingId: string): Promise<ListingUnitRow[]> {
  const { prisma } = await import("@/lib/db");
  const rows = await prisma.listingUnit.findMany({
    where: { listingId },
    orderBy: { roomCount: "asc" },
  });
  return rows.map((u) => ({
    id: u.id,
    unitLabel: u.unitLabel ?? undefined,
    roomCount: u.roomCount,
    saleableArea: u.saleableArea ?? 0,
    price: u.price ?? 0,
    pricePerSqft: u.pricePerSqft ?? 0,
  }));
}

// ─── Shared pure helpers ──────────────────────────────────────────────────────

function resolveMarketFocus(params: SearchParams): MarketFocus {
  if (params.marketFocus === "new" || params.marketFocus === "secondary") {
    return params.marketFocus;
  }
  return "all";
}

function medianBedrooms(listings: NormalizedListing[]): number {
  if (listings.length === 0) return 0;
  const beds = [...listings].map((l) => l.bedrooms).sort((a, b) => a - b);
  const mid = Math.floor(beds.length / 2);
  return beds.length % 2 === 1 ? beds[mid]! : Math.round((beds[mid - 1]! + beds[mid]!) / 2);
}

function selectComparisonSecondaries(
  primary: NormalizedListing[],
  secondary: NormalizedListing[],
  max: number
): NormalizedListing[] {
  if (secondary.length <= max) return secondary;
  const districts = new Set(primary.map((p) => p.district));
  const targetBeds = medianBedrooms(primary.length > 0 ? primary : secondary);
  const scored = secondary.map((s) => {
    let score = Math.abs(s.bedrooms - targetBeds) * 12;
    if (primary.length > 0 && !districts.has(s.district)) score += 50;
    if (s.isFeaturedComparison) score -= 20;
    return { s, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, max).map((x) => x.s);
}

// Mock-path sort (DB path uses ORDER BY)
function sortListings(
  listings: NormalizedListing[],
  sortBy?: SortOption
): NormalizedListing[] {
  const sorted = [...listings];
  switch (sortBy) {
    case "price_asc":  return sorted.sort((a, b) => a.price - b.price);
    case "price_desc": return sorted.sort((a, b) => b.price - a.price);
    case "psf_asc":    return sorted.sort((a, b) => a.psf - b.psf);
    case "psf_desc":   return sorted.sort((a, b) => b.psf - a.psf);
    case "area_asc":   return sorted.sort((a, b) => a.saleableArea - b.saleableArea);
    case "area_desc":  return sorted.sort((a, b) => b.saleableArea - a.saleableArea);
    default:           return sorted;
  }
}

function matchesBedrooms(l: NormalizedListing, bedrooms?: BedroomFilter): boolean {
  if (bedrooms === undefined || bedrooms === "") return true;
  if (bedrooms === "gte4") return l.bedrooms >= 4;
  return l.bedrooms === Number(bedrooms);
}

function matchesDistrict(l: NormalizedListing, district?: string): boolean {
  if (!district) return true;
  if (l.district === district) return true;
  // 將軍澳 umbrella: include 康城 listings (see SQL query for rationale).
  if (district === "將軍澳" && l.district === "康城") return true;
  // 康城 selector: also accept legacy rows stored as 將軍澳 + subDistrict=康城.
  if (district === "康城" && l.district === "將軍澳") {
    return Boolean(l.subDistrict?.includes("康城"));
  }
  return false;
}

function matchesFilters(l: NormalizedListing, params: SearchParams): boolean {
  if (params.district && !matchesDistrict(l, params.district)) return false;
  if (params.priceKnown && l.dataCompleteness === "partial") return false;
  const minFloor = Math.max(
    params.minPrice ?? 0,
    params.priceFloor1500 ? 15_000_000 : 0
  );
  if (minFloor > 0 && l.price < minFloor) return false;
  if (params.maxPrice && l.price > params.maxPrice) return false;
  if (!matchesBedrooms(l, params.bedrooms)) return false;
  if (params.minArea && l.saleableArea < params.minArea) return false;
  if (params.maxArea && l.saleableArea > params.maxArea) return false;
  return true;
}

// ─── Public async API ─────────────────────────────────────────────────────────

/** Search listings with optional filters. Returns enriched listings. */
export async function searchListings(params: SearchParams): Promise<EnrichedListing[]> {
  if (USE_MOCK_DATA) {
    const all = await getMockListings();
    const filtered = all.filter((l) => matchesFilters(l, params));
    const focus = resolveMarketFocus(params);
    const primary = sortListings(
      filtered.filter((l) => l.sourceType === "new"),
      params.sortBy
    );
    let secondary = sortListings(
      filtered.filter((l) => l.sourceType === "secondary"),
      params.sortBy
    );
    if (focus === "new") return attachMockInsights(primary);
    if (focus === "secondary") return attachMockInsights(secondary);
    secondary = selectComparisonSecondaries(primary, secondary, 5);
    return attachMockInsights([...primary, ...secondary]);
  }

  const listings = await searchListingsFromDB(params);
  const ids = listings.map((l) => l.id);
  const roomTypesMap = await getListingRoomTypesBatchFromDB(ids);
  return listings.map((l) => ({ ...l, roomTypes: roomTypesMap.get(l.id) ?? [] }));
}

/** Get a single listing by slug. */
export async function getListingBySlug(slug: string): Promise<EnrichedListing | null> {
  if (USE_MOCK_DATA) {
    const all = await getMockListings();
    const listing = all.find((l) => l.slug === slug);
    if (!listing) return null;
    return { ...listing, insight: await getMockInsight(listing.id) };
  }

  const listing = await getListingBySlugFromDB(slug);
  if (!listing) return null;
  return { ...listing };
}

/** Get multiple listings by IDs (for compare page). */
export async function getListingsByIds(ids: string[]): Promise<EnrichedListing[]> {
  if (USE_MOCK_DATA) {
    const all = await getMockListings();
    const filtered = all.filter((l) => ids.includes(l.id));
    return attachMockInsights(filtered);
  }

  const [listings, roomTypesMap] = await Promise.all([
    getListingsByIdsFromDB(ids),
    getListingRoomTypesBatchFromDB(ids),
  ]);
  return listings.map((l) => ({ ...l, roomTypes: roomTypesMap.get(l.id) ?? [] }));
}

/** Get all listings (no filters) — used by compare and mortgage pages for dropdowns/recommendations. */
export async function getAllListings(): Promise<EnrichedListing[]> {
  return searchListings({});
}

/** Compute market summary from a listing set (pure, synchronous). */
export function computeMarketSummary(listings: NormalizedListing[]): MarketSummary {
  if (listings.length === 0) {
    return { count: 0, avgPrice: 0, avgPsf: 0, minPrice: 0, maxPrice: 0, priceRange: [] };
  }
  // Only full-price listings participate in price stats
  const priced = listings.filter((l) => l.dataCompleteness !== "partial" && l.price > 0);
  const prices = priced.map((l) => l.price);
  const psfs = priced.filter((l) => l.psf > 0).map((l) => l.psf);
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
  const avgPsf = psfs.length ? Math.round(psfs.reduce((a, b) => a + b, 0) / psfs.length) : 0;
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  const buckets = [
    { label: "600萬以下", min: 0, max: 6_000_000 },
    { label: "600萬–800萬", min: 6_000_000, max: 8_000_000 },
    { label: "800萬–1000萬", min: 8_000_000, max: 10_000_000 },
    { label: "1000萬以上", min: 10_000_000, max: Infinity },
  ];
  const priceRange = buckets.map((b) => ({
    label: b.label,
    count: priced.filter((l) => l.price >= b.min && l.price < b.max).length,
  }));

  return { count: listings.length, avgPrice, avgPsf, minPrice, maxPrice, priceRange };
}

/** Get room-type summaries for a single new-development listing (detail page). */
export async function getListingRoomTypes(listingId: string): Promise<RoomTypeSummary[]> {
  if (USE_MOCK_DATA) return [];
  return getListingRoomTypesByIdFromDB(listingId);
}

/** @deprecated Use getListingRoomTypes. */
export async function getListingUnits(listingId: string): Promise<ListingUnitRow[]> {
  if (USE_MOCK_DATA) return []; // mock data has no units
  return getListingUnitsByIdFromDB(listingId);
}

/** Get similar listings for mortgage recommendation (within ±20% of budget). */
export async function getSimilarListings(
  budget: number,
  district?: string,
  limit = 6
): Promise<EnrichedListing[]> {
  if (USE_MOCK_DATA) {
    const all = await getMockListings();
    const lower = budget * 0.8;
    const upper = budget * 1.2;
    let candidates = all.filter((l) => l.price >= lower && l.price <= upper);
    if (district) {
      const districtMatches = candidates.filter((l) =>
        matchesDistrict(l, district)
      );
      if (districtMatches.length >= 3) candidates = districtMatches;
    }
    const newFirst = [...candidates].sort((a, b) => {
      const ra: ListingSourceType = a.sourceType ?? "secondary";
      const rb: ListingSourceType = b.sourceType ?? "secondary";
      return (ra === "new" ? 0 : 1) - (rb === "new" ? 0 : 1);
    });
    return attachMockInsights(newFirst.slice(0, limit));
  }

  const listings = await getSimilarFromDB(budget, district, limit);
  return listings.map((l) => ({ ...l }));
}
