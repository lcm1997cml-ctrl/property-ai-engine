/**
 * Normalizes raw media items: deduplication, URL cleaning, type detection.
 */

import type { RawMediaItem } from "../parsers/28hseProjectDetailParser";

export interface NormalizedMediaInput {
  mediaType: "image" | "floorplan" | "pdf";
  url: string;
  sortOrder: number;
  sourceUrl?: string;
}

const FLOORPLAN_PATTERNS = [/floor[_-]?plan/i, /floorplan/i, /平面圖/i, /floor/i];
const PDF_PATTERNS       = [/\.pdf$/i, /brochure/i];
const SKIP_PATTERNS      = [
  /\/icons?\//i, /\/logo/i, /\/favicon/i,
  /placeholder/i, /noimage/i, /loading/i,
  /\.gif$/i,
];

function detectMediaType(url: string): NormalizedMediaInput["mediaType"] {
  if (PDF_PATTERNS.some((p) => p.test(url))) return "pdf";
  if (FLOORPLAN_PATTERNS.some((p) => p.test(url))) return "floorplan";
  return "image";
}

function shouldSkip(url: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(url));
}

/**
 * Normalize and deduplicate media items.
 * Images come first, then floorplans, then PDFs.
 */
export function normalizeMedia(
  rawItems: RawMediaItem[],
  sourceUrl?: string
): NormalizedMediaInput[] {
  const seen = new Set<string>();
  const normalized: NormalizedMediaInput[] = [];

  for (const item of rawItems) {
    const url = item.url.trim();
    if (!url || seen.has(url) || shouldSkip(url)) continue;
    seen.add(url);

    normalized.push({
      mediaType: detectMediaType(url),
      url,
      sortOrder: 0, // assigned below
      sourceUrl,
    });
  }

  // Sort: images first, then floorplans, then PDFs
  const typeOrder: Record<NormalizedMediaInput["mediaType"], number> = {
    image: 0,
    floorplan: 1,
    pdf: 2,
  };
  normalized.sort((a, b) => typeOrder[a.mediaType] - typeOrder[b.mediaType]);

  // Assign sort_order
  return normalized.map((item, i) => ({ ...item, sortOrder: i }));
}
