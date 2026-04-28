"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, X, Check, Minus, AlertTriangle, Sparkles, MessageCircle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import WhatsAppCTA from "@/components/shared/WhatsAppCTA";
import PricePositionBadge from "@/components/shared/PricePositionBadge";
import { WHATSAPP_MESSAGES } from "@/lib/config";
import {
  formatPrice, formatPsf, formatArea, formatBedrooms,
  calcMonthlyPayment, formatMortgagePayment, formatPriceDisplay,
} from "@/lib/formatters";
import type { EnrichedListing, RoomTypeSummary } from "@/types/listing";

// ─── Room-type comparison mode ───────────────────────────────────────────────
//
// "all" = compare listing-level data (default — overall price, overall area).
// A specific room count (0–3 or "gte4") = compare that room type's data from
// ListingUnit rows, so users can compare e.g. "Blue Coast 2房 vs Sierra Sea
// 2房" side-by-side rather than two different room-type mixes.
type RoomCountFilter = "all" | 0 | 1 | 2 | 3 | "gte4";

const ROOM_FILTER_OPTIONS: Array<{ id: RoomCountFilter; label: string }> = [
  { id: "all", label: "綜合" },
  { id: 1, label: "1房" },
  { id: 2, label: "2房" },
  { id: 3, label: "3房" },
  { id: "gte4", label: "4房或以上" },
];

/**
 * Find the room-type row matching the current filter, if any.
 * Secondary listings typically have no roomTypes — returns undefined there.
 */
function findRoomType(
  l: EnrichedListing,
  filter: RoomCountFilter
): RoomTypeSummary | undefined {
  if (filter === "all") return undefined;
  const rts = l.roomTypes ?? [];
  if (filter === "gte4") return rts.find((rt) => rt.roomCount >= 4);
  return rts.find((rt) => rt.roomCount === filter);
}

/**
 * Effective view of a listing under the current room-type filter.
 *
 * - filter === "all"            → full listing-level data, offered=true.
 * - matching ListingUnit row    → room-type values (minPrice/minSaleableArea/…).
 * - no ListingUnit but listing-level bedrooms matches (secondary path)
 *                               → fall back to listing scalars, offered=true.
 * - otherwise                   → offered=false (render "無此戶型").
 */
interface EffectiveView {
  offered: boolean;
  /** "roomtype" | "listing" | "none" — only used for the availability badge */
  source: "roomtype" | "listing" | "none";
  /** Min price for price/psf comparison (undefined if not known). */
  price?: number;
  priceMax?: number;
  /** Area for area/psf display (undefined if not known). */
  saleableArea?: number;
  saleableAreaMax?: number;
  psf?: number;
  bedroomsLabel: string;
  availability?: string;
  rt?: RoomTypeSummary;
  dataCompleteness: "full" | "partial";
}

function computeEffective(
  l: EnrichedListing,
  filter: RoomCountFilter
): EffectiveView {
  const dc: "full" | "partial" = l.dataCompleteness === "partial" ? "partial" : "full";

  if (filter === "all") {
    return {
      offered: true,
      source: "listing",
      price: l.price || undefined,
      priceMax: l.priceMax,
      saleableArea: l.saleableArea || undefined,
      saleableAreaMax: l.saleableAreaMax,
      psf: l.psf || undefined,
      bedroomsLabel: formatBedrooms(l.bedrooms),
      dataCompleteness: dc,
    };
  }

  const rt = findRoomType(l, filter);
  if (rt) {
    return {
      offered: true,
      source: "roomtype",
      price: rt.minPrice,
      priceMax: rt.maxPrice,
      saleableArea: rt.minSaleableArea,
      saleableAreaMax: rt.maxSaleableArea,
      psf: rt.pricePerSqft,
      bedroomsLabel: rt.unitLabel,
      availability: rt.availability,
      rt,
      dataCompleteness: dc,
    };
  }

  // No room-type row: fall back to listing-level bedrooms only for listings
  // without any units (secondary listings, or new-dev listings that the parser
  // hasn't broken down yet — same rule as the search-page bedroom filter).
  const rts = l.roomTypes ?? [];
  if (rts.length === 0) {
    const bedroomsMatch =
      filter === "gte4" ? l.bedrooms >= 4 : l.bedrooms === filter;
    if (bedroomsMatch) {
      return {
        offered: true,
        source: "listing",
        price: l.price || undefined,
        priceMax: l.priceMax,
        saleableArea: l.saleableArea || undefined,
        saleableAreaMax: l.saleableAreaMax,
        psf: l.psf || undefined,
        bedroomsLabel: formatBedrooms(l.bedrooms),
        dataCompleteness: dc,
      };
    }
  }

  return { offered: false, source: "none", bedroomsLabel: "—", dataCompleteness: dc };
}

function formatAreaRange(min?: number, max?: number): string {
  if (!min) return "—";
  if (max && max !== min) return `${min}–${max}呎²`;
  return formatArea(min);
}

function formatPriceRangeCompact(min?: number, max?: number, dc?: "full" | "partial"): string {
  if (dc === "partial") return "售價待公布";
  if (!min) return "—";
  if (max && max !== min) return `${formatPrice(min)} – ${formatPrice(max)}`;
  return formatPrice(min);
}

/** 奇數行（第 1、3、5… 行）淺灰，偶數行白底，提升橫向掃讀。 */
function compareZebraBg(rowIndex: number): string {
  return rowIndex % 2 === 0 ? "bg-gray-50" : "bg-white";
}

interface CompareContentProps {
  initialIds: string[];
  allListings: EnrichedListing[];
  initialListings: EnrichedListing[];
}

export default function CompareContent({
  initialIds,
  allListings,
  initialListings,
}: CompareContentProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds.slice(0, 4));
  const [roomFilter, setRoomFilter] = useState<RoomCountFilter>("all");

  // Derive current listings from allListings by selectedIds (no API call needed).
  // IMPORTANT: allListings comes from searchListings() which attaches roomTypes,
  // and initialListings comes from getListingsByIds() which ALSO now attaches
  // roomTypes. So regardless of which branch we take, each entry here has
  // `roomTypes` populated for the room-filter compare mode.
  const listings = useMemo(() => {
    if (selectedIds.length === 0) return initialListings;
    return selectedIds.map((id) => {
      // Prefer initialListings (fetched with roomTypes on server) when available
      const fromInitial = initialListings.find((l) => l.id === id);
      if (fromInitial) return fromInitial;
      return allListings.find((l) => l.id === id);
    }).filter((l): l is EnrichedListing => l !== undefined);
  }, [selectedIds, allListings, initialListings]);

  // Per-listing effective view under the current room filter.
  const effectiveByListing = useMemo(() => {
    const map = new Map<string, EffectiveView>();
    for (const l of listings) map.set(l.id, computeEffective(l, roomFilter));
    return map;
  }, [listings, roomFilter]);
  const effOf = (l: EnrichedListing): EffectiveView =>
    effectiveByListing.get(l.id) ??
    computeEffective(l, roomFilter); // fallback (should not happen)

  const addListing = (id: string) => {
    if (!selectedIds.includes(id) && selectedIds.length < 4) {
      setSelectedIds((prev) => [...prev, id]);
    }
  };

  const removeListing = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const waMessage = WHATSAPP_MESSAGES.compare(
    listings.map((l) => `${l.titleZh ?? l.titleEn ?? l.estateName} ${formatPriceDisplay(l.price, l.dataCompleteness)}`)
  );

  // Empty state
  if (listings.length === 0) {
    return <EmptyCompare allListings={allListings} onAdd={addListing} />;
  }

  return (
    <div>
      {/* Add more / remove */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {listings.length < 4 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">加入比較：</span>
            <Select onValueChange={(v: string | null) => { if (v) addListing(v); }}>
              <SelectTrigger className="h-9 w-52">
                <SelectValue placeholder="選擇樓盤" />
              </SelectTrigger>
              <SelectContent>
                {allListings
                  .filter((l) => !selectedIds.includes(l.id))
                  .map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.titleZh ?? l.titleEn ?? l.estateName} · {formatPriceDisplay(l.price, l.dataCompleteness)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Plus size={14} className="text-gray-400" />
          </div>
        )}
        <span className="text-xs text-gray-400">
          已選 {listings.length}/4 個樓盤
        </span>
      </div>

      {/* Room-type comparison tabs — select which room type to compare across
          all selected listings. "綜合" keeps the original listing-level view. */}
      <div className="mb-4 bg-white rounded-xl border border-gray-200 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mr-1">
            <Home size={13} className="text-blue-500" />
            比較房型
          </div>
          {ROOM_FILTER_OPTIONS.map((opt) => {
            const active = roomFilter === opt.id;
            return (
              <button
                key={String(opt.id)}
                type="button"
                onClick={() => setRoomFilter(opt.id)}
                className={`px-3 py-1 text-sm rounded-full border font-medium transition-colors ${
                  active
                    ? "border-blue-500 bg-blue-50 text-blue-600"
                    : "border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-500"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
          {roomFilter !== "all" && (
            <span className="ml-auto text-[11px] text-gray-400">
              顯示各樓盤嘅「{ROOM_FILTER_OPTIONS.find((o) => o.id === roomFilter)?.label}」數據
            </span>
          )}
        </div>
      </div>

      {/* Compare table — scroll horizontally on mobile */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white mb-6 shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50/90">
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-600 w-36 min-w-[9rem] sticky left-0 z-20 bg-gray-50/95 backdrop-blur-[2px] border-r border-gray-200/80 align-middle">
                比較項目
              </th>
              {listings.map((l) => (
                <th
                  key={l.id}
                  className="px-4 py-3.5 text-center min-w-[180px] border-l border-gray-100 align-middle"
                >
                  <div className="relative px-1">
                    <button
                      type="button"
                      onClick={() => removeListing(l.id)}
                      className="absolute -top-0.5 -right-0.5 text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                    <Link
                      href={`/listing/${l.slug}`}
                      className="font-semibold text-gray-900 hover:text-blue-600 block leading-snug tracking-tight"
                    >
                      {l.titleZh ?? l.titleEn ?? l.estateName}
                    </Link>
                    {l.buildingName && (
                      <div className="text-xs text-gray-500 mt-1 leading-snug">{l.buildingName}</div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <CompareRow
              rowIndex={0}
              label="地區"
              listings={listings}
              render={(l) => `${l.district}${l.subDistrict ? ` · ${l.subDistrict}` : ""}`}
            />
            <CompareRow
              rowIndex={1}
              label="售價"
              note={roomFilter !== "all" ? "該房型起步價" : undefined}
              listings={listings}
              render={(l) => {
                const v = effOf(l);
                if (!v.offered) return "無此戶型";
                return formatPriceRangeCompact(v.price, v.priceMax, v.dataCompleteness);
              }}
              highlight="min"
              getValue={(l) => {
                const v = effOf(l);
                if (!v.offered || v.dataCompleteness === "partial" || v.price === undefined) {
                  return Infinity;
                }
                return v.price;
              }}
            />
            <CompareRow
              rowIndex={2}
              label="實用面積"
              listings={listings}
              render={(l) => {
                const v = effOf(l);
                if (!v.offered) return "無此戶型";
                return formatAreaRange(v.saleableArea, v.saleableAreaMax);
              }}
              highlight="max"
              getValue={(l) => {
                const v = effOf(l);
                if (!v.offered) return -Infinity;
                return v.saleableArea ?? -Infinity;
              }}
            />
            <CompareRow
              rowIndex={3}
              label="實用呎價"
              listings={listings}
              render={(l) => {
                const v = effOf(l);
                if (!v.offered) return "無此戶型";
                if (v.dataCompleteness === "partial") return "—";
                if (v.psf === undefined || v.psf <= 0) {
                  // Derive from price + area if available
                  if (v.price && v.saleableArea && v.saleableArea > 0) {
                    return formatPsf(Math.round(v.price / v.saleableArea));
                  }
                  return "—";
                }
                return formatPsf(v.psf);
              }}
              highlight="min"
              getValue={(l) => {
                const v = effOf(l);
                if (!v.offered || v.dataCompleteness === "partial") return Infinity;
                if (v.psf && v.psf > 0) return v.psf;
                if (v.price && v.saleableArea && v.saleableArea > 0) {
                  return Math.round(v.price / v.saleableArea);
                }
                return Infinity;
              }}
            />
            <CompareRow
              rowIndex={4}
              label="房型"
              listings={listings}
              render={(l) => {
                const v = effOf(l);
                if (!v.offered) return "無此戶型";
                // When a specific room filter is on, the label is redundant
                // across rows but we still surface confidence/availability hints.
                let label = v.bedroomsLabel;
                if (v.rt) {
                  if (v.rt.confidence === "medium") label += " (參考)";
                  else if (v.rt.confidence === "low") label += " (待更新)";
                  if (v.rt.availability === "sold_out") label += " · 售罄";
                  else if (v.rt.unitCount && v.rt.unitCount > 0) {
                    label += ` · 剩 ${v.rt.unitCount} 伙`;
                  }
                }
                return label;
              }}
            />
            <CompareRow
              rowIndex={5}
              label="物業類型"
              listings={listings}
              render={(l) => l.propertyType}
            />
            <CompareRow
              rowIndex={6}
              label="樓層"
              listings={listings}
              render={(l) => l.floor ?? "—"}
            />
            <CompareRow
              rowIndex={7}
              label="樓齡"
              listings={listings}
              render={(l) => (l.age ? `${l.age}年` : "—")}
              highlight="min"
              getValue={(l) => l.age ?? Infinity}
            />
            <CompareRow
              rowIndex={8}
              label="估算月供"
              listings={listings}
              render={(l) => {
                const v = effOf(l);
                if (!v.offered) return "無此戶型";
                if (v.dataCompleteness === "partial" || v.price === undefined) return "—";
                return `${formatMortgagePayment(
                  calcMonthlyPayment(v.price * 0.6, 3.5, 25)
                )}/月`;
              }}
              highlight="min"
              getValue={(l) => {
                const v = effOf(l);
                if (!v.offered || v.dataCompleteness === "partial" || v.price === undefined) {
                  return Infinity;
                }
                return calcMonthlyPayment(v.price * 0.6, 3.5, 25);
              }}
              note="60%按揭·25年·3.5%"
            />
            {/* AI Insight row */}
            <tr className="group border-t border-gray-100 transition-colors duration-150 ease-out">
              <td
                className={`px-4 py-3.5 text-xs font-semibold text-gray-700 sticky left-0 z-10 align-top border-r border-gray-200/80 transition-colors duration-150 ease-out ${compareZebraBg(9)} group-hover:bg-blue-50/60`}
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles size={11} className="text-gray-500 shrink-0" />
                  AI 分析
                </div>
              </td>
              {listings.map((l) => (
                <td
                  key={l.id}
                  className={`px-4 py-3.5 text-center align-top border-l border-gray-100 transition-colors duration-150 ease-out ${compareZebraBg(9)} group-hover:bg-blue-50/60`}
                >
                  {l.insight ? (
                    <div className="space-y-1.5">
                      <PricePositionBadge positioning={l.insight.pricePositioning} />
                      <p className="text-xs text-gray-600 leading-relaxed">
                        {l.insight.buyerFit}
                      </p>
                      <div className="flex flex-wrap justify-center gap-1">
                        {l.insight.compareTags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-blue-50 text-blue-600 rounded-full px-2 py-0.5"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              ))}
            </tr>
            {/* Risk notes */}
            {listings.some((l) => l.insight?.riskNote) && (
              <tr className="group border-t border-gray-100 transition-colors duration-150 ease-out">
                <td
                  className={`px-4 py-3.5 text-xs font-semibold text-gray-700 sticky left-0 z-10 align-top border-r border-gray-200/80 transition-colors duration-150 ease-out ${compareZebraBg(10)} group-hover:bg-blue-50/60`}
                >
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle size={11} className="text-amber-600/80 shrink-0" />
                    注意事項
                  </div>
                </td>
                {listings.map((l) => (
                  <td
                    key={l.id}
                    className={`px-4 py-3.5 text-center align-top border-l border-gray-100 transition-colors duration-150 ease-out ${compareZebraBg(10)} group-hover:bg-blue-50/60`}
                  >
                    {l.insight?.riskNote ? (
                      <p className="text-xs text-amber-600 leading-relaxed">
                        {l.insight.riskNote}
                      </p>
                    ) : (
                      <Check size={14} className="mx-auto text-green-500" />
                    )}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* WhatsApp CTA */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
            <MessageCircle size={20} className="text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">唔知揀邊個好？</p>
            <p className="text-xs text-gray-500 mt-0.5">
              WhatsApp 我，提供你的需求，我幫你分析哪個更適合你
            </p>
          </div>
        </div>
        <WhatsAppCTA
          message={waMessage}
          label="幫我分析邊個盤更啱我"
          size="md"
          className="shrink-0"
        />
      </div>

      {/* Back to search */}
      <div className="mt-6 text-center">
        <Link href="/search" className="text-sm text-blue-600 hover:underline">
          ← 返回搜尋更多樓盤
        </Link>
      </div>
    </div>
  );
}

// ─── Compare row component ────────────────────────────────────────────────────

interface CompareRowProps {
  rowIndex: number;
  label: string;
  listings: EnrichedListing[];
  render: (l: EnrichedListing) => string;
  highlight?: "min" | "max";
  getValue?: (l: EnrichedListing) => number;
  note?: string;
}

function CompareRow({ rowIndex, label, listings, render, highlight, getValue, note }: CompareRowProps) {
  const values = getValue ? listings.map(getValue) : [];
  const best = highlight === "min" ? Math.min(...values) : Math.max(...values);
  const stripe = compareZebraBg(rowIndex);

  return (
    <tr className="group border-t border-gray-100 transition-colors duration-150 ease-out">
      <td
        className={`px-4 py-3.5 text-xs font-semibold text-gray-700 sticky left-0 z-10 align-middle border-r border-gray-200/80 transition-colors duration-150 ease-out ${stripe} group-hover:bg-blue-50/60`}
      >
        <div>{label}</div>
        {note && <div className="text-gray-500 font-normal text-[11px] mt-0.5 leading-snug">{note}</div>}
      </td>
      {listings.map((l) => {
        const val = getValue?.(l);
        const isBest = highlight && val !== undefined && val === best && listings.length > 1;
        return (
          <td
            key={l.id}
            className={`px-4 py-3.5 text-center align-middle border-l border-gray-100 transition-colors duration-150 ease-out ${stripe} group-hover:bg-blue-50/60`}
          >
            <span
              className={
                isBest
                  ? "font-semibold text-green-800 bg-green-50 px-2 py-0.5 rounded-md ring-1 ring-inset ring-green-200/70"
                  : "text-gray-800"
              }
            >
              {render(l)}
            </span>
            {isBest && (
              <span className="ml-1 text-xs text-green-600 font-medium">
                {highlight === "min" ? "最低" : "最高"}
              </span>
            )}
          </td>
        );
      })}
      {/* Empty placeholder cells if fewer than 4 listings */}
      {Array.from({ length: 4 - listings.length }).map((_, i) => (
        <td
          key={`empty-${i}`}
          className={`px-4 py-3.5 border-l border-gray-100 transition-colors duration-150 ease-out ${stripe} group-hover:bg-blue-50/60`}
        />
      ))}
    </tr>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyCompare({
  allListings,
  onAdd,
}: {
  allListings: EnrichedListing[];
  onAdd: (id: string) => void;
}) {
  if (allListings.length === 0) {
    return (
      <div className="text-center py-16">
        <Minus size={48} className="mx-auto text-gray-200 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">暫無樓盤資料</h2>
        <p className="text-sm text-gray-400 mb-8">數據庫尚無記錄，請稍後再試</p>
        <Link href="/search">
          <Button variant="outline">返回搜尋</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center py-16">
      <Minus size={48} className="mx-auto text-gray-200 mb-4" />
      <h2 className="text-lg font-semibold text-gray-700 mb-2">尚未選擇任何樓盤</h2>
      <p className="text-sm text-gray-400 mb-8">
        從搜尋結果頁選擇「比較」，或在下方直接選擇
      </p>
      <div className="max-w-xs mx-auto space-y-3">
        {allListings.slice(0, 6).map((l) => (
          <button
            key={l.id}
            onClick={() => onAdd(l.id)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
          >
            <div>
              <div className="font-medium text-sm text-gray-900">{l.titleZh ?? l.titleEn ?? l.estateName}</div>
              <div className="text-xs text-gray-500">{l.district} · {formatPriceDisplay(l.price, l.dataCompleteness)}</div>
            </div>
            <Plus size={16} className="text-blue-500 shrink-0" />
          </button>
        ))}
        <Link href="/search">
          <Button variant="outline" className="w-full mt-2">
            瀏覽更多樓盤
          </Button>
        </Link>
      </div>
    </div>
  );
}
