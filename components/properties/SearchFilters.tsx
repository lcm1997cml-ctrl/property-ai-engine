"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DISTRICTS } from "@/types/listing";
import {
  REGIONS,
  REGION_DISTRICTS,
  DISTRICT_REGION,
  HOT_DISTRICTS,
} from "@/lib/districtRegions";

/**
 * Base UI Select requires non-empty item values.
 * Internal only — all visible labels use Traditional Chinese via SelectValue children.
 */
const SEL_NONE = "__none";

const FLOOR_15M_FLAG = "1";

const PRICE_MAX_OPTIONS: { label: string; value: string }[] = [
  { label: "不限", value: SEL_NONE },
  { label: "400萬", value: "4000000" },
  { label: "600萬", value: "6000000" },
  { label: "800萬", value: "8000000" },
  { label: "1000萬", value: "10000000" },
  { label: "1500萬", value: "15000000" },
  { label: "1500萬以上", value: "gte15000000" },
];

const PRICE_MIN_OPTIONS: { label: string; value: string }[] = [
  { label: "不限", value: SEL_NONE },
  { label: "400萬", value: "4000000" },
  { label: "600萬", value: "6000000" },
  { label: "800萬", value: "8000000" },
  { label: "1000萬", value: "10000000" },
  { label: "1500萬", value: "15000000" },
];

const BEDROOM_OPTIONS = [
  { label: "不限", value: SEL_NONE },
  { label: "開放式", value: "0" },
  { label: "1房", value: "1" },
  { label: "2房", value: "2" },
  { label: "3房", value: "3" },
  { label: "4房或以上", value: "4plus" },
];

/**
 * Saleable-area buckets. Each chip writes both minArea + maxArea so the
 * URL is self-describing and bookmarkable.
 *
 * `id` is the chip identity used for highlight state; "" = 不限 (cleared).
 */
const AREA_BUCKETS: Array<{
  id: string;
  label: string;
  minArea?: number;
  maxArea?: number;
}> = [
  { id: "", label: "不限" },
  { id: "lt300", label: "300呎以下", maxArea: 300 },
  { id: "300-500", label: "300–500呎", minArea: 300, maxArea: 500 },
  { id: "500-700", label: "500–700呎", minArea: 500, maxArea: 700 },
  { id: "700-1000", label: "700–1000呎", minArea: 700, maxArea: 1000 },
  { id: "gte1000", label: "1000呎以上", minArea: 1000 },
];

/** Derive the active chip id from current minArea/maxArea URL params. */
function resolveAreaBucketId(minRaw: string, maxRaw: string): string {
  if (!minRaw && !maxRaw) return "";
  const min = Number(minRaw) || undefined;
  const max = Number(maxRaw) || undefined;
  const match = AREA_BUCKETS.find(
    (b) => b.minArea === min && b.maxArea === max
  );
  return match?.id ?? "__custom__"; // custom range typed in advanced panel
}

const MARKET_FOCUS_OPTIONS = [
  { label: "全部", value: SEL_NONE },
  { label: "新樓", value: "new" },
  { label: "精選二手比較", value: "secondary" },
];

const SORT_OPTIONS = [
  { label: "預設排序", value: SEL_NONE },
  { label: "價格由低至高", value: "price_asc" },
  { label: "價格由高至低", value: "price_desc" },
  { label: "呎價由低至高", value: "psf_asc" },
  { label: "呎價由高至低", value: "psf_desc" },
];

function labelForPriceOption(
  value: string,
  options: { label: string; value: string }[]
): string {
  if (!value || value === SEL_NONE) return "不限";
  return options.find((o) => o.value === value)?.label ?? "不限";
}

type SearchFiltersProps = {
  /** Merged curated + DB districts; defaults to static DISTRICTS */
  districtOptions?: string[];
};

export default function SearchFilters({
  districtOptions = DISTRICTS,
}: SearchFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const current = {
    q: searchParams.get("q") || "",
    district: searchParams.get("district") || "",
    region: searchParams.get("region") || "",
    focus: searchParams.get("focus") || "",
    maxPrice: searchParams.get("maxPrice") || "",
    minPrice: searchParams.get("minPrice") || "",
    floor15m: searchParams.get("floor15m") || "",
    bedrooms: searchParams.get("bedrooms") || "",
    minArea: searchParams.get("minArea") || "",
    maxArea: searchParams.get("maxArea") || "",
    sortBy: searchParams.get("sortBy") || "",
    priceKnown: searchParams.get("priceKnown") || "",
  };

  // Local input state for the free-text name-search box (debounced via submit).
  const [nameInput, setNameInput] = useState(current.q);

  const activeAreaBucketId = useMemo(
    () => resolveAreaBucketId(current.minArea, current.maxArea),
    [current.minArea, current.maxArea]
  );

  const applyFilters = useCallback(
    (overrides: Record<string, string>) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("propertyType");
      Object.entries({ ...current, ...overrides }).forEach(([k, v]) => {
        if (v) next.set(k, v);
        else next.delete(k);
      });
      startTransition(() => router.push(`/search?${next.toString()}`));
    },
    [current, router, searchParams]
  );

  /** Switch region; always clears district so stale selections don't linger. */
  function applyRegion(region: string) {
    applyFilters({ region, district: "" });
  }

  /** One-click chip: sets district and derives the matching region automatically. */
  function applyHotDistrict(district: string) {
    const region = DISTRICT_REGION[district] ?? "";
    applyFilters({ district, region });
  }

  /**
   * Districts shown in the 地區 dropdown.
   * - 全部地域 (no region): merged server+curated list (districtOptions)
   * - Specific region: that region's static district list
   */
  const filteredDistrictOptions = useMemo(() => {
    if (!current.region) return districtOptions;
    return REGION_DISTRICTS[current.region as keyof typeof REGION_DISTRICTS] ?? [];
  }, [current.region, districtOptions]);

  const maxBudgetSelectValue = useMemo(() => {
    if (current.floor15m === FLOOR_15M_FLAG) return "gte15000000";
    if (current.maxPrice) return current.maxPrice;
    return SEL_NONE;
  }, [current.floor15m, current.maxPrice]);

  const maxBudgetTriggerLabel = useMemo(() => {
    if (current.floor15m === FLOOR_15M_FLAG) return "1500萬以上";
    return labelForPriceOption(current.maxPrice || SEL_NONE, PRICE_MAX_OPTIONS);
  }, [current.floor15m, current.maxPrice]);

  const minPriceTriggerLabel = useMemo(
    () => labelForPriceOption(current.minPrice || SEL_NONE, PRICE_MIN_OPTIONS),
    [current.minPrice]
  );

  const focusTriggerLabel = useMemo(() => {
    if (current.focus === "new") return "新樓";
    if (current.focus === "secondary") return "精選二手比較";
    return "全部";
  }, [current.focus]);

  const bedroomTriggerLabel = useMemo(() => {
    const hit = BEDROOM_OPTIONS.find(
      (o) => o.value !== SEL_NONE && o.value === current.bedrooms
    );
    return hit?.label ?? "不限";
  }, [current.bedrooms]);

  const sortTriggerLabel = useMemo(() => {
    const hit = SORT_OPTIONS.find(
      (o) => o.value !== SEL_NONE && o.value === current.sortBy
    );
    return hit?.label ?? "預設排序";
  }, [current.sortBy]);

  const districtTriggerLabel = current.district || "所有地區";

  const hasFilters = useMemo(
    () =>
      Boolean(current.q) ||
      Boolean(current.district) ||
      Boolean(current.region) ||
      Boolean(current.focus) ||
      Boolean(current.maxPrice) ||
      Boolean(current.minPrice) ||
      Boolean(current.floor15m) ||
      Boolean(current.bedrooms) ||
      Boolean(current.minArea) ||
      Boolean(current.maxArea) ||
      Boolean(current.sortBy) ||
      Boolean(current.priceKnown),
    [current]
  );

  /** Submit the name-search input — write `q` into URL. Empty = clear. */
  function applyNameSearch(rawValue?: string) {
    const value = (rawValue ?? nameInput).trim();
    applyFilters({ q: value });
  }

  /** Apply an area bucket (or clear it when id === ""). */
  function applyAreaBucket(id: string) {
    if (!id) {
      applyFilters({ minArea: "", maxArea: "" });
      return;
    }
    const bucket = AREA_BUCKETS.find((b) => b.id === id);
    if (!bucket) return;
    applyFilters({
      minArea: bucket.minArea ? String(bucket.minArea) : "",
      maxArea: bucket.maxArea ? String(bucket.maxArea) : "",
    });
  }

  const clearFilters = () => {
    startTransition(() => router.push("/search"));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
      <div className="flex flex-col gap-3">

        {/* ── 樓盤名稱搜尋（free-text）─────────────────────────────────── */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            applyNameSearch();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="search"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="輸入樓盤名稱（例如：首岸、太古城、Coasto）"
              className="w-full h-10 pl-9 pr-9 text-sm bg-white border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              autoComplete="off"
              enterKeyHint="search"
              aria-label="樓盤名稱搜尋"
            />
            {nameInput && (
              <button
                type="button"
                onClick={() => {
                  setNameInput("");
                  applyNameSearch("");
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                aria-label="清除搜尋"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Button type="submit" size="sm" disabled={isPending} className="shrink-0">
            搜尋
          </Button>
        </form>
        {current.q && (
          <div className="text-xs text-gray-500">
            正在搜尋名稱包含
            <span className="mx-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">
              {current.q}
            </span>
            的樓盤
          </div>
        )}

        {/* ── 熱門區域 quick-select chips ─────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 shrink-0">熱門區域：</span>
          {HOT_DISTRICTS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => applyHotDistrict(d)}
              className={`px-3 py-1 text-sm rounded-full border font-medium transition-colors ${
                current.district === d
                  ? "border-blue-500 bg-blue-50 text-blue-600"
                  : "border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-500"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* ── 地域 region pills ────────────────────────────────────────────── */}
        <div>
          <Label className="text-xs text-gray-500 mb-1.5 block">地域</Label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyRegion("")}
              className={`px-3 py-1 text-sm rounded-full border font-medium transition-colors ${
                !current.region
                  ? "border-blue-500 bg-blue-50 text-blue-600"
                  : "border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-500"
              }`}
            >
              全部地域
            </button>
            {REGIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => applyRegion(current.region === r ? "" : r)}
                className={`px-3 py-1 text-sm rounded-full border font-medium transition-colors ${
                  current.region === r
                    ? "border-blue-500 bg-blue-50 text-blue-600"
                    : "border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-500"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* ── 實用面積 area pills ─────────────────────────────────────────── */}
        <div>
          <Label className="text-xs text-gray-500 mb-1.5 block">實用面積</Label>
          <div className="flex flex-wrap gap-2">
            {AREA_BUCKETS.map((b) => {
              const active = activeAreaBucketId === b.id;
              return (
                <button
                  key={b.id || "all"}
                  type="button"
                  onClick={() => applyAreaBucket(active && b.id ? "" : b.id)}
                  className={`px-3 py-1 text-sm rounded-full border font-medium transition-colors ${
                    active
                      ? "border-blue-500 bg-blue-50 text-blue-600"
                      : "border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-500"
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
            {activeAreaBucketId === "__custom__" && (
              <span className="inline-flex items-center gap-1 px-3 py-1 text-sm rounded-full border border-blue-500 bg-blue-50 text-blue-600 font-medium">
                {current.minArea || "0"}–{current.maxArea || "∞"}呎
                <button
                  type="button"
                  onClick={() => applyAreaBucket("")}
                  className="hover:text-blue-800"
                  aria-label="清除自訂面積"
                >
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        </div>

        {/* ── Main filter row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* 地區 — filtered by selected 地域 */}
          <div className="min-w-0">
            <Label className="text-xs text-gray-500 mb-1 block">地區</Label>
            <Select
              value={current.district || SEL_NONE}
              onValueChange={(v) =>
                applyFilters({ district: !v || v === SEL_NONE ? "" : v })
              }
            >
              <SelectTrigger className="h-10 min-h-10 w-full">
                <SelectValue placeholder="所有地區">{districtTriggerLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEL_NONE}>所有地區</SelectItem>
                {filteredDistrictOptions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0">
            <Label className="text-xs text-gray-500 mb-1 block">搜尋焦點</Label>
            <Select
              value={current.focus || SEL_NONE}
              onValueChange={(v) =>
                applyFilters({ focus: !v || v === SEL_NONE ? "" : v })
              }
            >
              <SelectTrigger className="h-10 min-h-10 w-full">
                <SelectValue placeholder="全部">{focusTriggerLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MARKET_FOCUS_OPTIONS.map((o) => (
                  <SelectItem
                    key={o.value === SEL_NONE ? "focus-all" : o.value}
                    value={o.value}
                  >
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0">
            <Label className="text-xs text-gray-500 mb-1 block">最高預算</Label>
            <Select
              value={maxBudgetSelectValue}
              onValueChange={(v) => {
                if (!v || v === SEL_NONE) {
                  applyFilters({ maxPrice: "", floor15m: "" });
                } else if (v === "gte15000000") {
                  applyFilters({
                    maxPrice: "",
                    minPrice: "",
                    floor15m: FLOOR_15M_FLAG,
                  });
                } else {
                  applyFilters({
                    maxPrice: v,
                    floor15m: "",
                  });
                }
              }}
            >
              <SelectTrigger className="h-10 min-h-10 w-full">
                <SelectValue placeholder="不限">{maxBudgetTriggerLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRICE_MAX_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0">
            <Label className="text-xs text-gray-500 mb-1 block">房數</Label>
            <Select
              value={current.bedrooms || SEL_NONE}
              onValueChange={(v) =>
                applyFilters({ bedrooms: !v || v === SEL_NONE ? "" : v })
              }
            >
              <SelectTrigger className="h-10 min-h-10 w-full">
                <SelectValue placeholder="不限">{bedroomTriggerLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {BEDROOM_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
            <Button
              variant="outline"
              size="sm"
              className="h-10 min-h-10"
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <SlidersHorizontal size={14} className="mr-1" />
              進階
            </Button>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 min-h-10 text-gray-500"
                type="button"
                onClick={clearFilters}
              >
                <X size={14} className="mr-1" />
                清除
              </Button>
            )}
          </div>
        </div>

        {/* ── Advanced filters (unchanged) ────────────────────────────────── */}
        {showAdvanced && (
          <div className="pt-3 border-t border-gray-100 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <Label className="text-xs text-gray-500 mb-1 block">最低價格</Label>
              <Select
                value={current.minPrice || SEL_NONE}
                onValueChange={(v) => {
                  if (!v || v === SEL_NONE) {
                    applyFilters({ minPrice: "" });
                  } else {
                    applyFilters({ minPrice: v, floor15m: "" });
                  }
                }}
              >
                <SelectTrigger className="h-10 min-h-10 w-full">
                  <SelectValue placeholder="不限">{minPriceTriggerLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRICE_MIN_OPTIONS.map((o) => (
                    <SelectItem key={`min-${o.value}`} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="text-xs text-gray-500 mb-1 block">排序</Label>
              <Select
                value={current.sortBy || SEL_NONE}
                onValueChange={(v) =>
                  applyFilters({ sortBy: !v || v === SEL_NONE ? "" : v })
                }
              >
                <SelectTrigger className="h-10 min-h-10 w-full">
                  <SelectValue placeholder="預設排序">{sortTriggerLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 flex items-end">
              <button
                type="button"
                onClick={() =>
                  applyFilters({ priceKnown: current.priceKnown === "1" ? "" : "1" })
                }
                className={`h-10 px-4 text-sm rounded-lg border font-medium transition-colors ${
                  current.priceKnown === "1"
                    ? "border-blue-500 bg-blue-50 text-blue-600"
                    : "border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                只顯示已公布售價
              </button>
            </div>
          </div>
        )}
      </div>

      {isPending && (
        <div className="mt-2 text-xs text-blue-500 flex items-center gap-1">
          <Search size={11} className="animate-pulse" />
          搜尋中…
        </div>
      )}
    </div>
  );
}
