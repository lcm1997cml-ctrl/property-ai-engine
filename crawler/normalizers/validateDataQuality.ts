/**
 * Data quality validation for normalized listings.
 *
 * Flags listings as "suspicious" when the data contains patterns that commonly
 * indicate parsing errors or missing/incorrect data (especially bedroom count).
 * Does NOT block ingestion — the result is stored for manual review.
 */

import type { NormalizedProjectInput } from "./normalizeProject";

export type DataQuality = "normal" | "suspicious";

export interface DataQualityResult {
  quality: DataQuality;
  reasons: string[];
}

/**
 * Major developer name patterns (English + Chinese).
 * Used by Rule 3: these developers almost never build studios —
 * bedrooms=0 from a major developer strongly suggests a parse error.
 */
const MAJOR_DEVELOPER_PATTERNS = [
  // SHKP (新鴻基地產)
  /sun hung kai/i,
  /新鴻基/,
  // Wheelock / Wharf (九龍倉)
  /wheelock/i,
  /wharf/i,
  /九龍倉/,
  // New World Development (新世界發展)
  /new world/i,
  /新世界/,
  // CK Asset Holdings (長實集團)
  /ck asset/i,
  /cheung kong/i,
  /長實/,
];

function isMajorDeveloper(developer: string | undefined): boolean {
  if (!developer) return false;
  return MAJOR_DEVELOPER_PATTERNS.some((re) => re.test(developer));
}

/**
 * Validate a normalized project for data quality issues.
 *
 * @param normalized     - The normalized project data
 * @param unitCount      - Number of unit rows parsed from the detail page
 * @param rawRoomSummary - The raw room-summary string from the parser (before bedroom parsing)
 */
export function validateDataQuality(
  normalized: NormalizedProjectInput,
  unitCount: number,
  rawRoomSummary: string | undefined
): DataQualityResult {
  const reasons: string[] = [];

  // Rule 1: High price with low bedroom count
  // >$20M listings with ≤2 bedrooms are unusual in HK — likely a parse error
  if (normalized.price && normalized.price > 20_000_000 && normalized.bedrooms <= 2) {
    reasons.push(
      `price HK$${(normalized.price / 1e6).toFixed(1)}M > 20M but bedrooms=${normalized.bedrooms}`
    );
  }

  // Rule 2: Large saleable area with low bedroom count
  // >800 sqft with ≤2 bedrooms is atypical — probably a misparse
  if (normalized.saleableArea > 800 && normalized.bedrooms <= 2) {
    reasons.push(
      `area ${normalized.saleableArea} sqft > 800 but bedrooms=${normalized.bedrooms}`
    );
  }

  // Rule 3: Major developer listing a studio (bedrooms=0)
  // SHKP / Wheelock / New World / CK Asset do not typically build studios
  if (isMajorDeveloper(normalized.developer) && normalized.bedrooms === 0) {
    reasons.push(
      `major developer "${normalized.developer}" with bedrooms=0 (studio — likely parse error)`
    );
  }

  // Rule 4: Too few units — fewer than 2 suggests failed unit parsing
  if (unitCount < 2) {
    reasons.push(`only ${unitCount} unit row(s) parsed (< 2 — possible unit-table parse failure)`);
  }

  // Rule 5: Missing room summary — bedroom count fell back to default value of 2
  if (!rawRoomSummary?.trim()) {
    reasons.push("rawRoomSummary absent — bedroom count is a default fallback, not parsed");
  }

  // Rule 6: Implausible bedroom count — villa / low-density developments on
  // 28Hse sometimes expose per-unit tab labels like "House 67" or "67 units",
  // which the parser can mistake for a bedroom count. Residential bedrooms
  // realistically top out around 8; anything higher is almost certainly a
  // unit count or house number leaking into Listing.bedrooms.
  if (normalized.bedrooms > 8 || normalized.bedrooms < 0) {
    reasons.push(
      `bedrooms=${normalized.bedrooms} is outside plausible range [0, 8] — likely unit count mis-parsed as bedroom count`
    );
  }

  // Rule 7: rawRoomSummary looks like a unit/house count rather than a room
  // type list (e.g. "House 67", "67 units", "#31"). If it has a big number
  // but no "房"/"bed"/"studio" keyword, the downstream bedroom parse is
  // unreliable even if it survived the range check.
  if (
    rawRoomSummary &&
    /\d{2,}/.test(rawRoomSummary) &&
    !/bed|bedroom|房|studio|開放式/i.test(rawRoomSummary)
  ) {
    reasons.push(
      `rawRoomSummary "${rawRoomSummary}" contains large numbers but no room-type keyword — likely mis-parsed unit list`
    );
  }

  return {
    quality: reasons.length > 0 ? "suspicious" : "normal",
    reasons,
  };
}
