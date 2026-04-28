/**
 * Normalizes raw project detail data into a DB-ready shape.
 *
 * Rules:
 * - District names are standardized to the District enum values
 * - Prices are parsed to integers (HKD)
 * - Areas are parsed to integers (sq ft)
 * - PSF is computed from price and area
 * - Slug is generated from the project name
 * - Tags and status are normalized
 */

import type { RawProjectDetail } from "../parsers/28hseProjectDetailParser";
import { normalizeDistrict } from "@/lib/districtCanonical";
import { slugify } from "../utils/hashing";

export interface NormalizedProjectInput {
  slug: string;
  estateName: string;
  buildingName?: string;
  district: string;
  subDistrict?: string;
  address?: string;       // street address (distinct from district)
  developer?: string;
  completionYear?: number; // e.g. 2025, parsed from rawCompletionDate
  price?: number;         // priceFrom; undefined = price unknown (partial record)
  priceMax?: number;      // priceTo
  saleableArea: number;
  saleableAreaMax?: number;
  psf?: number;           // undefined when price is unknown
  bedrooms: number;
  bathrooms?: number;
  propertyType: string;
  description?: string;
  status: string;
  source: string;
  sourceUrl: string;
  sourceType: string;
  comparisonRole: string;
  tags: string[];
  dataCompleteness: "full" | "partial";
  priceStrategy: string;
}

// ─── Price parsing ────────────────────────────────────────────────────────────

/**
 * Parse a raw price string to integer HKD.
 * Handles: "$6,500,000", "650萬", "約650萬", "6.5M", "6500000"
 */
export function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.萬億Mm]/g, "");

  // 萬 = 10,000
  if (/萬/.test(raw)) {
    const n = parseFloat(cleaned.replace("萬", ""));
    return Number.isFinite(n) ? Math.round(n * 10_000) : null;
  }
  // 億 = 100,000,000
  if (/億/.test(raw)) {
    const n = parseFloat(cleaned.replace("億", ""));
    return Number.isFinite(n) ? Math.round(n * 100_000_000) : null;
  }
  // M suffix
  if (/[Mm]/.test(raw)) {
    const n = parseFloat(cleaned.replace(/[Mm]/, ""));
    return Number.isFinite(n) ? Math.round(n * 1_000_000) : null;
  }

  const n = parseFloat(cleaned.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// ─── Area parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a raw area string to integer sq ft.
 * Handles: "450 sq ft", "450呎", "450尺", "41.8 m²" (converts m² → sq ft)
 */
export function parseArea(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Convert m² to sq ft if unit is mentioned
  if (/m²|sq\.?\s*m/i.test(raw)) {
    return Math.round(n * 10.764);
  }
  return Math.round(n);
}

// ─── Bedroom parsing ──────────────────────────────────────────────────────────

/**
 * Parse bedroom count from room summary.
 * "2 Bedrooms" → 2, "2房1廳" → 2, "Studio" → 0, "1-3 Bedrooms" → 1 (min)
 */
/**
 * Parse bedroom count from a raw room-type summary.
 *
 * Residential bedroom counts are realistically 0 (studio / 開放式) to ~8. Any
 * number outside that range is treated as garbage (usually a unit count or
 * floor count leaking from a non-standard room-type tab label like
 * "67 units" or "House 31") and we fall back to the sentinel default.
 *
 * Returns a plausible bedroom count in [0, MAX_PLAUSIBLE_BEDROOMS], or 2 as a
 * benign default when nothing extractable is found.
 */
const MAX_PLAUSIBLE_BEDROOMS = 8;

export function parseBedrooms(raw: string | undefined): number {
  if (!raw) return 2;
  const counts: number[] = [];
  if (/studio|開放式|開放|open\s*plan/i.test(raw)) counts.push(0);
  for (const m of raw.matchAll(/(\d+)\s*[-‑]?\s*(?:bed|bedroom|房)/gi)) {
    const n = parseInt(m[1]!, 10);
    if (Number.isFinite(n) && n >= 0 && n <= MAX_PLAUSIBLE_BEDROOMS) counts.push(n);
  }
  if (counts.length > 0) return Math.min(...counts);
  if (/studio|開放式/i.test(raw)) return 0;
  // Fallback: first digit in the string — but only accept it if it falls in
  // the plausible residential range. Larger values are almost always a
  // unit count / house number, not a bedroom count.
  const match = /(\d+)/.exec(raw);
  if (match) {
    const n = parseInt(match[1]!, 10);
    if (Number.isFinite(n) && n >= 0 && n <= MAX_PLAUSIBLE_BEDROOMS) return n;
  }
  return 2;
}

/**
 * Parse a completion year from strings like "Complete on Q3 2025" or "Expected 2026".
 * Returns the 4-digit year, or undefined if not found.
 */
export function parseCompletionYear(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = /\b(20\d{2})\b/.exec(raw);
  return match ? parseInt(match[1]!, 10) : undefined;
}

function listingStatusFromRaw(raw: string | undefined): string {
  if (!raw) return "active";
  const s = raw.trim().toLowerCase();
  if (/sold\s*out|售完|售罄/.test(s)) return "sold_out";
  if (/coming|待售|預售|presale/.test(s)) return "coming_soon";
  return "active";
}

// ─── Main normalizer ──────────────────────────────────────────────────────────

/**
 * Normalize a raw project detail into a shape ready for DB insertion.
 *
 * Returns null only if the listing name is missing (no useful data at all).
 * When price is missing, returns a partial record (dataCompleteness = "partial")
 * so core project info (name, district, developer) is still persisted.
 */
export function normalizeProject(
  raw: RawProjectDetail
): NormalizedProjectInput | null {
  const estateName = raw.rawName?.trim();
  if (!estateName) return null;

  const price = parsePrice(raw.rawPriceFrom) ?? undefined;
  const saleableArea = parseArea(raw.rawSaleableAreaFrom) ?? 400; // fallback to reasonable default

  const psf = price && saleableArea > 0 ? Math.round(price / saleableArea) : undefined;
  const district = normalizeDistrict(raw.rawDistrict);
  const bedrooms = parseBedrooms(raw.rawRoomSummary);
  const slug = slugify(estateName);
  // subDistrict = district-level area label; address = actual street
  const subDistrict = raw.rawSubDistrict?.trim() || raw.rawAddress?.trim() || undefined;
  const address = raw.rawAddress?.trim() || undefined;
  const completionYear = parseCompletionYear(raw.rawCompletionDate);

  const dataCompleteness: "full" | "partial" = price ? "full" : "partial";

  const tags: string[] = ["新樓推薦"];
  if (raw.rawDistrict?.toLowerCase().includes("kai tak") || district === "啟德") {
    tags.push("啟德新區");
  }

  return {
    slug,
    estateName,
    district,
    subDistrict,
    address,
    developer: raw.rawDeveloper?.trim(),
    completionYear,
    price,
    priceMax: parsePrice(raw.rawPriceTo) ?? undefined,
    saleableArea,
    saleableAreaMax: parseArea(raw.rawSaleableAreaTo) ?? undefined,
    psf,
    bedrooms,
    propertyType: "住宅",
    description: raw.rawDescription?.trim(),
    status: listingStatusFromRaw(raw.rawStatus),
    source: "28hse",
    sourceUrl: raw.sourceUrl,
    sourceType: "new",
    comparisonRole: "primary",
    tags,
    dataCompleteness,
    priceStrategy: raw.priceStrategy,
  };
}
