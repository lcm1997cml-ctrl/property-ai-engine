/** Shared formatting helpers for property data */

/**
 * Compact HK property price label: 萬 = price / 10,000; 億 = price / 100,000,000.
 * e.g. 11,400,000 → 「1140萬」, not 「1.14億」.
 */
export function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price < 0) return "—";
  const yi = price / 100_000_000;
  if (yi >= 1) {
    const rounded = Math.round(yi * 100) / 100;
    const s = Number.isInteger(rounded)
      ? String(rounded)
      : String(rounded).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return `${s}億`;
  }
  const wan = price / 10_000;
  const wanRounded = Math.round(wan);
  if (Math.abs(wan - wanRounded) < 1e-6) return `${wanRounded}萬`;
  return `${parseFloat(wan.toFixed(1))}萬`;
}

export function formatPsf(psf: number): string {
  return `$${psf.toLocaleString()}/呎`;
}

export function formatArea(sqft: number): string {
  return `${sqft}呎²`;
}

/**
 * Format a bedroom count for display.
 *
 * Guards against parser-leaked garbage values (e.g. bedrooms=67 when a
 * non-standard room-type tab label like "67 units" was mis-parsed for a villa
 * development). Anything outside the plausible residential range [0, 8] is
 * rendered as a neutral placeholder instead of misleading the user.
 */
export function formatBedrooms(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "房型待更新";
  if (n < 0 || n > 8) return "房型待更新";
  if (n === 0) return "開放式";
  return `${n}房`;
}

/**
 * Convenience predicate: is the bedroom count trustworthy enough to display as
 * a specific number? Used by card / compare components to hide ambiguous
 * fallbacks.
 */
export function hasPlausibleBedrooms(n: number | null | undefined): boolean {
  return (
    typeof n === "number" &&
    Number.isFinite(n) &&
    n >= 0 &&
    n <= 8
  );
}

/** Full HKD with thousands separators; rounded to whole dollars (no decimals). */
export function formatHkdCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return "$—";
  const rounded = Math.round(amount);
  if (rounded < 0) {
    return `-$${Math.abs(rounded).toLocaleString("en-HK")}`;
  }
  return `$${rounded.toLocaleString("en-HK")}`;
}

export function formatMortgagePayment(amount: number): string {
  return formatHkdCurrency(amount);
}

/**
 * Monthly amortising mortgage payment (same formula as major HK bank calculators).
 * @param principal loan amount in HKD
 * @param annualRate annual interest as percentage, e.g. 3.25 for 3.25%
 * @param years loan term in years
 */
export function calcMonthlyPayment(
  principal: number,
  annualRate: number,
  years: number
): number {
  const totalMonths = years * 12;
  if (totalMonths <= 0 || principal <= 0) return 0;
  if (annualRate === 0) return principal / totalMonths;
  const monthlyRate = annualRate / 100 / 12;
  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) /
    (Math.pow(1 + monthlyRate, totalMonths) - 1)
  );
}

/** Parse user-entered property price: strip commas/spaces, return finite number or NaN. */
export function parsePropertyPriceInput(raw: string): number {
  const clean = raw.replace(/,/g, "").replace(/\s/g, "");
  if (clean === "") return NaN;
  const n = Number(clean);
  return Number.isFinite(n) ? n : NaN;
}

/** Format a price range for display */
export function formatPriceRange(min: number, max: number): string {
  return `${formatPrice(min)} – ${formatPrice(max)}`;
}

/**
 * Returns the price string, or "售價待公布" when the listing has no confirmed price.
 * Partial listings have price=0 in memory (DB stores NULL).
 */
export function formatPriceDisplay(
  price: number,
  dataCompleteness?: string
): string {
  if (!price || dataCompleteness === "partial") return "售價待公布";
  return formatPrice(price);
}
