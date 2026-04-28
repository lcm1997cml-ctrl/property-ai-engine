/**
 * Pre-filled WhatsApp messages for listing inquiries.
 *
 * Each listing-related CTA opens WhatsApp with a short, ready-to-send
 * message that names the specific property + states the ask. Users just
 * tap "send" — the agent on the other end immediately knows which listing
 * the inquiry is about.
 *
 * Six intents are supported so the same listing can drive different asks:
 *   general      → 「你好，我對「{屋苑}」有興趣，想了解更多詳情。」
 *   price-list   → 「你好，我想索取「{屋苑}」嘅最新價單，請幫我安排。」
 *   floor-plan   → 「你好，我想索取「{屋苑}」嘅平面圖，請幫我提供。」
 *   report-error → 「你好，我想回報「{屋苑}」嘅資料錯誤：\n錯誤內容：（請填寫）」
 *   viewing      → 「你好，我對「{屋苑}」有興趣，想安排睇樓，請問幾時方便？」
 *   mortgage     → 「你好，我對「{屋苑}」有興趣，想了解按揭安排。」
 */

/**
 * Minimal structural shape — the helper only needs the estate name. Both
 * NormalizedListing and EnrichedListing satisfy this without casts, so any
 * caller can pass whatever listing object they already have on hand.
 */
export interface ListingForInquiry {
  estateName: string;
  titleEn?: string;
  titleZh?: string;
}

export interface BuildInquiryOptions {
  /** Which intent prefix to use. Defaults to `"general"`. */
  intent?:
    | "general"
    | "price-list"
    | "floor-plan"
    | "report-error"
    | "viewing"
    | "mortgage";
}

/**
 * Resolve the display name with the standard preference chain:
 *   titleZh (Chinese, primary) → titleEn (English) → estateName (key).
 */
function resolveName(listing: ListingForInquiry): string {
  return listing.titleZh ?? listing.titleEn ?? listing.estateName;
}

export function buildListingInquiryMessage(
  listing: ListingForInquiry,
  options: BuildInquiryOptions = {}
): string {
  const name = resolveName(listing);
  const intent = options.intent ?? "general";

  switch (intent) {
    case "price-list":
      return `你好，我想索取「${name}」嘅最新價單，請幫我安排。`;
    case "floor-plan":
      return `你好，我想索取「${name}」嘅平面圖，請幫我提供。`;
    case "report-error":
      return `你好，我想回報「${name}」嘅資料錯誤：\n錯誤內容：（請填寫）`;
    case "viewing":
      return `你好，我對「${name}」有興趣，想安排睇樓，請問幾時方便？`;
    case "mortgage":
      return `你好，我對「${name}」有興趣，想了解按揭安排。`;
    default:
      return `你好，我對「${name}」有興趣，想了解更多詳情。`;
  }
}
