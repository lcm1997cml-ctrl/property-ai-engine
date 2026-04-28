/**
 * Fetches and extracts a Traditional Chinese project name (titleZh) from
 * the 28Hse Chinese page for a given project slug.
 *
 * URL patterns tried in order:
 *   1. https://www.28hse.com/new-properties/{slug}  (HK default — Traditional Chinese)
 *   2. https://www.28hse.com/cn/new-properties/{slug}  (Simplified Chinese — converted to TC)
 *
 * No machine translation is used; names are taken directly from the page.
 */

import * as cheerio from "cheerio";
import { fetchHtml } from "./request";
import type { Logger } from "./logging";

// ─── Simplified → Traditional character map (property-name vocabulary) ────────
// Only characters where the mapping is unambiguous in the context of HK project names.
const S2T: Record<string, string> = {
  // Directions & geography
  "东": "東", "湾": "灣", "门": "門", "岭": "嶺", "桥": "橋",
  // Building / property terms
  "楼": "樓", "阁": "閣", "馆": "館", "园": "園", "庄": "莊",
  // Common name characters
  "华": "華", "发": "發", "广": "廣", "来": "來", "长": "長",
  "汇": "匯", "绿": "綠", "丽": "麗", "锦": "錦", "达": "達",
  "标": "標", "乐": "樂", "艺": "藝", "运": "運", "铁": "鐵",
  "灵": "靈", "兴": "興", "联": "聯", "庆": "慶", "龙": "龍",
  "滨": "濱", "誉": "譽", "宝": "寶", "实": "實", "荣": "榮",
  "银": "銀", "总": "總", "线": "線", "万": "萬", "义": "義",
  "业": "業", "风": "風", "贵": "貴", "杰": "傑", "强": "強",
  "维": "維", "关": "關", "亿": "億", "区": "區", "号": "號",
  "荟": "薈", "礼": "禮", "锐": "銳", "阳": "陽", "众": "眾",
  "鸿": "鴻", "奥": "奧", "跃": "躍", "悦": "悅", "启": "啟",
  "铭": "銘", "营": "營", "卢": "盧", "时": "時", "贤": "賢",
  "辉": "輝", "际": "際", "进": "進", "胜": "勝", "凤": "鳳",
  "传": "傳", "顺": "順", "创": "創", "环": "環", "务": "務",
  "声": "聲", "当": "當", "学": "學", "态": "態", "对": "對",
  "叶": "葉", "载": "載", "后": "後", "观": "觀", "围": "圍",
  "规": "規", "项": "項", "纪": "紀", "龄": "齡", "报": "報",
  "设": "設", "历": "歷", "结": "結", "经": "經", "证": "證",
  "给": "給", "级": "級", "约": "約", "统": "統", "动": "動",
  "备": "備", "国": "國", "图": "圖", "场": "場", "开": "開",
  "为": "為", "办": "辦", "属": "屬", "织": "織", "恒": "恆",
  "丰": "豐", "两": "兩", "无": "無", "气": "氣", "恺": "愷",
  "头": "頭", "样": "樣",
};

/**
 * Convert a Simplified Chinese string to Traditional Chinese.
 * Uses a focused character map for HK property name vocabulary.
 */
function toTraditional(text: string): string {
  return text
    .split("")
    .map((ch) => S2T[ch] ?? ch)
    .join("");
}

interface ChinesePageData {
  title?: string;
  description?: string;
}

/**
 * Extract Chinese project name and description from a 28Hse Chinese detail page.
 */
function extractDataFromHtml(html: string): ChinesePageData {
  const $ = cheerio.load(html);

  // Title: same DOM selector as English parser
  let title: string | undefined;
  const h2Title = $(".newprop_whole_page_results h2.ui.header strong")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (h2Title) {
    title = h2Title;
  } else {
    const ogTitle = $('meta[property="og:title"]').attr("content");
    if (ogTitle) {
      const part = ogTitle.split(/\s*[|–-]\s*/)[0]?.trim();
      if (part) title = part;
    }
  }

  // Description: same selector as English parser
  const rawDesc = $(".newprop_whole_page_results .column.intro")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const description = rawDesc || undefined;

  return { title, description };
}

/**
 * Determine whether a title looks like Simplified Chinese by checking for
 * the presence of characters that only exist in our S2T map.
 */
function looksSimplified(text: string): boolean {
  return text.split("").some((ch) => ch in S2T);
}

interface ChineseTitleResult {
  titleZh: string;
  /** Chinese description from .column.intro, if found */
  descriptionZh?: string;
  /** URL the title was fetched from */
  source: string;
  /** Whether the title was converted from Simplified Chinese */
  converted: boolean;
}

/**
 * Fetch a Traditional Chinese project name for a given 28Hse slug.
 *
 * Returns null if neither URL pattern yields a usable title.
 */
export async function fetchChineseTitle(
  hseSlug: string,
  logger: Logger
): Promise<ChineseTitleResult | null> {
  const patterns: Array<{ url: string; isSimplified: boolean }> = [
    {
      url: `https://www.28hse.com/new-properties/${hseSlug}`,
      isSimplified: false,
    },
    {
      url: `https://www.28hse.com/cn/new-properties/${hseSlug}`,
      isSimplified: true,
    },
  ];

  for (const { url, isSimplified } of patterns) {
    let html: string;
    try {
      html = await fetchHtml(url, { rateDelayMs: 2000 });
    } catch {
      logger.debug("Chinese page not reachable", { url });
      continue;
    }

    const { title: rawTitle, description: rawDesc } = extractDataFromHtml(html);
    if (!rawTitle) {
      logger.warn("Chinese page fetched but title selector matched nothing", { url });
      continue;
    }

    logger.info("Chinese page found", { url, rawTitle });

    // Determine if conversion is needed
    const needsConversion = isSimplified || looksSimplified(rawTitle);
    const titleZh = needsConversion ? toTraditional(rawTitle) : rawTitle;
    const descriptionZh = rawDesc
      ? needsConversion ? toTraditional(rawDesc) : rawDesc
      : undefined;

    if (needsConversion && titleZh !== rawTitle) {
      logger.info("titleZh converted from Simplified to Traditional", {
        hseSlug,
        before: rawTitle,
        after: titleZh,
      });
    } else {
      logger.info("titleZh extracted", { hseSlug, titleZh });
    }

    return { titleZh, descriptionZh, source: url, converted: needsConversion };
  }

  logger.info("titleZh not found — will use titleEn fallback", { hseSlug });
  return null;
}
