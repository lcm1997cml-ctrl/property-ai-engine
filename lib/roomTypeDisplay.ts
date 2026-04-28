/**
 * Shared helpers for rendering RoomTypeSummary rows consistently across:
 * - Search card (components/properties/ListingCard.tsx)
 * - Homepage featured card (app/page.tsx)
 * - Detail page戶型表 (app/listing/[slug]/page.tsx)
 *
 * Rule: we show every row that has a roomCount. Individual fields (area /
 * price) independently fall back to "待更新" when unknown. This gives buyers
 * the maximum useful information ("呢個盤有 2房") without fabricating specifics.
 *
 * Suspicious listings render the same way; the warning goes at the section
 * header, not on each row.
 */

import { formatPrice } from "./formatters";
import type { RoomTypeSummary } from "@/types/listing";

/** Area cell text: "450–580呎²" | "450呎²" | "面積待更新" */
export function formatRoomTypeArea(rt: RoomTypeSummary): string {
  if (!rt.minSaleableArea) return "面積待更新";
  if (rt.maxSaleableArea && rt.maxSaleableArea !== rt.minSaleableArea) {
    return `${rt.minSaleableArea}–${rt.maxSaleableArea}呎²`;
  }
  return `${rt.minSaleableArea}呎²`;
}

/**
 * Price cell text. Handles "售價待公布 / 已售罄 / 價錢待更新" and, when the
 * room type is sold out but we still have last-known price info, surfaces the
 * price as 參考 for the buyer.
 *
 * Priority:
 *   1. Listing-level partial (售價待公布) — pre-launch, nothing reliable yet
 *   2. Sold out + no price info (已售罄)
 *   3. Sold out + price known → "$XXX萬(售罄)" or "$XXX萬–$YYY萬(售罄)"
 *      (no "起" suffix — not on sale any more, it's a reference price)
 *   4. On sale + price known → "$XXX萬起" or "$XXX萬–$YYY萬"
 *   5. Nothing known (價錢待更新)
 */
export function formatRoomTypePrice(
  rt: RoomTypeSummary,
  isListingPartial: boolean
): string {
  if (isListingPartial) return "售價待公布";

  const soldOut = rt.availability === "sold_out";
  if (!rt.minPrice) return soldOut ? "已售罄" : "價錢待更新";

  const priceText =
    rt.maxPrice && rt.maxPrice !== rt.minPrice
      ? `${formatPrice(rt.minPrice)}–${formatPrice(rt.maxPrice)}`
      : soldOut
        ? formatPrice(rt.minPrice)
        : `${formatPrice(rt.minPrice)}起`;

  return soldOut ? `${priceText}(售罄)` : priceText;
}

/**
 * Per-square-foot price ("呎價") for a room type.
 *
 * HK property buyers care a lot about 呎價 — and within the same project the
 * psf differs noticeably between 1房 / 2房 / 3房 / 4房+ (smaller units almost
 * always carry a higher psf), which is exactly the information the detail
 * page must surface for each room-type row.
 *
 * Strategy:
 *   1. Listing partial (售價待公布)        → "呎價待公布"
 *   2. Precomputed `pricePerSqft` present  → use it directly. The parser
 *      computed this from a real unit row, so it's more honest than dividing
 *      a min-price by a max-area (which would overstate the range).
 *   3. Else, compute from the cheapest unit baseline (minPrice / minArea).
 *      When both a price and area max are present we also surface a high-end
 *      psf computed from (maxPrice / minArea) so the buyer can see the
 *      spread within the type — but only if we have all four numbers; we
 *      never fabricate range bounds from incomplete data.
 *   4. No usable price + area, but sold_out → "已售罄"
 *   5. Otherwise                              → "呎價待更新"
 */
export function formatRoomTypePsf(
  rt: RoomTypeSummary,
  isListingPartial: boolean
): string {
  if (isListingPartial) return "呎價待公布";

  const { minPrice, maxPrice, minSaleableArea, maxSaleableArea, pricePerSqft, availability } = rt;
  const hasMinPrice = typeof minPrice === "number" && minPrice > 0;
  const hasMaxPrice = typeof maxPrice === "number" && maxPrice > 0 && maxPrice !== minPrice;
  const hasMinArea = typeof minSaleableArea === "number" && minSaleableArea > 0;
  const hasMaxArea =
    typeof maxSaleableArea === "number" &&
    maxSaleableArea > 0 &&
    maxSaleableArea !== minSaleableArea;

  // Suppress wide ranges when the underlying area or price spread is suspect
  // (28Hse occasionally lumps duplex/villa units under the same room code as
  // standard flats — e.g. 柏傲莊 2房 419–1309呎²). When the spread looks
  // implausible, fall back to a single-point psf rather than a misleading range.
  const areaSpreadOk =
    hasMaxArea ? maxSaleableArea! <= minSaleableArea! * 2.2 : true;
  const priceSpreadOk = hasMaxPrice ? maxPrice! <= minPrice! * 3.0 : true;

  // Compute a true psf range when we have both price and area extremes.
  if (hasMinPrice && hasMaxPrice && hasMinArea && hasMaxArea && areaSpreadOk && priceSpreadOk) {
    const psfLow = Math.round(minPrice! / maxSaleableArea!);
    const psfHigh = Math.round(maxPrice! / minSaleableArea!);
    if (psfLow !== psfHigh && psfLow > 0) {
      return `$${psfLow.toLocaleString()}–$${psfHigh.toLocaleString()}/呎`;
    }
  }

  // Trust the precomputed psf when it exists — it came from a real unit row.
  if (typeof pricePerSqft === "number" && pricePerSqft > 0) {
    return `$${pricePerSqft.toLocaleString()}/呎`;
  }

  // Fallback: derive a single point from the cheapest baseline.
  if (hasMinPrice && hasMinArea) {
    const psf = Math.round(minPrice! / minSaleableArea!);
    if (psf > 0) return `$${psf.toLocaleString()}/呎`;
  }

  if (availability === "sold_out") return "已售罄";
  return "呎價待更新";
}

/**
 * Availability badge style. Keep in sync with AvailabilityBadge inside the
 * detail page (app/listing/[slug]/page.tsx) so cards and detail look identical.
 */
export interface AvailabilityStyle {
  label: string;
  bgClass: string;
  textClass: string;
}

export function getAvailabilityStyle(availability: string): AvailabilityStyle {
  if (availability === "sold_out") {
    return { label: "售罄", bgClass: "bg-red-100", textClass: "text-red-600" };
  }
  if (availability === "pending") {
    return { label: "待售", bgClass: "bg-amber-100", textClass: "text-amber-700" };
  }
  if (availability === "available") {
    return { label: "發售中", bgClass: "bg-green-100", textClass: "text-green-700" };
  }
  // "unknown" or anything else
  return { label: "待更新", bgClass: "bg-gray-100", textClass: "text-gray-500" };
}

/**
 * Overall price range across a listing's room types. Used by the new-dev card
 * header when we want a range that reflects the actual room-type data rather
 * than the coarser Listing.price / priceMax values.
 *
 * Returns null when no room type has any price info.
 */
export function computeRoomTypePriceRange(
  roomTypes: RoomTypeSummary[] | undefined
): { min: number; max: number } | null {
  if (!roomTypes || roomTypes.length === 0) return null;
  const prices: number[] = [];
  for (const rt of roomTypes) {
    if (rt.minPrice) prices.push(rt.minPrice);
    if (rt.maxPrice) prices.push(rt.maxPrice);
  }
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
