/**
 * Simplified illustrative stamp duty scale for the mortgage calculator.
 * (Not a substitute for legal advice or IRD stamping.)
 */
export function calculateStampDuty(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (price <= 3_000_000) return 100;
  if (price <= 6_000_000) return price * 0.015;
  if (price <= 10_080_000) return price * 0.03;
  if (price <= 20_000_000) return price * 0.0375;
  return price * 0.0425;
}
