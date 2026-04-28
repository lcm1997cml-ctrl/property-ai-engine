/**
 * Region → district grouping for the UI filter.
 * Region is a pure UI concept — it narrows the district dropdown but does NOT
 * affect server-side filtering.  Only the selected district value is sent to
 * the search service.
 */

export type Region = "港島" | "九龍" | "新界";

export const REGIONS: Region[] = ["港島", "九龍", "新界"];

export const REGION_DISTRICTS: Record<Region, string[]> = {
  港島: [
    "中環",
    "西營盤",
    "堅尼地城",
    "灣仔",
    "銅鑼灣",
    "北角",
    "鰂魚涌",
    "黃竹坑",
    "鴨脷洲",
    "跑馬地",
  ],
  九龍: [
    "啟德",
    "九龍站",
    "柯士甸",
    "奧運",
    "大角咀",
    "旺角",
    "何文田",
    "紅磡",
    "土瓜灣",
    "九龍城",
    "九龍灣",
    "尖沙咀",
    "油麻地",
    "黃大仙",
    "佐敦",
    "深水埗",
    "觀塘",
    "南昌",
  ],
  新界: [
    "沙田",
    "大圍",
    "馬鞍山",
    "大埔",
    "西貢",
    "將軍澳",
    "康城",
    "荃灣",
    "屯門",
    "元朗",
    "天水圍",
    "上水",
    "葵涌",
  ],
};

/** Reverse lookup: district → region (built from REGION_DISTRICTS). */
export const DISTRICT_REGION: Record<string, Region> = Object.fromEntries(
  (Object.entries(REGION_DISTRICTS) as [Region, string[]][]).flatMap(
    ([region, districts]) => districts.map((d) => [d, region])
  )
);

/** Chips displayed above the filter panel for one-click district selection. */
export const HOT_DISTRICTS: string[] = [
  "啟德",
  "黃竹坑",
  "將軍澳",
  "大圍",
  "大埔",
  "尖沙咀",
];
