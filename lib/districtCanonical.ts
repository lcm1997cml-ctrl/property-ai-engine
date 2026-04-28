/**
 * Single source of truth for district name normalization (crawler ingest + DB read).
 * Maps common English / alternate spellings to Traditional Chinese labels used in the UI.
 */

/**
 * Lowercased English keys + exact Chinese keys; values are canonical Chinese district labels.
 */
export const DISTRICT_MAP: Record<string, string> = {
  // Kowloon
  "kai tak": "啟德",
  啟德: "啟德",
  "kowloon city": "九龍城",
  九龍城: "九龍城",
  "kwun tong": "觀塘",
  觀塘: "觀塘",
  "sham shui po": "深水埗",
  深水埗: "深水埗",
  "nam cheong": "南昌",
  南昌: "南昌",
  olympic: "奧運",
  奧運: "奧運",
  "kowloon station": "九龍站",
  九龍站: "九龍站",
  "tsim sha tsui": "尖沙咀",
  tst: "尖沙咀",
  tsimshatsui: "尖沙咀",
  尖沙咀: "尖沙咀",
  "yau ma tei": "油麻地",
  油麻地: "油麻地",
  "mong kok": "旺角",
  旺角: "旺角",
  jordan: "佐敦",
  佐敦: "佐敦",
  "hung hom": "紅磡",
  紅磡: "紅磡",
  "ho man tin": "何文田",
  何文田: "何文田",
  "tai kok tsui": "大角咀",
  大角咀: "大角咀",
  "wong tai sin": "黃大仙",
  黃大仙: "黃大仙",
  "tsim sha tsui east": "尖沙咀",
  "to kwa wan": "土瓜灣",
  土瓜灣: "土瓜灣",
  "kowloon bay": "九龍灣",
  九龍灣: "九龍灣",
  austin: "柯士甸",
  柯士甸: "柯士甸",
  "sai ying pun": "西營盤",
  西營盤: "西營盤",
  // New Territories
  "sha tin": "沙田",
  沙田: "沙田",
  "tai wai": "大圍",
  大圍: "大圍",
  "ma on shan": "馬鞍山",
  馬鞍山: "馬鞍山",
  "tseung kwan o": "將軍澳",
  將軍澳: "將軍澳",
  tko: "將軍澳",
  "lohas park": "康城",
  "the lohas": "康城",
  康城: "康城",
  "tsuen wan": "荃灣",
  荃灣: "荃灣",
  "tuen mun": "屯門",
  屯門: "屯門",
  "yuen long": "元朗",
  元朗: "元朗",
  "tin shui wai": "天水圍",
  天水圍: "天水圍",
  "tai po": "大埔",
  大埔: "大埔",
  "sai kung": "西貢",
  西貢: "西貢",
  "sheung shui": "上水",
  上水: "上水",
  // HK Island
  "north point": "北角",
  北角: "北角",
  "quarry bay": "鰂魚涌",
  鰂魚涌: "鰂魚涌",
  "wong chuk hang": "黃竹坑",
  黃竹坑: "黃竹坑",
  "central": "中環",
  中環: "中環",
  "causeway bay": "銅鑼灣",
  銅鑼灣: "銅鑼灣",
  "wan chai": "灣仔",
  灣仔: "灣仔",
  "happy valley": "跑馬地",
  跑馬地: "跑馬地",
  "kennedy town": "堅尼地城",
  堅尼地城: "堅尼地城",
  "kwai chung": "葵涌",
  葵涌: "葵涌",
  "ap lei chau": "鴨脷洲",
  鴨脷洲: "鴨脷洲",
  // Mid-Levels
  "mid-levels": "半山",
  "mid levels": "半山",
  半山: "半山",
  "western mid-levels": "西半山",
  "mid-levels west": "西半山",
  西半山: "西半山",
  "mid-levels central": "中半山",
  中半山: "中半山",
  "mid-levels east": "東半山",
  東半山: "東半山",
  // Additional Kowloon
  "kowloon tong": "九龍塘",
  九龍塘: "九龍塘",
  "cheung sha wan": "長沙灣",
  長沙灣: "長沙灣",
  "yau tong": "油塘",
  油塘: "油塘",
  "lam tin": "藍田",
  藍田: "藍田",
  "san po kong": "新蒲崗",
  新蒲崗: "新蒲崗",
  "diamond hill": "鑽石山",
  鑽石山: "鑽石山",
  // Additional New Territories
  "hung shui kiu": "洪水橋",
  "hung shui kiu / ha tsuen": "洪水橋",
  洪水橋: "洪水橋",
  "fan ling": "粉嶺",
  fanling: "粉嶺",
  粉嶺: "粉嶺",
  "wu kai sha": "烏溪沙",
  烏溪沙: "烏溪沙",
  "pak shek kok": "白石角",
  白石角: "白石角",
  "tung chung": "東涌",
  東涌: "東涌",
  "long ping": "朗屏",
  朗屏: "朗屏",
  // HK Island — additional
  "repulse bay": "淺水灣",
  淺水灣: "淺水灣",
  "chai wan": "柴灣",
  柴灣: "柴灣",
  "the peak": "山頂",
  "victoria peak": "山頂",
  山頂: "山頂",
  // Kowloon — additional
  "shek kip mei": "石硤尾",
  石硤尾: "石硤尾",
  // New Territories — additional
  // "ShaTin" comes in as camelCase (no space); lower-cases to "shatin"
  shatin: "沙田",
  // Compound district strings — map to the primary district
  "tuen mun castle peak road": "屯門",
  "tuen mun, castle peak road": "屯門",

  // ── Additional HK Island ────────────────────────────────────────────────
  aberdeen: "香港仔",
  香港仔: "香港仔",
  "pok fu lam": "薄扶林",
  pokfulam: "薄扶林",
  薄扶林: "薄扶林",
  "tai hang": "大坑",
  大坑: "大坑",
  "shau kei wan": "筲箕灣",
  筲箕灣: "筲箕灣",
  "sai wan ho": "西灣河",
  西灣河: "西灣河",
  "heng fa chuen": "杏花邨",
  杏花邨: "杏花邨",
  "siu sai wan": "小西灣",
  小西灣: "小西灣",
  stanley: "赤柱",
  赤柱: "赤柱",
  "shek tong tsui": "石塘咀",
  石塘咀: "石塘咀",
  "south horizons": "南區",
  "southern district": "南區",
  南區: "南區",
  "deep water bay": "深水灣",
  深水灣: "深水灣",
  "tin hau": "天后",
  天后: "天后",

  // ── Additional Kowloon ───────────────────────────────────────────────────
  "ma tau wai": "馬頭圍",
  馬頭圍: "馬頭圍",
  "ma tau kok": "馬頭角",
  馬頭角: "馬頭角",
  "beacon hill": "畢架山",
  畢架山: "畢架山",
  "lai chi kok": "荔枝角",
  荔枝角: "荔枝角",
  "mei foo": "美孚",
  美孚: "美孚",
  "prince edward": "太子",
  太子: "太子",
  "lok fu": "樂富",
  樂富: "樂富",
  "tseung kwan o industrial estate": "將軍澳",

  // ── Additional New Territories ───────────────────────────────────────────
  "tsing yi": "青衣",
  青衣: "青衣",
  "kwai fong": "葵芳",
  葵芳: "葵芳",
  "kwai hing": "葵興",
  葵興: "葵興",
  "tai wo hau": "大窩口",
  大窩口: "大窩口",
  "sheung kwai chung": "上葵涌",
  上葵涌: "上葵涌",
  "hang hau": "坑口",
  坑口: "坑口",
  "po lam": "寶琳",
  寶琳: "寶琳",
  "tiu keng leng": "調景嶺",
  調景嶺: "調景嶺",
  "clear water bay": "清水灣",
  清水灣: "清水灣",
  "sai kung town": "西貢",
  "ma liu shui": "馬料水",
  馬料水: "馬料水",
  "ma on shan bay": "馬鞍山",
  "wu kai sha station": "烏溪沙",
  "ma wan": "馬灣",
  馬灣: "馬灣",
  "discovery bay": "愉景灣",
  愉景灣: "愉景灣",
  "lantau island": "大嶼山",
  lantau: "大嶼山",
  大嶼山: "大嶼山",
  "tai o": "大澳",
  大澳: "大澳",
  "mui wo": "梅窩",
  梅窩: "梅窩",
  "cheung chau": "長洲",
  長洲: "長洲",
  "peng chau": "坪洲",
  坪洲: "坪洲",
  "lamma island": "南丫島",
  南丫島: "南丫島",
  "yiu sha": "馬鞍山",
  "yiu sha road": "馬鞍山",

  // ── Mid-Levels catch-alls ───────────────────────────────────────────────
  "mid levels west": "西半山",
  "mid levels central": "中半山",
  "mid levels east": "東半山",
};

/** Ingest / empty raw → stored label (unknown → 其他). */
export function normalizeDistrict(raw: string | undefined): string {
  if (!raw) return "其他";
  const key = raw.toLowerCase().trim();
  const m = DISTRICT_MAP as Record<string, string>;
  const result = m[key] ?? m[raw.trim()];
  if (!result) {
    if (typeof console !== "undefined") {
      console.warn(`[districtCanonical] Unknown district: "${raw.trim()}" — storing as-is. Add it to DISTRICT_MAP.`);
    }
    return raw.trim();
  }
  return result;
}

/**
 * All raw `listings.district` values that should match a canonical label in SQL (incl. English aliases).
 */
export function rawDistrictValuesMatchingCanonical(canonical: string): string[] {
  const set = new Set<string>([canonical]);
  for (const [k, v] of Object.entries(DISTRICT_MAP)) {
    if (v !== canonical) continue;
    set.add(k);
    if (/^[a-z][a-z0-9\s'-]*$/i.test(k) && k === k.toLowerCase()) {
      const title = k
        .split(/[\s'-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      set.add(title);
    }
  }
  return [...set];
}
