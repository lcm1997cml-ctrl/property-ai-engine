import Link from "next/link";
import { Search, Calculator, GitCompare, MapPin, ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import WhatsAppCTA from "@/components/shared/WhatsAppCTA";
import { WHATSAPP_MESSAGES, SITE_CONFIG } from "@/lib/config";
import { searchListings } from "@/services/listingService";
import { formatPrice, formatPsf, formatBedrooms, formatArea } from "@/lib/formatters";
import {
  formatRoomTypePrice,
  computeRoomTypePriceRange,
} from "@/lib/roomTypeDisplay";
import { DISTRICTS } from "@/types/listing";
import type { EnrichedListing } from "@/types/listing";

async function FeaturedListings() {
  const listings = (await searchListings({})).slice(0, 4);

  if (listings.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        暫無精選樓盤，請稍後再試
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {listings.map((l: EnrichedListing) => (
        <div
          key={l.id}
          className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-blue-200 transition-all group"
        >
          {/* Title + location area → listing detail */}
          <Link href={`/listing/${l.slug}`} className="block">
            <div className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 mb-1 leading-tight">
              {l.titleZh ?? l.titleEn ?? l.estateName}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
              <MapPin size={11} />
              {l.district}
            </div>
          </Link>
          {/* Price block → mortgage calculator (handled inside) */}
          <FeaturedPriceAndRooms listing={l} />
          {l.insight && (
            <Link href={`/listing/${l.slug}`} className="block">
              <p className="text-xs text-gray-500 mt-2 line-clamp-2 hover:text-gray-700 transition-colors">
                {l.insight.summary}
              </p>
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Homepage featured card body: price + room-type breakdown.
 *
 * New development with room types → header price derived from roomTypes
 * (more accurate than Listing.price/priceMax for multi-room-type projects),
 * and each room type gets its own line with its own starting price + sold-out
 * indicator.
 *
 * New development without room types → fall back to listing price + hint to
 * view details (never surface the listing-level bedroom proxy, which is the
 * whole bug we're fixing).
 *
 * Secondary → single line with listing-level area + bedrooms (reliable, since
 * each secondary listing represents one specific unit).
 */
function FeaturedPriceAndRooms({ listing }: { listing: EnrichedListing }) {
  const isPartial = listing.dataCompleteness === "partial";
  const isNew = listing.sourceType === "new";
  const roomTypes = listing.roomTypes ?? [];

  // ── Secondary WITHOUT room-type rows: legacy single-unit summary ─────────
  // (Curated secondary estates now ship with multiple ListingUnit rows, so
  // this branch is only for legacy mock data or older imports.)
  if (!isNew && roomTypes.length === 0) {
    return (
      <>
        {isPartial ? (
          <div className="text-lg font-bold text-blue-700">售價待公布</div>
        ) : (
          <PriceToMortgageLink price={listing.price}>
            {formatPrice(listing.price)}
          </PriceToMortgageLink>
        )}
        <div className="text-xs text-gray-500 mt-0.5">
          {listing.saleableArea}呎² · {isPartial ? "—" : formatPsf(listing.psf)} ·{" "}
          {formatBedrooms(listing.bedrooms)}
        </div>
      </>
    );
  }

  // ── New dev OR curated secondary with room types: per-type price list ────
  if (roomTypes.length > 0) {
    const range = computeRoomTypePriceRange(roomTypes);
    const headerPrice = isPartial
      ? "售價待公布"
      : range
        ? range.min === range.max
          ? `${formatPrice(range.min)}起`
          : `${formatPrice(range.min)}–${formatPrice(range.max)}`
        : listing.priceMax
          ? `${formatPrice(listing.price)}–${formatPrice(listing.priceMax)}`
          : `${formatPrice(listing.price)}起`;
    const mortgagePrice = range?.min ?? listing.price;
    return (
      <>
        {isPartial ? (
          <div className="text-lg font-bold text-blue-700">{headerPrice}</div>
        ) : (
          <PriceToMortgageLink price={mortgagePrice}>{headerPrice}</PriceToMortgageLink>
        )}
        <div className="mt-1.5 space-y-0.5">
          {roomTypes.map((rt) => (
            <div
              key={rt.id}
              className="flex items-center justify-between text-xs text-gray-600"
            >
              <span className="font-medium text-gray-700">{rt.unitLabel}</span>
              <span
                className={
                  rt.availability === "sold_out"
                    ? "text-gray-400"
                    : "text-gray-700"
                }
              >
                {formatRoomTypePrice(rt, isPartial)}
              </span>
            </div>
          ))}
        </div>
      </>
    );
  }

  // ── New development without room-type rows yet ───────────────────────────
  // Fall back to listing-level bedrooms + saleable area (same source the
  // compare page uses via formatBedrooms(l.bedrooms)). Keeps the featured
  // card informative even for listings the parser hasn't broken down yet.
  return (
    <>
      {isPartial ? (
        <div className="text-lg font-bold text-blue-700">售價待公布</div>
      ) : (
        <PriceToMortgageLink price={listing.price}>
          {listing.priceMax
            ? `${formatPrice(listing.price)}–${formatPrice(listing.priceMax)}`
            : `${formatPrice(listing.price)}起`}
        </PriceToMortgageLink>
      )}
      <div className="text-xs text-gray-500 mt-0.5">
        {formatBedrooms(listing.bedrooms)}
        {listing.saleableArea > 0 ? ` · ${formatArea(listing.saleableArea)}` : ""}
      </div>
    </>
  );
}

/**
 * Clickable price that pre-fills the mortgage calculator via `?price=…`.
 * Used only for listings with a real price (not partial, not sold-out).
 */
function PriceToMortgageLink({
  price,
  children,
}: {
  price: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/mortgage?price=${price}`}
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 -mx-1 -my-0.5 text-lg font-bold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-900"
      title="點擊即時計算按揭月供"
    >
      <span>{children}</span>
      <Calculator size={11} className="text-blue-400 shrink-0" />
    </Link>
  );
}

const FEATURES = [
  {
    icon: Search,
    title: "智能搜尋樓盤",
    desc: "按地區、預算、房數、面積等條件搜尋，即睇市場概況",
    href: "/search",
    cta: "開始搜尋",
  },
  {
    icon: GitCompare,
    title: "樓盤比較分析",
    desc: "最多4個樓盤並列比較，呎價、月供、AI分析一覽無遺",
    href: "/compare",
    cta: "比較樓盤",
  },
  {
    icon: Calculator,
    title: "按揭計算機",
    desc: "輸入樓價及首期，即計月供，自動推薦預算範圍內的樓盤",
    href: "/mortgage",
    cta: "計算月供",
  },
];

const QUICK_SEARCHES = [
  { label: "沙田 2房 800萬以下", href: "/search?district=沙田&maxPrice=8000000&bedrooms=2" },
  { label: "啟德 新盤", href: "/search?district=啟德" },
  { label: "將軍澳 低呎價", href: "/search?district=將軍澳&sortBy=psf_asc" },
  { label: "元朗 3房 700萬以下", href: "/search?district=元朗&maxPrice=7000000&bedrooms=3" },
  { label: "荃灣 入門盤", href: "/search?district=荃灣&maxPrice=6000000" },
  { label: "馬鞍山 2房", href: "/search?district=馬鞍山&bedrooms=2" },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-700 to-blue-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-16 sm:py-20">
          <div className="max-w-2xl">
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
              {SITE_CONFIG.tagline}
            </h1>
            <p className="text-blue-100 text-lg mb-8">
              香港樓盤搜尋比較工具。按預算搵樓、比呎價、計月供，最後直接 WhatsApp 查詢。
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/search">
                <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-50 font-semibold gap-2">
                  <Search size={18} />
                  立即搜尋樓盤
                </Button>
              </Link>
              <Link href="/mortgage">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/60 bg-transparent text-white hover:bg-white/15 hover:text-white font-semibold gap-2"
                >
                  <Calculator size={18} />
                  計算按揭預算
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Quick search chips */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-400 mr-1">熱門搜尋：</span>
            {QUICK_SEARCHES.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="text-xs bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-600 rounded-full px-3 py-1.5 transition-colors"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Data-source freshness note */}
      <section className="bg-blue-50/50 border-b border-blue-100">
        <div className="max-w-7xl mx-auto px-4 py-2.5">
          <p className="text-xs text-gray-600 leading-relaxed">
            <span className="font-medium text-blue-700">資料來源：</span>
            本站新樓盤資料來自公開渠道，每 6 小時自動更新一次；二手盤為精選成交參考，並非完整二手放盤列表。
            所有資料僅供參考，最終以發展商價單及實際成交為準。
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Feature cards */}
        <section className="mb-14">
          <h2 className="text-xl font-bold text-gray-900 mb-6">工具一覽</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <Link
                  key={f.href}
                  href={f.href}
                  className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-blue-200 transition-all group"
                >
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                    <Icon size={20} className="text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-500 mb-4 leading-relaxed">{f.desc}</p>
                  <span className="text-sm text-blue-600 font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                    {f.cta} <ArrowRight size={14} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Featured listings */}
        <section className="mb-14">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">精選樓盤</h2>
            <Link href="/search" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              查看全部 <ArrowRight size={14} />
            </Link>
          </div>
          <FeaturedListings />
        </section>

        {/* Districts grid */}
        <section className="mb-14">
          <h2 className="text-xl font-bold text-gray-900 mb-6">按地區搜尋</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {DISTRICTS.map((district) => (
              <Link
                key={district}
                href={`/search?district=${district}`}
                className="bg-white border border-gray-200 rounded-xl p-3 text-center hover:border-blue-300 hover:bg-blue-50 transition-all group"
              >
                <MapPin size={16} className="mx-auto mb-1.5 text-gray-400 group-hover:text-blue-500" />
                <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">
                  {district}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* WhatsApp CTA banner */}
        <section className="bg-green-50 border border-green-200 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
            <MessageCircle size={24} className="text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-1">需要更多協助？</h3>
            <p className="text-sm text-gray-600">
              直接 WhatsApp 我，提供你的預算及要求，我幫你配對最適合的樓盤。
            </p>
          </div>
          <WhatsAppCTA
            message={WHATSAPP_MESSAGES.general()}
            label="立即 WhatsApp 查詢"
            size="lg"
            className="shrink-0"
          />
        </section>
      </div>
    </div>
  );
}
