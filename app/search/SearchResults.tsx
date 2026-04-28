"use client";

import { useState, useMemo } from "react";
import { SearchX } from "lucide-react";
import Link from "next/link";
import ListingCard from "@/components/properties/ListingCard";
import MarketSummaryBar from "@/components/properties/MarketSummaryBar";
import CompareBar from "@/components/properties/CompareBar";
import WhatsAppCTA from "@/components/shared/WhatsAppCTA";
import { WHATSAPP_MESSAGES } from "@/lib/config";
import type { EnrichedListing, MarketSummary, MarketFocus } from "@/types/listing";

interface SearchResultsProps {
  params: Record<string, string>;
  listings: EnrichedListing[];
  summary: MarketSummary;
}

function parseMarketFocus(raw: string | undefined): MarketFocus | undefined {
  if (raw === "new" || raw === "secondary") return raw;
  return undefined;
}

export default function SearchResults({ params, listings, summary }: SearchResultsProps) {
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const marketFocus = parseMarketFocus(params.focus);

  const primaryListings = useMemo(
    () => listings.filter((l) => l.sourceType === "new"),
    [listings]
  );
  const secondaryListings = useMemo(
    () => listings.filter((l) => l.sourceType === "secondary"),
    [listings]
  );

  const showSplit =
    marketFocus !== "new" &&
    marketFocus !== "secondary" &&
    primaryListings.length > 0 &&
    secondaryListings.length > 0;

  const compareNames = compareIds.map((id) => {
    const l = listings.find((x) => x.id === id);
    return l ? (l.titleZh ?? l.titleEn ?? l.estateName) : id;
  });

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const budgetDescription =
    params.floor15m === "1"
      ? "預算約1500萬以上"
      : params.maxPrice
        ? `預算約${Number(params.maxPrice) / 10000}萬以下`
        : undefined;
  const waMessage = WHATSAPP_MESSAGES.search(params.district, budgetDescription);

  return (
    <>
      <p className="text-xs text-gray-500 mb-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
        本站以<strong className="text-gray-800"> 新盤比較及決策</strong>為主；精選二手僅作同區／相近預算參考，並非完整二手市場。
      </p>

      {listings.length > 0 && <MarketSummaryBar summary={summary} />}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600">
          {listings.length > 0
            ? marketFocus === "secondary"
              ? `找到 ${listings.length} 個精選二手比較參考`
              : marketFocus === "new"
                ? `找到 ${listings.length} 個新樓／近新盤`
                : `找到 ${listings.length} 個結果（新樓優先，附精選二手參考）`
            : "沒有符合條件的樓盤"}
        </p>
        {listings.length > 0 && (
          <WhatsAppCTA
            message={waMessage}
            label="即時查詢"
            size="sm"
            variant="outline"
          />
        )}
      </div>

      {listings.length === 0 && (
        <div className="text-center py-20">
          <SearchX size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">未找到相關樓盤</h3>
          <p className="text-sm text-gray-400 mb-6">請嘗試調整搜尋條件，例如擴大預算或更換地區</p>
          <Link href="/search" className="text-sm text-blue-600 hover:underline">
            清除所有篩選
          </Link>
        </div>
      )}

      <div
        className="space-y-8"
        style={{ paddingBottom: compareIds.length > 0 ? "80px" : undefined }}
      >
        {showSplit ? (
          <>
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-600" />
                新樓推薦
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {primaryListings.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    variant="primary"
                    isComparing={compareIds.includes(listing.id)}
                    onToggleCompare={toggleCompare}
                    compareCount={compareIds.length}
                  />
                ))}
              </div>
            </section>
            <section>
              <h2 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gray-400" />
                同區二手／近似預算 · 比較參考
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                以下為精選參考盤，協助與新盤對照；數量有限，不代表全區放盤。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {secondaryListings.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    variant="comparison"
                    isComparing={compareIds.includes(listing.id)}
                    onToggleCompare={toggleCompare}
                    compareCount={compareIds.length}
                  />
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                variant={
                  listing.sourceType === "secondary" ? "comparison" : "primary"
                }
                isComparing={compareIds.includes(listing.id)}
                onToggleCompare={toggleCompare}
                compareCount={compareIds.length}
              />
            ))}
          </div>
        )}
      </div>

      <CompareBar
        selectedIds={compareIds}
        selectedNames={compareNames}
        onRemove={(id) => setCompareIds((prev) => prev.filter((x) => x !== id))}
        onClear={() => setCompareIds([])}
      />
    </>
  );
}
