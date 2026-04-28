import { createHash } from "crypto";

/**
 * Generate a stable SHA-256 hash of a normalized object.
 * Used for deduplication: if two crawl runs produce the same hash the record is unchanged.
 */
export function hashNormalized(payload: unknown): string {
  const json = JSON.stringify(payload, Object.keys(payload as object).sort());
  return createHash("sha256").update(json).digest("hex");
}

/**
 * Generate a URL-safe slug from a Chinese/English string.
 * e.g. "啟德·新風尚 1期" → "kai-tak-new-ambience-1"
 *
 * For now: lowercase, strip special chars, replace spaces with dashes.
 * In production, consider a proper pinyin/romanization library.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[·•·\s]+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
