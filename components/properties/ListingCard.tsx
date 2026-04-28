"use client";

import Link from "next/link";
import { MapPin, Maximize2, Home, TrendingUp, GitCompare, Sparkles, AlertTriangle, Calculator } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import WhatsAppCTA from "@/components/shared/WhatsAppCTA";
import PricePositionBadge from "@/components/shared/PricePositionBadge";
import {
  formatPrice,
  formatPriceDisplay,
  formatPsf,
  formatArea,
  formatBedrooms,
  hasPlausibleBedrooms,
} from "@/lib/formatters";
import {
  formatRoomTypeArea,
  formatRoomTypePrice,
  getAvailabilityStyle,
} from "@/lib/roomTypeDisplay";
import { buildListingInquiryMessage } from "@/lib/whatsappMessages";
import type { EnrichedListing, RoomTypeSummary } from "@/types/listing";

type ListingCardVariant = "primary" | "comparison";

/**
 * Room-type section for new-development cards. Rendered full-width under the
 * header so each room type gets two lines (label + area / price + status).
 *
 * Rule: show every row that has a roomCount. Individual fields fall back to
 * "面積待更新" / "價錢待更新" when unknown — we never hide a room type just
 * because some fields are missing. Suspicious listings keep the same layout
 * but get a "資料待更新,僅供參考" banner at the top.
 *
 * Empty-state: when the listing has no ListingUnit rows yet (parser didn't
 * produce a per-room-type breakdown), fall back to listing-level bedrooms +
 * saleableArea. This matches the compare page's behaviour, which reads
 * `Listing.bedrooms` directly via formatBedrooms — both surfaces stay
 * consistent, and we never leave a card with "房型資料整理中" when we have
 * at least the listing-level numbers.
 */
function RoomTypeSection({ listing }: { listing: EnrichedListing }) {
  const isPartial = listing.dataCompleteness === "partial";
  const isSuspicious = listing.dataQuality === "suspicious";
  const rts = listing.roomTypes ?? [];

  if (rts.length === 0) {
    const bedroomsTrustworthy = hasPlausibleBedrooms(listing.bedrooms);
    const hasArea = listing.saleableArea > 0;
    return (
      <div className="px-4 py-3 border-b border-gray-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">戶型一覽</span>
          <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-gray-100 text-gray-500">
            詳細戶型整理中
          </span>
        </div>
        {bedroomsTrustworthy || hasArea ? (
          <div className="text-xs leading-snug flex items-center justify-between gap-2">
            {bedroomsTrustworthy ? (
              <span className="font-semibold text-gray-900">
                {formatBedrooms(listing.bedrooms)}
              </span>
            ) : (
              <span className="text-gray-400">房型待更新</span>
            )}
            <span className="text-gray-500">
              {hasArea ? formatArea(listing.saleableArea) : "面積待更新"}
            </span>
          </div>
        ) : null}
        <div className="mt-1.5 text-[11px] text-gray-400">
          如需 1–4 房戶型分拆、面積及定價,可 WhatsApp 查詢
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-gray-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">戶型一覽</span>
        {isSuspicious && (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            <AlertTriangle size={10} />
            資料待更新,僅供參考
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {rts.map((rt) => (
          <RoomTypeRow key={rt.id} rt={rt} isPartial={isPartial} />
        ))}
      </div>
    </div>
  );
}

function RoomTypeRow({
  rt,
  isPartial,
}: {
  rt: RoomTypeSummary;
  isPartial: boolean;
}) {
  const isSold = rt.availability === "sold_out";
  const badge = getAvailabilityStyle(rt.availability);

  return (
    <div className="text-xs leading-snug">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-900">{rt.unitLabel}</span>
        <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${badge.bgClass} ${badge.textClass}`}>
          {badge.label}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="text-gray-500">{formatRoomTypeArea(rt)}</span>
        <span className={`font-medium ${isSold ? "text-gray-400" : "text-blue-700"}`}>
          {formatRoomTypePrice(rt, isPartial)}
        </span>
      </div>
    </div>
  );
}

interface ListingCardProps {
  listing: EnrichedListing;
  /** Search results: new developments vs secondary comparison reference */
  variant?: ListingCardVariant;
  isComparing?: boolean;
  onToggleCompare?: (id: string) => void;
  compareCount?: number;
}

export default function ListingCard({
  listing,
  variant = "primary",
  isComparing = false,
  onToggleCompare,
  compareCount = 0,
}: ListingCardProps) {
  const { insight } = listing;
  const isSoldOut = listing.status === "sold_out";
  const canAddCompare = !isComparing && compareCount < 4;
  const isComparison = variant === "comparison";

  // Show the multi-room-type breakdown whenever the listing has 戶型 rows —
  // applies to both new dev AND curated secondary estates (since each seed
  // estate now ships with multiple ListingUnit rows for 1房/2房/3房).
  const hasMultiRoomTypes = (listing.roomTypes ?? []).length > 0;
  const useRoomTypeSection = listing.sourceType === "new" || hasMultiRoomTypes;

  return (
    <Card
      className={`hover:shadow-md transition-shadow duration-200 overflow-hidden ${
        isSoldOut
          ? "opacity-75 ring-1 ring-gray-200"
          : isComparison
          ? "ring-1 ring-gray-200 bg-slate-50/40"
          : ""
      }`}
    >
      <CardContent className="p-0">
        {isSoldOut && (
          <div className="border-b border-red-100 bg-red-50 px-3 py-1.5 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-red-600">
              售罄
            </span>
          </div>
        )}
        {!isSoldOut && isComparison && (
          <div className="border-b border-gray-200 bg-slate-100/80 px-3 py-1.5 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              比較參考 · 二手
            </span>
          </div>
        )}
        {/* Header bar with price */}
        <div
          className={`border-b px-4 py-3 flex items-start justify-between gap-2 ${
            isComparison
              ? "bg-white border-gray-100"
              : "bg-gray-50 border-gray-100"
          }`}
        >
          <div>
            <Link
              href={`/listing/${listing.slug}`}
              className="font-semibold text-gray-900 hover:text-blue-600 transition-colors leading-tight block"
            >
              {listing.titleZh ?? listing.titleEn ?? listing.estateName}
              {listing.buildingName && (
                <span className="font-normal text-gray-500 ml-1 text-sm">
                  {listing.buildingName}
                </span>
              )}
            </Link>
            <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
              <MapPin size={11} />
              <span>{listing.district}</span>
              {listing.subDistrict && <span>· {listing.subDistrict}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            {isSoldOut ? (
              <div className="text-sm font-medium text-red-500 bg-red-50 rounded px-2 py-0.5">
                已售罄
              </div>
            ) : listing.dataCompleteness === "partial" ? (
              <div className="text-sm font-medium text-gray-400 bg-gray-100 rounded px-2 py-0.5">
                售價待公布
              </div>
            ) : (
              <Link
                href={`/mortgage?price=${listing.price}`}
                className="group inline-flex items-center gap-1 rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 text-lg font-bold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-900"
                title="點擊即時計算按揭月供"
              >
                <span>
                  {useRoomTypeSection
                    ? listing.priceMax
                      ? `約 ${formatPrice(listing.price)} – ${formatPrice(listing.priceMax)}`
                      : `約 ${formatPrice(listing.price)} 起`
                    : formatPriceDisplay(listing.price, listing.dataCompleteness)}
                </span>
                <Calculator
                  size={12}
                  className="text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity shrink-0"
                />
              </Link>
            )}
            {!isSoldOut && insight && (
              <PricePositionBadge positioning={insight.pricePositioning} />
            )}
            {!isSoldOut && listing.dataCompleteness !== "partial" && (
              <div className="mt-0.5 text-[10px] text-gray-400">點擊樓價計月供</div>
            )}
          </div>
        </div>

        {/* Stats row — only for secondary legacy rows that DON'T have a
            per-room-type breakdown (e.g. mock data, listings ingested before
            we started seeding multi-unit estates). When room-type rows exist
            the section below is far richer, so we skip the stats grid. */}
        {!useRoomTypeSection && (
          <div className="px-4 py-3 grid grid-cols-3 gap-3 text-center border-b border-gray-50">
            <div>
              <div className="flex items-center justify-center gap-1 text-gray-400 text-xs mb-0.5">
                <Maximize2 size={11} />
                <span>實用面積</span>
              </div>
              <div className="text-sm font-medium text-gray-800">
                {formatArea(listing.saleableArea)}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-gray-400 text-xs mb-0.5">
                <TrendingUp size={11} />
                <span>實用呎價</span>
              </div>
              <div className="text-sm font-medium text-gray-800">
                {listing.dataCompleteness === "partial" ? "—" : formatPsf(listing.psf)}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-gray-400 text-xs mb-0.5">
                <Home size={11} />
                <span>房型</span>
              </div>
              <span className="text-sm font-medium text-gray-800">
                {formatBedrooms(listing.bedrooms)}
              </span>
            </div>
          </div>
        )}

        {/* Room-type breakdown — for new dev AND curated secondary estates.
            Reads listing.roomTypes (attached by listingService) and renders
            every room type with area + price + availability badge. */}
        {useRoomTypeSection && <RoomTypeSection listing={listing} />}

        {/* AI Insight */}
        {insight && (
          <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100">
            <div className="flex items-start gap-1.5">
              <Sparkles size={13} className="text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 leading-relaxed">{insight.summary}</p>
            </div>
            {insight.buyerFit && (
              <div className="mt-1 flex items-center gap-1">
                <span className="text-xs text-blue-500">適合：</span>
                <span className="text-xs font-medium text-blue-700">{insight.buyerFit}</span>
              </div>
            )}
          </div>
        )}

        {listing.comparisonSummary && (
          <div
            className={`px-4 py-2 border-b text-xs leading-relaxed ${
              isComparison
                ? "bg-amber-50/80 border-amber-100 text-amber-900"
                : "bg-slate-50 border-gray-100 text-gray-800"
            }`}
          >
            <span className="font-semibold text-gray-700">比較提示：</span>
            {listing.comparisonSummary}
          </div>
        )}

        {/* Tags */}
        {listing.tags && listing.tags.length > 0 && (
          <div className="px-4 py-2 flex flex-wrap gap-1">
            {listing.tags.slice(0, 5).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className={`text-xs px-1.5 py-0 ${
                  tag.includes("新樓") || tag.includes("推薦")
                    ? "bg-blue-100 text-blue-800 border border-blue-200"
                    : tag.includes("二手") || tag.includes("比較")
                      ? "bg-slate-200/80 text-slate-800"
                      : ""
                }`}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="px-4 py-3 flex items-center gap-2">
          <WhatsAppCTA
            message={buildListingInquiryMessage(listing)}
            label="WhatsApp 查詢"
            size="sm"
            className="flex-1"
          />
          {onToggleCompare && (
            <button
              onClick={() => onToggleCompare(listing.id)}
              disabled={!isComparing && !canAddCompare}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                isComparing
                  ? "border-blue-500 bg-blue-50 text-blue-600"
                  : canAddCompare
                  ? "border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600"
                  : "border-gray-100 text-gray-300 cursor-not-allowed"
              }`}
            >
              <GitCompare size={12} />
              {isComparing ? "已選" : "比較"}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
