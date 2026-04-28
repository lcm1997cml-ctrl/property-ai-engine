/**
 * Normalizes raw unit data into DB-ready ListingUnit shape.
 */

import type { RawProjectUnit } from "../parsers/28hseProjectDetailParser";
import { parsePrice, parseArea, parseBedrooms } from "./normalizeProject";

export interface NormalizedUnitInput {
  unitLabel?: string;
  roomCount: number;
  saleableArea?: number;     // min saleable area sq ft; undefined = unknown
  saleableAreaMax?: number;  // max saleable area sq ft
  price?: number;            // min price HKD; undefined = 待更新
  priceMax?: number;         // max price HKD
  pricePerSqft?: number;     // computed from min price + min area
  unitCount?: number;
  availability: string;      // available | sold_out | pending | unknown
  sourceUrl?: string;
}

/**
 * Normalize a single raw unit room-type summary.
 * Returns null only if the room label / count is missing entirely.
 * Price and area can be absent (→ 待更新).
 */
export function normalizeUnit(
  raw: RawProjectUnit,
  sourceUrl?: string
): NormalizedUnitInput | null {
  const roomCount = parseBedrooms(raw.rawRoomCount);
  // Require at least a label so we have something meaningful
  if (raw.rawLabel === undefined && raw.rawRoomCount === undefined) return null;

  const price = parsePrice(raw.rawPrice) ?? undefined;
  const priceMax = parsePrice(raw.rawPriceMax) ?? undefined;
  const area = parseArea(raw.rawSaleableArea) ?? undefined;
  const areaMax = parseArea(raw.rawSaleableAreaMax) ?? undefined;
  const pricePerSqft =
    price && area && area > 0 ? Math.round(price / area) : undefined;

  const unitCount = raw.rawUnitCount
    ? (parseInt(raw.rawUnitCount, 10) || undefined)
    : undefined;

  return {
    unitLabel: raw.rawLabel?.trim(),
    roomCount,
    saleableArea: area,
    saleableAreaMax: areaMax,
    price,
    priceMax: priceMax !== price ? priceMax : undefined,
    pricePerSqft,
    unitCount,
    availability: raw.rawAvailability ?? "unknown",
    sourceUrl,
  };
}

/**
 * Normalize an array of raw units, filtering out invalid entries.
 */
export function normalizeUnits(
  rawUnits: RawProjectUnit[],
  sourceUrl?: string
): NormalizedUnitInput[] {
  return rawUnits
    .map((u) => normalizeUnit(u, sourceUrl))
    .filter((u): u is NormalizedUnitInput => u !== null);
}
