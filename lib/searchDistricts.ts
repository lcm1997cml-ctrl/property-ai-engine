import { normalizeDistrict } from "@/lib/districtCanonical";
import { DISTRICTS } from "@/types/listing";

/** True iff the string contains at least one CJK (Chinese) character. */
function hasChinese(s: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s);
}

/**
 * Merges the curated dropdown order with any districts present in the DB.
 *
 * This is a CHINESE-ONLY dropdown — the site's whole front-end is Traditional
 * Chinese, so we never want an English label (e.g. "Aberdeen", "Tsing Yi")
 * leaking into the district selector. Any DB value that fails to normalize to
 * a Chinese label (i.e. the raw string is still the English original because
 * it's missing from DISTRICT_MAP) is dropped here and a console warning is
 * emitted so the missing mapping can be added.
 *
 * Listings whose district can't be normalized are still queryable via the
 * region filter and free-text search — they just don't appear as a filter
 * option by name until DISTRICT_MAP is extended.
 */
export function mergeDistrictOptions(fromDb: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of DISTRICTS) {
    if (d && hasChinese(d) && !seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  const canonicalDb = [
    ...new Set(fromDb.map((raw) => normalizeDistrict(raw || undefined))),
  ];
  for (const d of canonicalDb.sort((a, b) => a.localeCompare(b, "zh-Hant"))) {
    if (!d) continue;
    if (!hasChinese(d)) {
      if (typeof console !== "undefined") {
        console.warn(
          `[searchDistricts] Dropping non-Chinese district "${d}" from dropdown. Add it to DISTRICT_MAP.`
        );
      }
      continue;
    }
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}
