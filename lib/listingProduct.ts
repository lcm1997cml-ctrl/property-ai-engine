import type {
  NormalizedListing,
  ListingSourceType,
  ComparisonRole,
} from "@/types/listing";

/** Curated new-development IDs (primary dataset). */
const PRIMARY_NEW_IDS = new Set<string>([
  "lst-004",
  "lst-005",
  "lst-006",
  "lst-017",
]);

/** Representative second-hand estates for cross-comparison. */
const FEATURED_SECONDARY_IDS = new Set<string>([
  "lst-001",
  "lst-002",
  "lst-003",
  "lst-010",
  "lst-012",
]);

function newSummary(l: NormalizedListing): string {
  if (l.district === "啟德") {
    return "同區二手可買更大面積，但新樓配套更新、樓齡較新；若重視會所及品牌，新盤較合適。";
  }
  return "此為新盤／近新供應；如重視呎數及即住，可同時參考下方同區精選二手作價錢對照。";
}

function secondarySummary(l: NormalizedListing): string {
  if (l.estateName.includes("第一城")) {
    return "同區二手可買更大實用面積，但樓齡及管理成本與新盤不同；適合預算型首置及換樓參考。";
  }
  if (l.estateName.includes("名城")) {
    return "此新盤總價常與附近二手三房接近；如重視港鐵上蓋及即住，二手亦有優勢。";
  }
  return "精選同區近似預算／房型之二手作比較參考，非完整二手市場列表。";
}

function productTags(
  l: NormalizedListing,
  sourceType: ListingSourceType,
  isFeatured: boolean
): string[] {
  const extra: string[] = [];
  if (sourceType === "new") {
    extra.push("新樓推薦");
  } else {
    extra.push("同區二手比較");
    if (isFeatured) extra.push("精選參考");
    const fit =
      l.price < 6_000_000
        ? "預算型首置"
        : l.price < 9_000_000
          ? "適合首置"
          : "換樓參考";
    extra.push(fit);
  }
  const base = l.tags ?? [];
  return [...extra, ...base].slice(0, 6);
}

/**
 * Attach product-direction fields: new vs secondary, comparison role, summaries, tags.
 * Mock data file stays lean; all listings go through this before search / detail.
 */
export function applyProductDefaults(listing: NormalizedListing): NormalizedListing {
  const isNew = PRIMARY_NEW_IDS.has(listing.id);
  const sourceType: ListingSourceType = isNew ? "new" : "secondary";
  const comparisonRole: ComparisonRole = isNew ? "primary" : "comparison";
  const isFeaturedComparison =
    sourceType === "secondary" && FEATURED_SECONDARY_IDS.has(listing.id);

  return {
    ...listing,
    sourceType,
    comparisonRole,
    isFeaturedComparison,
    comparisonSummary: isNew ? newSummary(listing) : secondarySummary(listing),
    tags: productTags(listing, sourceType, isFeaturedComparison),
  };
}
