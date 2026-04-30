/**
 * Seed curated featured second-hand (resale) listings for cross-comparison.
 *
 * The 28Hse crawler only ingests new developments. Without same-district
 * resale baselines, buyers can't tell whether a new-dev's psf is reasonable.
 * This script upserts a hand-curated set of representative resale estates
 * per district, all flagged as:
 *   sourceType       = "secondary"
 *   comparisonRole   = "comparison"
 *   isFeatured       = true
 *
 * Each estate is ONE Listing with MULTIPLE ListingUnit rows (e.g. 1房/2房/3房)
 * so the detail page's 戶型售價一覽 table renders multiple rows for richer
 * comparison.
 *
 * Selection criteria (applied to every entry):
 *   1. 區內代表性 — iconic, well-known estate that locals & agents quote as
 *      "the benchmark" for that district (e.g. 太古城 for 鰂魚涌).
 *   2. 流通量      — large estate (typically ≥1,000 units) with steady resale
 *      activity, so the median ask is meaningful.
 *   3. 港鐵 / 主要交通 — on or directly adjacent to MTR / major transit; same
 *      access lens buyers use when comparing against the new-dev.
 *   4. 價位多樣化 — across a district we deliberately mix older / cheaper
 *      with newer / pricier so the user sees the full spread.
 *   5. 房型對齊新樓 — bedroom & saleable-area mix mirrors typical new-dev
 *      cuts (1房 / 2房 / 3房) for apples-to-apples comparison.
 *
 * Pricing & area numbers are estate-level reference medians for early-2026
 * — NOT specific 放盤. Tagged 「屋苑成交參考」 so users understand it's a
 * benchmark, not a live listing.
 *
 * ⚠️ ACCURACY POLICY ⚠️
 *   ONLY include a `bedrooms` entry for a unit type that ACTUALLY exists in
 *   that estate's current market supply. Don't add 1房/2房 entries
 *   "to make the table look complete" — fabricating a price for a unit type
 *   the estate doesn't have is worse than omitting that row entirely.
 *   When in doubt, omit and let the comparison table show fewer rows.
 *
 *   Periodically verify each estate's unit mix against:
 *     • 28Hse / Centaline / Midland recent transactions
 *     • the estate's actual deed plans
 *     • on-the-ground agent input
 *
 * Idempotent: upserts by slug; safe to re-run.
 *
 * Usage (from repo root):
 *   npx tsx crawler/scripts/seedSecondaryListings.ts
 *
 * Optional env:
 *   DRY_RUN=true   → log what would be written, write nothing
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { prisma } from "@/lib/db";

function loadDotEnv(): void {
  const p = resolve(process.cwd(), ".env");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

interface SeedUnit {
  bedrooms: number;            // 0 = studio
  saleableAreaMin: number;     // sq ft
  saleableAreaMax?: number;
  priceMin: number;            // HKD
  priceMax?: number;
  unitCount?: number;          // approx supply (optional)
}

interface SeedEstate {
  /** Slug — unique, snake-case. Pattern: <name>-<district>-ref */
  slug: string;
  /** Romanized name (back-compat with schema field) */
  estateName: string;
  /** Chinese display name (primary in UI) */
  titleZh: string;
  /** Canonical district label (Chinese). Must match DISTRICT_MAP values. */
  district: string;
  subDistrict?: string;
  age: number;
  completionYear?: number;
  developer?: string;
  facing?: string;
  /** Display tags (auto-prepended with 屋苑成交參考 / 二手比較). */
  tags?: string[];
  descriptionZh: string;
  /** 1-line cross-comparison hint vs same-district new-dev. */
  comparisonSummary: string;
  /** Multiple room types — primary differentiator for buyer comparison. */
  units: SeedUnit[];
}

// ─── Curated picks ───────────────────────────────────────────────────────────

const SEED: SeedEstate[] = [
  // ── 沙田 ────────────────────────────────────────────────────────────────────
  {
    slug: "city-one-shatin-ref",
    estateName: "City One Shatin",
    titleZh: "沙田第一城",
    district: "沙田",
    subDistrict: "石門",
    age: 45,
    completionYear: 1981,
    developer: "新鴻基地產",
    tags: ["港鐵站上蓋", "成熟屋苑", "校網好"],
    descriptionZh:
      "沙田第一城係香港最大型成熟屋苑之一，1981年入伙，臨近石門站及城門河。流通量大，戶型由1房至3房齊備，常作沙田區二手指標。",
    comparisonSummary:
      "新樓2房入場約HK$8M-10M；第一城提供約HK$2-3M折讓，惟樓齡約45年，重視預算為先建議參考。",
    units: [
      { bedrooms: 1, saleableAreaMin: 290, saleableAreaMax: 330, priceMin: 4_300_000, priceMax: 4_900_000 },
      { bedrooms: 2, saleableAreaMin: 430, saleableAreaMax: 490, priceMin: 6_500_000, priceMax: 7_400_000 },
      { bedrooms: 3, saleableAreaMin: 560, saleableAreaMax: 640, priceMin: 8_500_000, priceMax: 9_800_000 },
    ],
  },
  {
    slug: "fortune-city-one-shatin-ref",
    estateName: "Fortune City One Garden",
    titleZh: "駿景園",
    district: "沙田",
    subDistrict: "火炭",
    age: 24,
    completionYear: 2002,
    developer: "新鴻基地產",
    tags: ["馬場景", "成熟屋苑", "校網好"],
    descriptionZh:
      "駿景園鄰近沙田馬場及火炭站，會所設施完善，居住品質較第一城新；屬沙田中價二手代表。",
    comparisonSummary:
      "新樓2房落地門檻較高；駿景園2房約HK$8M、樓齡24年，性價比明顯。",
    units: [
      { bedrooms: 2, saleableAreaMin: 470, saleableAreaMax: 520, priceMin: 7_800_000, priceMax: 8_700_000 },
      { bedrooms: 3, saleableAreaMin: 600, saleableAreaMax: 700, priceMin: 10_200_000, priceMax: 12_000_000 },
    ],
  },

  // ── 大圍 ────────────────────────────────────────────────────────────────────
  {
    slug: "festival-city-tai-wai-ref",
    estateName: "Festival City",
    titleZh: "名城",
    district: "大圍",
    subDistrict: "大圍站",
    age: 15,
    completionYear: 2011,
    developer: "新鴻基地產",
    tags: ["港鐵站上蓋", "成熟屋苑"],
    descriptionZh:
      "名城係大圍站上蓋大型屋苑，會所配套齊備。主打3房戶型，係大圍二手三房主力對比盤。",
    comparisonSummary:
      "新樓3房同價位面積較細；名城提供15年樓齡與成熟會所配套。",
    // NOTE: 名城 actually only ships 3房 in this featured-comparison context.
    // Earlier versions of this seed mistakenly included fabricated 1房 / 2房
    // entries — those room types do not exist in 名城 inventory and have been
    // removed (per operator correction). Always verify a unit type exists in
    // current market supply before adding a row.
    units: [
      { bedrooms: 3, saleableAreaMin: 540, saleableAreaMax: 620, priceMin: 9_800_000, priceMax: 11_500_000 },
    ],
  },
  {
    slug: "world-wide-gardens-tai-wai-ref",
    estateName: "World-Wide Gardens",
    titleZh: "海福花園",
    district: "大圍",
    subDistrict: "大圍",
    age: 41,
    completionYear: 1985,
    tags: ["校網好", "成熟屋苑"],
    descriptionZh:
      "海福花園係大圍老牌屋苑，2-3房戶型實用面積較大，呎價約HK$13,000-14,000，係預算型家庭參考。",
    comparisonSummary:
      "新樓三房常超HK$13M；海福花園三房約HK$7M-8M，樓齡較舊但實用面積大。",
    units: [
      { bedrooms: 2, saleableAreaMin: 420, saleableAreaMax: 470, priceMin: 5_500_000, priceMax: 6_200_000 },
      { bedrooms: 3, saleableAreaMin: 510, saleableAreaMax: 580, priceMin: 6_800_000, priceMax: 7_900_000 },
    ],
  },

  // ── 馬鞍山 ──────────────────────────────────────────────────────────────────
  {
    slug: "sunshine-city-ref",
    estateName: "Sunshine City",
    titleZh: "新港城",
    district: "馬鞍山",
    subDistrict: "馬鞍山市中心",
    age: 36,
    completionYear: 1990,
    developer: "新鴻基地產",
    facing: "海景",
    tags: ["港鐵站上蓋", "海景", "成熟屋苑"],
    descriptionZh:
      "新港城係馬鞍山港鐵站上蓋大型屋苑，1-3房戶型流通量大。呎價約HK$13,000-13,500，係區內入場門檻最低的MTR上蓋選擇之一。",
    comparisonSummary:
      "新樓2房同區門檻HK$7M+；新港城2房約HK$6M、樓齡較舊但港鐵直達。",
    units: [
      { bedrooms: 1, saleableAreaMin: 320, saleableAreaMax: 360, priceMin: 4_300_000, priceMax: 4_800_000 },
      { bedrooms: 2, saleableAreaMin: 440, saleableAreaMax: 490, priceMin: 5_800_000, priceMax: 6_500_000 },
      { bedrooms: 3, saleableAreaMin: 560, saleableAreaMax: 650, priceMin: 7_200_000, priceMax: 8_300_000 },
    ],
  },
  {
    slug: "lake-silver-ref",
    estateName: "Lake Silver",
    titleZh: "銀湖天峰",
    district: "馬鞍山",
    subDistrict: "烏溪沙",
    age: 12,
    completionYear: 2014,
    developer: "新鴻基地產",
    facing: "海景",
    tags: ["海景", "新一代屋苑"],
    descriptionZh:
      "銀湖天峰位於烏溪沙站，呎價約HK$15,000，會所配套完善，係馬鞍山次新盤代表。",
    comparisonSummary:
      "新樓三房約HK$11M+；銀湖天峰提供HK$8M-10M、樓齡僅12年的次新選擇。",
    units: [
      { bedrooms: 2, saleableAreaMin: 460, saleableAreaMax: 520, priceMin: 7_300_000, priceMax: 8_200_000 },
      { bedrooms: 3, saleableAreaMin: 560, saleableAreaMax: 680, priceMin: 8_400_000, priceMax: 10_200_000 },
    ],
  },

  // ── 將軍澳 ──────────────────────────────────────────────────────────────────
  {
    slug: "metro-city-tko-ref",
    estateName: "Metro City",
    titleZh: "新都城",
    district: "將軍澳",
    subDistrict: "將軍澳市中心",
    age: 26,
    completionYear: 2000,
    developer: "信和置業",
    tags: ["港鐵站上蓋", "校網好", "成熟屋苑"],
    descriptionZh:
      "新都城係將軍澳市中心港鐵上蓋大型屋苑，購物及校網成熟。1-3房戶型供應齊全。",
    comparisonSummary:
      "新樓2房同區普遍HK$8M+；新都城2房約HK$6.5M、配套成熟，預算型首選。",
    units: [
      { bedrooms: 1, saleableAreaMin: 320, saleableAreaMax: 370, priceMin: 4_500_000, priceMax: 5_100_000 },
      { bedrooms: 2, saleableAreaMin: 460, saleableAreaMax: 520, priceMin: 6_400_000, priceMax: 7_300_000 },
      { bedrooms: 3, saleableAreaMin: 620, saleableAreaMax: 720, priceMin: 8_400_000, priceMax: 9_800_000 },
    ],
  },
  {
    slug: "tseung-kwan-o-plaza-ref",
    estateName: "Tseung Kwan O Plaza",
    titleZh: "將軍澳中心",
    district: "將軍澳",
    subDistrict: "將軍澳市中心",
    age: 30,
    completionYear: 1996,
    tags: ["港鐵", "成熟屋苑"],
    descriptionZh:
      "將軍澳中心鄰近TKO站，呎價約HK$14,000，2-3房戶型實用面積大。",
    comparisonSummary:
      "新樓三房門檻較高；將軍澳中心3房約HK$8M-10M，實用面積大、總價可控。",
    units: [
      { bedrooms: 2, saleableAreaMin: 480, saleableAreaMax: 540, priceMin: 6_500_000, priceMax: 7_500_000 },
      { bedrooms: 3, saleableAreaMin: 600, saleableAreaMax: 690, priceMin: 8_600_000, priceMax: 9_900_000 },
    ],
  },

  // ── 康城 (Lohas Park) ──────────────────────────────────────────────────────
  {
    slug: "lohas-park-le-prestige-ref",
    estateName: "Lohas Park Le Prestige",
    titleZh: "日出康城 領峯",
    district: "康城",
    subDistrict: "康城",
    age: 16,
    completionYear: 2010,
    developer: "南豐 / 港鐵",
    tags: ["港鐵站上蓋", "大型屋苑"],
    descriptionZh:
      "日出康城領峯係康城最早期入伙樓盤，臨近康城港鐵站。會所及商場配套完善，係康城新樓的首選二手對比盤。",
    comparisonSummary:
      "康城新樓陸續入伙，2房門檻HK$7M+；領峯2房約HK$5.6M、樓齡16年但港鐵直達。",
    units: [
      { bedrooms: 1, saleableAreaMin: 320, saleableAreaMax: 380, priceMin: 4_400_000, priceMax: 5_000_000 },
      { bedrooms: 2, saleableAreaMin: 410, saleableAreaMax: 490, priceMin: 5_600_000, priceMax: 6_500_000 },
      { bedrooms: 3, saleableAreaMin: 580, saleableAreaMax: 670, priceMin: 8_200_000, priceMax: 9_500_000 },
    ],
  },

  // ── 啟德 ────────────────────────────────────────────────────────────────────
  {
    slug: "oasis-kai-tak-ref",
    estateName: "Oasis Kai Tak",
    titleZh: "啟德 1號",
    district: "啟德",
    subDistrict: "啟德",
    age: 8,
    completionYear: 2018,
    developer: "中海外",
    facing: "維港景",
    tags: ["新一代屋苑", "近港鐵", "維港景"],
    descriptionZh:
      "啟德1號係啟德首期次新盤，部分單位享維港景。呎價約HK$19,000-20,000，與本區新樓對比展現「即住」優勢。",
    comparisonSummary:
      "啟德新盤2房門檻HK$10M+；啟德1號約HK$8M-10M、樓齡8年，提供即住選擇。",
    units: [
      { bedrooms: 1, saleableAreaMin: 320, saleableAreaMax: 380, priceMin: 6_300_000, priceMax: 7_200_000 },
      { bedrooms: 2, saleableAreaMin: 430, saleableAreaMax: 510, priceMin: 8_400_000, priceMax: 9_800_000 },
      { bedrooms: 3, saleableAreaMin: 600, saleableAreaMax: 720, priceMin: 12_500_000, priceMax: 14_500_000 },
    ],
  },
  {
    slug: "grand-central-kai-tak-ref",
    estateName: "Grand Central Kai Tak",
    titleZh: "嘉峯滙",
    district: "啟德",
    subDistrict: "啟德",
    age: 5,
    completionYear: 2021,
    developer: "會德豐",
    facing: "維港景",
    tags: ["新一代屋苑", "維港景"],
    descriptionZh:
      "嘉峯滙係啟德新發展區內次新代表，2-3房戶型呎價約HK$22,000，配套成熟。",
    comparisonSummary:
      "啟德全新3房常逾HK$18M；嘉峯滙提供HK$13M-16M、樓齡5年的折衷選擇。",
    units: [
      { bedrooms: 2, saleableAreaMin: 460, saleableAreaMax: 540, priceMin: 9_800_000, priceMax: 11_500_000 },
      { bedrooms: 3, saleableAreaMin: 620, saleableAreaMax: 740, priceMin: 13_800_000, priceMax: 16_500_000 },
    ],
  },

  // ── 紅磡 ────────────────────────────────────────────────────────────────────
  {
    slug: "whampoa-garden-ref",
    estateName: "Whampoa Garden",
    titleZh: "黃埔花園",
    district: "紅磡",
    subDistrict: "黃埔",
    age: 38,
    completionYear: 1988,
    developer: "和記黃埔",
    tags: ["近港鐵", "成熟屋苑", "校網好"],
    descriptionZh:
      "黃埔花園係紅磡黃埔站上蓋大型成熟屋苑，1-3房供應齊全，呎價約HK$16,000，配套及交通成熟。",
    comparisonSummary:
      "新樓2房同區常HK$10M+；黃埔花園約HK$7.5M、樓齡較長但配套齊備。",
    units: [
      { bedrooms: 1, saleableAreaMin: 320, saleableAreaMax: 370, priceMin: 4_900_000, priceMax: 5_600_000 },
      { bedrooms: 2, saleableAreaMin: 460, saleableAreaMax: 540, priceMin: 7_500_000, priceMax: 8_800_000 },
      { bedrooms: 3, saleableAreaMin: 600, saleableAreaMax: 700, priceMin: 10_200_000, priceMax: 12_000_000 },
    ],
  },
  {
    slug: "harbour-place-ref",
    estateName: "Harbour Place",
    titleZh: "海濱南岸",
    district: "紅磡",
    subDistrict: "紅磡",
    age: 16,
    completionYear: 2010,
    developer: "信和置業",
    facing: "海景",
    tags: ["海景", "近港鐵"],
    descriptionZh:
      "海濱南岸位於紅磡海旁，2-3房單位呎價約HK$19,000，海景及交通俱佳。",
    comparisonSummary:
      "新樓三房同區HK$15M+；海濱南岸提供HK$12M-15M、海景及16年樓齡的次新選擇。",
    units: [
      { bedrooms: 2, saleableAreaMin: 480, saleableAreaMax: 560, priceMin: 9_500_000, priceMax: 11_200_000 },
      { bedrooms: 3, saleableAreaMin: 660, saleableAreaMax: 780, priceMin: 12_500_000, priceMax: 14_800_000 },
    ],
  },

  // ── 何文田 ──────────────────────────────────────────────────────────────────
  {
    slug: "homantin-hillside-ref",
    estateName: "Homantin Hillside",
    titleZh: "何文田山畔",
    district: "何文田",
    subDistrict: "何文田",
    age: 12,
    completionYear: 2014,
    developer: "信和置業",
    facing: "山景",
    tags: ["豪宅", "校網好"],
    descriptionZh:
      "何文田山畔位於名校網內，環境清靜，呎價約HK$23,000-24,000。",
    comparisonSummary:
      "何文田新樓豪宅普遍HK$15M+；山畔提供HK$11M-13M、12年樓齡的成熟選擇。",
    units: [
      { bedrooms: 2, saleableAreaMin: 500, saleableAreaMax: 580, priceMin: 11_500_000, priceMax: 13_800_000 },
      { bedrooms: 3, saleableAreaMin: 700, saleableAreaMax: 820, priceMin: 16_500_000, priceMax: 19_500_000 },
    ],
  },

  // ── 鰂魚涌 ──────────────────────────────────────────────────────────────────
  {
    slug: "taikoo-shing-ref",
    estateName: "Taikoo Shing",
    titleZh: "太古城",
    district: "鰂魚涌",
    subDistrict: "太古城",
    age: 45,
    completionYear: 1981,
    developer: "太古地產",
    tags: ["港鐵站上蓋", "校網好", "成熟屋苑"],
    descriptionZh:
      "太古城係港島東標誌性屋苑，1-3房戶型流通量極高，社區配套及校網極佳。",
    comparisonSummary:
      "港島東新樓2房門檻HK$15M+；太古城提供HK$11M-13M、樓齡較長但流通度極高。",
    units: [
      { bedrooms: 1, saleableAreaMin: 380, saleableAreaMax: 450, priceMin: 7_800_000, priceMax: 9_300_000 },
      { bedrooms: 2, saleableAreaMin: 540, saleableAreaMax: 640, priceMin: 11_200_000, priceMax: 13_500_000 },
      { bedrooms: 3, saleableAreaMin: 700, saleableAreaMax: 850, priceMin: 14_800_000, priceMax: 17_800_000 },
    ],
  },
  {
    slug: "kornhill-ref",
    estateName: "Kornhill",
    titleZh: "康怡花園",
    district: "鰂魚涌",
    subDistrict: "鰂魚涌",
    age: 39,
    completionYear: 1987,
    developer: "太古地產",
    tags: ["近港鐵", "校網好"],
    descriptionZh:
      "康怡花園係鰂魚涌大型成熟屋苑，2-3房單位呎價約HK$17,500-18,000。",
    comparisonSummary:
      "港島東新樓三房動輒HK$18M+；康怡提供HK$10M-12M、流通量大的家庭選擇。",
    units: [
      { bedrooms: 2, saleableAreaMin: 480, saleableAreaMax: 560, priceMin: 8_800_000, priceMax: 10_400_000 },
      { bedrooms: 3, saleableAreaMin: 600, saleableAreaMax: 720, priceMin: 10_800_000, priceMax: 12_500_000 },
    ],
  },

  // ── 北角 ────────────────────────────────────────────────────────────────────
  {
    slug: "city-garden-north-point-ref",
    estateName: "City Garden",
    titleZh: "城市花園",
    district: "北角",
    subDistrict: "北角",
    age: 42,
    completionYear: 1984,
    developer: "新鴻基地產",
    tags: ["近港鐵", "校網好", "成熟屋苑"],
    descriptionZh:
      "城市花園係北角港鐵旁老牌大型屋苑，2-3房單位呎價約HK$18,000-18,500。",
    comparisonSummary:
      "新樓2房同區HK$13M+；城市花園提供HK$9M-11M、樓齡較長但港鐵步行5分鐘。",
    units: [
      { bedrooms: 2, saleableAreaMin: 530, saleableAreaMax: 620, priceMin: 9_800_000, priceMax: 11_500_000 },
      { bedrooms: 3, saleableAreaMin: 680, saleableAreaMax: 780, priceMin: 12_500_000, priceMax: 14_500_000 },
    ],
  },
  {
    slug: "island-place-north-point-ref",
    estateName: "Island Place",
    titleZh: "港運城",
    district: "北角",
    subDistrict: "北角",
    age: 30,
    completionYear: 1996,
    developer: "和記黃埔",
    facing: "海景",
    tags: ["海景", "近港鐵"],
    descriptionZh:
      "港運城2-3房單位呎價約HK$20,500，部分單位可享北角海景。",
    comparisonSummary:
      "北角新樓3房門檻HK$18M+；港運城提供HK$13M-15M、樓齡30年的維港景選擇。",
    units: [
      { bedrooms: 2, saleableAreaMin: 540, saleableAreaMax: 610, priceMin: 10_500_000, priceMax: 12_300_000 },
      { bedrooms: 3, saleableAreaMin: 660, saleableAreaMax: 760, priceMin: 13_500_000, priceMax: 15_800_000 },
    ],
  },

  // ── 元朗 ────────────────────────────────────────────────────────────────────
  {
    slug: "yoho-town-ref",
    estateName: "YOHO Town",
    titleZh: "YOHO TOWN",
    district: "元朗",
    subDistrict: "元朗市中心",
    age: 20,
    completionYear: 2006,
    developer: "新鴻基地產",
    tags: ["港鐵站上蓋", "成熟屋苑"],
    descriptionZh:
      "YOHO TOWN係元朗站上蓋大型屋苑，1-3房供應齊全，呎價約HK$12,000-12,500。",
    comparisonSummary:
      "元朗新樓2房動輒HK$7M+；YOHO TOWN約HK$5M-6M、20年樓齡的MTR選擇。",
    units: [
      { bedrooms: 1, saleableAreaMin: 320, saleableAreaMax: 380, priceMin: 3_900_000, priceMax: 4_500_000 },
      { bedrooms: 2, saleableAreaMin: 440, saleableAreaMax: 510, priceMin: 5_400_000, priceMax: 6_300_000 },
      { bedrooms: 3, saleableAreaMin: 560, saleableAreaMax: 660, priceMin: 6_800_000, priceMax: 8_000_000 },
    ],
  },
  {
    slug: "kingswood-villas-ref",
    estateName: "Kingswood Villas",
    titleZh: "嘉湖山莊",
    district: "元朗",
    subDistrict: "天水圍",
    age: 30,
    completionYear: 1995,
    developer: "長江實業",
    tags: ["低價入市", "成熟屋苑"],
    descriptionZh:
      "嘉湖山莊位於天水圍，2-3房單位呎價約HK$9,000，係新界西最低門檻三房之一。",
    comparisonSummary:
      "新樓3房門檻HK$10M+；嘉湖山莊HK$4.8M入場，呎數大但離市區較遠。",
    units: [
      { bedrooms: 2, saleableAreaMin: 410, saleableAreaMax: 470, priceMin: 3_700_000, priceMax: 4_300_000 },
      { bedrooms: 3, saleableAreaMin: 530, saleableAreaMax: 610, priceMin: 4_800_000, priceMax: 5_600_000 },
    ],
  },

  // ── 屯門 ────────────────────────────────────────────────────────────────────
  {
    slug: "tai-hing-gardens-ref",
    estateName: "Tai Hing Gardens",
    titleZh: "大興花園",
    district: "屯門",
    subDistrict: "大興",
    age: 47,
    completionYear: 1979,
    tags: ["低呎價", "成熟屋苑", "校網好"],
    descriptionZh:
      "大興花園係屯門最老牌大型屋苑，呎價約HK$8,000，係新界西最低入場門檻之一。",
    comparisonSummary:
      "屯門新樓2房約HK$6M+；大興花園HK$3.9M入場、樓齡較長但實用面積大。",
    units: [
      { bedrooms: 2, saleableAreaMin: 470, saleableAreaMax: 550, priceMin: 3_900_000, priceMax: 4_500_000 },
      { bedrooms: 3, saleableAreaMin: 580, saleableAreaMax: 670, priceMin: 4_800_000, priceMax: 5_500_000 },
    ],
  },
  {
    slug: "park-vista-tuen-mun-ref",
    estateName: "Park Vista",
    titleZh: "瓏門",
    district: "屯門",
    subDistrict: "屯門市中心",
    age: 15,
    completionYear: 2011,
    developer: "新鴻基地產 / 長實",
    tags: ["近港鐵", "新一代屋苑"],
    descriptionZh:
      "瓏門位於屯門站上蓋，2-3房單位呎價約HK$13,000，係屯門次新盤代表。",
    comparisonSummary:
      "屯門新樓3房常HK$10M+；瓏門提供HK$7.8M-9M、樓齡15年的MTR三房。",
    units: [
      { bedrooms: 2, saleableAreaMin: 460, saleableAreaMax: 530, priceMin: 6_500_000, priceMax: 7_500_000 },
      { bedrooms: 3, saleableAreaMin: 590, saleableAreaMax: 690, priceMin: 7_800_000, priceMax: 9_000_000 },
    ],
  },

  // ── 荃灣 ────────────────────────────────────────────────────────────────────
  {
    slug: "riviera-gardens-tsuen-wan-ref",
    estateName: "Riviera Gardens",
    titleZh: "海濱花園",
    district: "荃灣",
    subDistrict: "荃灣市中心",
    age: 41,
    completionYear: 1985,
    facing: "海景",
    tags: ["海景", "近港鐵", "成熟屋苑"],
    descriptionZh:
      "海濱花園係荃灣老牌海景大型屋苑，2-3房呎價約HK$13,000-13,500。",
    comparisonSummary:
      "荃灣新樓2房門檻HK$7M+；海濱花園HK$5M-6M、樓齡較長但港鐵步行可達。",
    units: [
      { bedrooms: 2, saleableAreaMin: 410, saleableAreaMax: 480, priceMin: 5_300_000, priceMax: 6_200_000 },
      { bedrooms: 3, saleableAreaMin: 540, saleableAreaMax: 620, priceMin: 6_800_000, priceMax: 8_000_000 },
    ],
  },
  {
    slug: "ocean-pride-tsuen-wan-ref",
    estateName: "Ocean Pride",
    titleZh: "海之戀",
    district: "荃灣",
    subDistrict: "荃灣西",
    age: 8,
    completionYear: 2018,
    developer: "新鴻基地產",
    facing: "海景",
    tags: ["新一代屋苑", "海景"],
    descriptionZh:
      "海之戀位於荃灣西站上蓋，2-3房單位呎價約HK$17,500，係荃灣次新盤代表。",
    comparisonSummary:
      "荃灣新樓3房常HK$14M+；海之戀提供HK$11M-13M、樓齡8年的次新海景選擇。",
    units: [
      { bedrooms: 2, saleableAreaMin: 460, saleableAreaMax: 540, priceMin: 8_300_000, priceMax: 9_800_000 },
      { bedrooms: 3, saleableAreaMin: 640, saleableAreaMax: 780, priceMin: 11_200_000, priceMax: 13_500_000 },
    ],
  },

  // ── 大埔 ────────────────────────────────────────────────────────────────────
  {
    slug: "tai-po-centre-ref",
    estateName: "Tai Po Centre",
    titleZh: "大埔中心",
    district: "大埔",
    subDistrict: "大埔市中心",
    age: 41,
    completionYear: 1985,
    tags: ["近港鐵", "成熟屋苑"],
    descriptionZh:
      "大埔中心係大埔市中心地標大型屋苑，1-3房戶型供應齊全，呎價約HK$11,500-12,000。",
    comparisonSummary:
      "大埔新樓2房門檻HK$7M+；大埔中心HK$4.9M-5.7M入場、配套成熟。",
    units: [
      { bedrooms: 1, saleableAreaMin: 280, saleableAreaMax: 330, priceMin: 3_500_000, priceMax: 4_100_000 },
      { bedrooms: 2, saleableAreaMin: 420, saleableAreaMax: 490, priceMin: 4_900_000, priceMax: 5_700_000 },
      { bedrooms: 3, saleableAreaMin: 560, saleableAreaMax: 650, priceMin: 6_500_000, priceMax: 7_600_000 },
    ],
  },
  {
    slug: "mayfair-by-the-sea-tai-po-ref",
    estateName: "Mayfair By The Sea II",
    titleZh: "嵐山",
    district: "大埔",
    subDistrict: "白石角",
    age: 12,
    completionYear: 2014,
    developer: "信和 / 嘉華",
    facing: "海景",
    tags: ["海景", "新一代屋苑"],
    descriptionZh:
      "嵐山位於白石角，呎價約HK$15,500-16,000，配套會所完善，鄰近科學園。",
    comparisonSummary:
      "白石角新樓3房常HK$14M+；嵐山提供HK$11M-13M、樓齡12年的次新海景三房。",
    units: [
      { bedrooms: 2, saleableAreaMin: 540, saleableAreaMax: 640, priceMin: 8_500_000, priceMax: 10_000_000 },
      { bedrooms: 3, saleableAreaMin: 720, saleableAreaMax: 880, priceMin: 11_500_000, priceMax: 13_800_000 },
    ],
  },
];

// ─── Listing-level summary derived from units ────────────────────────────────

function deriveListingSummary(units: SeedUnit[]): {
  bedrooms: number;
  saleableArea: number;
  saleableAreaMax: number;
  price: number;
  priceMax: number;
  psf: number;
} {
  // Use the smallest unit (cheapest entry-point) as the headline figure on
  // the search-card; use the spread across all units for min/max.
  const sorted = [...units].sort((a, b) => a.priceMin - b.priceMin);
  const headline = sorted[0]!;
  const allMinAreas = units.map((u) => u.saleableAreaMin);
  const allMaxAreas = units.map((u) => u.saleableAreaMax ?? u.saleableAreaMin);
  const allMinPrices = units.map((u) => u.priceMin);
  const allMaxPrices = units.map((u) => u.priceMax ?? u.priceMin);
  const minArea = Math.min(...allMinAreas);
  const maxArea = Math.max(...allMaxAreas);
  const minPrice = Math.min(...allMinPrices);
  const maxPrice = Math.max(...allMaxPrices);
  return {
    bedrooms: headline.bedrooms,
    saleableArea: minArea,
    saleableAreaMax: maxArea,
    price: minPrice,
    priceMax: maxPrice,
    psf: Math.round(headline.priceMin / headline.saleableAreaMin),
  };
}

function buildTags(seed: SeedEstate): string[] {
  return ["屋苑成交參考", "二手比較", ...(seed.tags ?? [])].slice(0, 8);
}

async function upsertEstate(seed: SeedEstate): Promise<"created" | "updated"> {
  const summary = deriveListingSummary(seed.units);
  const tags = buildTags(seed);

  const existing = await prisma.listing.findUnique({ where: { slug: seed.slug } });

  const data = {
    estateName: seed.estateName,
    titleEn: seed.estateName,
    titleZh: seed.titleZh,
    buildingName: null,
    district: seed.district,
    subDistrict: seed.subDistrict ?? null,
    price: summary.price,
    priceMax: summary.priceMax !== summary.price ? summary.priceMax : null,
    saleableArea: summary.saleableArea,
    saleableAreaMax:
      summary.saleableAreaMax !== summary.saleableArea ? summary.saleableAreaMax : null,
    psf: summary.psf,
    bedrooms: summary.bedrooms,
    bathrooms: null,
    propertyType: "住宅",
    floor: null,
    facing: seed.facing ?? null,
    age: seed.age,
    completionYear: seed.completionYear ?? null,
    developer: seed.developer ?? null,
    description: seed.descriptionZh,
    descriptionZh: seed.descriptionZh,
    source: "manual",
    sourceUrl: null,
    sourceType: "secondary",
    comparisonRole: "comparison",
    isFeatured: true,
    tags,
    status: "active",
    dataCompleteness: "full",
    dataQuality: "normal",
    lastSeenAt: new Date(),
  };

  await prisma.listing.upsert({
    where: { slug: seed.slug },
    update: data,
    create: { slug: seed.slug, ...data },
  });

  // Re-create the seed-tagged ListingUnit rows. We delete only the ones we
  // own (sourceUrl="seed:secondary") so we never wipe DB-crawler data.
  const listing = await prisma.listing.findUnique({
    where: { slug: seed.slug },
    select: { id: true },
  });
  if (!listing) return existing ? "updated" : "created";

  await prisma.listingUnit.deleteMany({
    where: { listingId: listing.id, sourceUrl: "seed:secondary" },
  });

  for (const u of seed.units) {
    const psf = u.saleableAreaMin > 0 ? Math.round(u.priceMin / u.saleableAreaMin) : 0;
    const labelMap: Record<number, string> = { 0: "開放式", 1: "1房", 2: "2房", 3: "3房" };
    const label = u.bedrooms >= 4 ? "4房或以上" : labelMap[u.bedrooms] ?? `${u.bedrooms}房`;
    await prisma.listingUnit.create({
      data: {
        listingId: listing.id,
        unitLabel: label,
        roomCount: u.bedrooms,
        saleableArea: u.saleableAreaMin,
        saleableAreaMax: u.saleableAreaMax ?? null,
        price: u.priceMin,
        priceMax: u.priceMax && u.priceMax !== u.priceMin ? u.priceMax : null,
        pricePerSqft: psf,
        unitCount: u.unitCount ?? null,
        availability: "available",
        sourceUrl: "seed:secondary",
      },
    });
  }

  return existing ? "updated" : "created";
}

/**
 * Reconciliation: delete any DB Listing that was previously inserted by an
 * earlier version of THIS seed script (source="manual" + sourceType="secondary")
 * but whose slug is NOT in the current SEED list.
 *
 * This is what prevents the v1 → v2 duplication problem: v1 inserted slugs
 * like "festival-city-tai-wai-2br-ref" / "world-wide-gardens-tai-wai-3br-ref",
 * v2 introduces a single consolidated "festival-city-tai-wai-ref" / etc., and
 * without reconciliation both ghosts coexist on the search page. ListingUnit
 * rows cascade-delete via the schema's onDelete: Cascade.
 *
 * Safety: we only ever touch rows whose source="manual" AND
 * sourceType="secondary" — crawler-ingested data (source="28hse" etc.) is
 * never affected.
 */
async function reconcileSeedListings(currentSlugs: Set<string>): Promise<number> {
  const orphans = await prisma.listing.findMany({
    where: {
      source: "manual",
      sourceType: "secondary",
      slug: { notIn: [...currentSlugs] },
    },
    select: { id: true, slug: true, titleZh: true },
  });
  if (orphans.length === 0) return 0;

  console.log(`\n  ⌫ Removing ${orphans.length} orphan seed listing(s) no longer in SEED:`);
  for (const o of orphans) {
    console.log(`     - ${o.titleZh ?? "?"}  (slug: ${o.slug})`);
  }

  await prisma.listing.deleteMany({
    where: { id: { in: orphans.map((o) => o.id) } },
  });
  return orphans.length;
}

async function main(): Promise<void> {
  loadDotEnv();
  const dryRun = process.env.DRY_RUN === "true";

  const totalUnits = SEED.reduce((acc, s) => acc + s.units.length, 0);
  const currentSlugs = new Set(SEED.map((s) => s.slug));
  console.log(
    `\n[seedSecondaryListings] ${dryRun ? "DRY-RUN — " : ""}Seeding ${SEED.length} curated estates ` +
      `(${totalUnits} unit-type rows total)\n`
  );

  if (dryRun) {
    // Dry-run: list orphan slugs that *would* be deleted, then list the seeds.
    const orphans = await prisma.listing.findMany({
      where: {
        source: "manual",
        sourceType: "secondary",
        slug: { notIn: [...currentSlugs] },
      },
      select: { slug: true, titleZh: true },
    });
    if (orphans.length > 0) {
      console.log(`  Would delete ${orphans.length} orphan seed listing(s):`);
      for (const o of orphans) {
        console.log(`    - ${o.titleZh ?? "?"}  (slug: ${o.slug})`);
      }
      console.log("");
    }
    for (const s of SEED) {
      console.log(`\n  ${s.titleZh} — ${s.district}${s.subDistrict ? "·" + s.subDistrict : ""}`);
      for (const u of s.units) {
        const psf = Math.round(u.priceMin / u.saleableAreaMin);
        const areaTxt = u.saleableAreaMax
          ? `${u.saleableAreaMin}–${u.saleableAreaMax}呎`
          : `${u.saleableAreaMin}呎`;
        const priceTxt = u.priceMax
          ? `HK$${(u.priceMin / 1e6).toFixed(1)}M–${(u.priceMax / 1e6).toFixed(1)}M`
          : `HK$${(u.priceMin / 1e6).toFixed(1)}M`;
        console.log(`    • ${u.bedrooms}房  ${areaTxt}  ${priceTxt}  ($${psf.toLocaleString()}/呎)`);
      }
    }
    console.log(`\n[DRY-RUN] no DB writes performed.\n`);
    await prisma.$disconnect();
    return;
  }

  // Step 1 — clean up any orphan seed rows from a previous version of this script
  const removed = await reconcileSeedListings(currentSlugs);

  // Step 2 — upsert the current SEED list
  let created = 0;
  let updated = 0;
  for (const seed of SEED) {
    try {
      const result = await upsertEstate(seed);
      if (result === "created") created++;
      else updated++;
      console.log(
        `  ✓ ${result === "created" ? "+" : "~"} ${seed.titleZh}  (${seed.district})  · ${seed.units.length} 戶型`
      );
    } catch (err) {
      console.error(
        `  ✗ failed: ${seed.titleZh}`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `\n[seedSecondaryListings] Done — removed ${removed}, created ${created}, updated ${updated}, ` +
      `total ${SEED.length} estates / ${totalUnits} unit rows\n`
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
