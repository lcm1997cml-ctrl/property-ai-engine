"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Calculator, TrendingDown, MessageCircle, ArrowRight, Info, Wallet,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import WhatsAppCTA from "@/components/shared/WhatsAppCTA";
import ListingCard from "@/components/properties/ListingCard";
import { WHATSAPP_MESSAGES } from "@/lib/config";
import { DEFAULT_ANNUAL_MORTGAGE_RATE } from "@/lib/mortgageConfig";
import {
  calcMonthlyPayment,
  formatMortgagePayment,
  formatPrice,
  formatHkdCurrency,
  parsePropertyPriceInput,
} from "@/lib/formatters";
import { calculateStampDuty } from "@/lib/mortgageStampDuty";
import type { EnrichedListing, ListingSourceType } from "@/types/listing";

const DEFAULT_PRICE = 6_000_000;
const DEFAULT_TERM_YEARS = 30;
const MORTGAGE_TERM_OPTIONS = [20, 25, 30] as const;

const PRICE_SLIDER_MIN = 1_000_000;
const PRICE_SLIDER_MAX = 30_000_000;

const LTV_PRESETS = [
  { label: "60% (常規)", value: 60 },
  { label: "70% (MIP)", value: 70 },
  { label: "80% (MIP 1000萬以下)", value: 80 },
  { label: "90% (首置 600萬以下)", value: 90 },
];

const RATE_QUICK_PRESETS = [3.25, 3.5, 3.75, 4] as const;

function formatPctDisplay(rate: number): string {
  const t = Math.round(rate * 1000) / 1000;
  return `${t}%`;
}

function clampAnnualRate(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_ANNUAL_MORTGAGE_RATE;
  return Math.min(25, Math.max(0.01, n));
}

function parseAnnualRateInput(raw: string): number | null {
  const t = raw.replace(/%/g, "").replace(/,/g, ".").replace(/\s/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatRateInputDisplay(n: number): string {
  const t = Math.round(n * 1000) / 1000;
  return String(t);
}

/** Client-side similar listing filter (mirrors getSimilarListings service logic). */
function filterSimilarListings(
  allListings: EnrichedListing[],
  price: number,
  limit = 6
): EnrichedListing[] {
  const lower = price * 0.8;
  const upper = price * 1.2;
  const candidates = allListings.filter((l) => l.price >= lower && l.price <= upper);
  return [...candidates]
    .sort((a, b) => {
      const ra: ListingSourceType = a.sourceType ?? "secondary";
      const rb: ListingSourceType = b.sourceType ?? "secondary";
      return (ra === "new" ? 0 : 1) - (rb === "new" ? 0 : 1);
    })
    .slice(0, limit);
}

interface MortgageCalculatorProps {
  initialPrice?: number;
  allListings: EnrichedListing[];
}

export default function MortgageCalculator({ initialPrice, allListings }: MortgageCalculatorProps) {
  const initial = initialPrice ?? DEFAULT_PRICE;
  const [price, setPrice] = useState(initial);
  const [priceInput, setPriceInput] = useState(() =>
    Math.round(initial).toLocaleString("en-HK")
  );

  // Sync price input when user navigates here from another listing's price
  // link (e.g. /mortgage?price=11400000). Next.js may keep this client
  // component mounted across navigations to the same route, so useState's
  // initial value alone won't pick up a new URL price.
  useEffect(() => {
    if (initialPrice !== undefined && Number.isFinite(initialPrice) && initialPrice > 0) {
      setPrice(initialPrice);
      setPriceInput(Math.round(initialPrice).toLocaleString("en-HK"));
    }
  }, [initialPrice]);
  const [ltvPct, setLtvPct] = useState(60);
  const [years, setYears] = useState<number>(DEFAULT_TERM_YEARS);
  const [annualRate, setAnnualRate] = useState(DEFAULT_ANNUAL_MORTGAGE_RATE);
  const [annualRateInput, setAnnualRateInput] = useState(
    String(DEFAULT_ANNUAL_MORTGAGE_RATE)
  );
  const [agentPct, setAgentPct] = useState(1);
  const [legalFee, setLegalFee] = useState(10_000);
  const [legalFeeInput, setLegalFeeInput] = useState("10000");
  const [renovationCost, setRenovationCost] = useState(0);
  const [renovationInput, setRenovationInput] = useState("0");

  const loanAmount = useMemo(
    () => price * (ltvPct / 100),
    [price, ltvPct]
  );
  const downPayment = useMemo(
    () => price * (1 - ltvPct / 100),
    [price, ltvPct]
  );

  const actualRate = annualRate;

  const monthly = useMemo(
    () => calcMonthlyPayment(loanAmount, actualRate, years),
    [loanAmount, actualRate, years]
  );

  const monthlyIncomeRequired = useMemo(
    () => Math.round(monthly * 2),
    [monthly]
  );

  const totalPayment = useMemo(
    () => monthly * years * 12,
    [monthly, years]
  );
  const totalInterest = useMemo(
    () => totalPayment - loanAmount,
    [totalPayment, loanAmount]
  );

  const stampDuty = useMemo(
    () => Math.round(calculateStampDuty(price)),
    [price]
  );
  const agentFee = useMemo(
    () => Math.round((price * agentPct) / 100),
    [price, agentPct]
  );
  const totalCashNeeded = useMemo(() => {
    return Math.round(
      downPayment + stampDuty + agentFee + legalFee + renovationCost
    );
  }, [downPayment, stampDuty, agentFee, legalFee, renovationCost]);

  // Filter similar listings client-side from pre-fetched allListings
  const recommended = useMemo(
    () => filterSimilarListings(allListings, price, 6),
    [allListings, price]
  );

  const waMessage = WHATSAPP_MESSAGES.mortgage(formatMortgagePayment(monthly));

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const monthlyRate = actualRate / 100 / 12;
    const totalMonths = years * 12;
    const cleanFromInput = priceInput.replace(/,/g, "").replace(/\s/g, "");
    console.debug("[MortgageCalculator]", {
      priceInputRaw: priceInput,
      cleanFromInput,
      propertyPrice: price,
      ltvPct,
      loanAmount,
      downPayment,
      stampDuty,
      agentFee,
      totalCashNeeded,
      years,
      totalMonths,
      annualRate,
      annualRateInput,
      actualRatePct: actualRate,
      monthlyRate,
      monthlyPayment: monthly,
      monthlyIncomeRequired,
      totalInterest,
    });
  }, [
    price,
    priceInput,
    ltvPct,
    loanAmount,
    downPayment,
    stampDuty,
    agentFee,
    totalCashNeeded,
    years,
    annualRate,
    annualRateInput,
    actualRate,
    monthly,
    monthlyIncomeRequired,
    totalInterest,
  ]);

  function handlePriceChange(raw: string) {
    setPriceInput(raw);
    const clean = raw.replace(/,/g, "").replace(/\s/g, "");
    const n = Number(clean);
    if (Number.isFinite(n) && n > 0) {
      setPrice(n);
    }
  }

  function handlePriceBlur() {
    const n = parsePropertyPriceInput(priceInput);
    if (Number.isFinite(n) && n > 0) {
      setPrice(n);
      setPriceInput(Math.round(n).toLocaleString("en-HK"));
    } else {
      setPriceInput(Math.round(price).toLocaleString("en-HK"));
    }
  }

  function applyAnnualRatePreset(p: number) {
    const v = clampAnnualRate(p);
    setAnnualRate(v);
    setAnnualRateInput(formatRateInputDisplay(v));
  }

  function handleAnnualRateInputChange(raw: string) {
    setAnnualRateInput(raw);
    const n = parseAnnualRateInput(raw);
    if (n !== null) setAnnualRate(clampAnnualRate(n));
  }

  function handleAnnualRateBlur() {
    const n = parseAnnualRateInput(annualRateInput);
    if (n !== null) {
      const v = clampAnnualRate(n);
      setAnnualRate(v);
      setAnnualRateInput(formatRateInputDisplay(v));
    } else {
      setAnnualRateInput(formatRateInputDisplay(annualRate));
    }
  }

  const priceSlidePct = Math.min(
    100,
    Math.max(
      0,
      ((price - PRICE_SLIDER_MIN) / (PRICE_SLIDER_MAX - PRICE_SLIDER_MIN)) * 100
    )
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
              樓價（港元）
            </Label>
            <Input
              type="text"
              inputMode="numeric"
              value={priceInput}
              onChange={(e) => handlePriceChange(e.target.value)}
              onBlur={handlePriceBlur}
              placeholder="例如 11,400,000"
              className="mb-2"
            />
            <p className="text-xs text-gray-400 mb-3">
              可輸入千位逗號；拖曳下方滑桿亦可調整樓價。
            </p>
            <div className="space-y-2">
              <div className="text-center text-base font-semibold text-gray-900 tabular-nums">
                {formatPrice(price)}
              </div>
              <div className="text-center text-xs text-gray-500 tabular-nums">
                {formatHkdCurrency(price)}
              </div>
              <div className="relative py-1">
                <div
                  className="pointer-events-none absolute left-0 right-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-gray-100"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute left-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-blue-500"
                  style={{ width: `${priceSlidePct}%` }}
                  aria-hidden
                />
                <Slider
                  min={PRICE_SLIDER_MIN}
                  max={PRICE_SLIDER_MAX}
                  step={100_000}
                  value={[price]}
                  onValueChange={(v) => {
                    const val = Array.isArray(v) ? (v as number[])[0] : (v as number);
                    const n = Number(val);
                    if (!Number.isFinite(n)) return;
                    setPrice(n);
                    setPriceInput(Math.round(n).toLocaleString("en-HK"));
                  }}
                  className="relative z-10 w-full [&_[data-slot=slider-track]]:border-0 [&_[data-slot=slider-track]]:bg-transparent [&_[data-slot=slider-track]]:shadow-none [&_[data-slot=slider-range]]:bg-transparent [&_[data-slot=slider-thumb]]:border-gray-200 [&_[data-slot=slider-thumb]]:shadow-none [&_[data-slot=slider-thumb]]:ring-offset-0"
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span className="tabular-nums">100萬</span>
                <span className="tabular-nums">3000萬</span>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
              按揭成數 (LTV)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {LTV_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setLtvPct(p.value)}
                  className={`text-xs px-2 py-2 rounded-lg border transition-colors ${
                    ltvPct === p.value
                      ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                      : "border-gray-200 text-gray-600 hover:border-blue-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-start gap-1.5 mt-2 text-xs text-gray-400">
              <Info size={11} className="mt-0.5 shrink-0" />
              <span>MIP = 按揭保險計劃。實際成數視乎銀行審批及物業估價。</span>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
              按揭年期
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {MORTGAGE_TERM_OPTIONS.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYears(y)}
                  className={`text-sm py-2 rounded-lg border transition-colors ${
                    years === y
                      ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                      : "border-gray-200 text-gray-600 hover:border-blue-200"
                  }`}
                >
                  {y} 年
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
              按揭年利率（%）
            </Label>
            <p className="text-xs text-gray-400 mb-2">
              直接輸入年利率，結果會即時更新。
            </p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {RATE_QUICK_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyAnnualRatePreset(p)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                    Math.abs(annualRate - p) < 0.0001
                      ? "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {formatPctDisplay(p)}
                </button>
              ))}
            </div>
            <div className="relative">
              <Input
                type="text"
                inputMode="decimal"
                value={annualRateInput}
                onChange={(e) => handleAnnualRateInputChange(e.target.value)}
                onBlur={handleAnnualRateBlur}
                placeholder="例如 3.5"
                className="pr-10 text-sm tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                %
              </span>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium text-gray-700 mb-1.5 block">
              其他買樓雜費（估算）
            </Label>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">代理佣金（% 樓價）</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={agentPct}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/,/g, ""));
                    if (Number.isFinite(n) && n >= 0) setAgentPct(n);
                  }}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">律師費（港元）</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={legalFeeInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setLegalFeeInput(raw);
                    const n = parsePropertyPriceInput(raw);
                    if (Number.isFinite(n) && n >= 0) setLegalFee(Math.round(n));
                  }}
                  onBlur={() => {
                    setLegalFeeInput(String(Math.round(legalFee)));
                  }}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">裝修預算（港元）</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={renovationInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setRenovationInput(raw);
                    const n = parsePropertyPriceInput(raw);
                    if (Number.isFinite(n) && n >= 0) setRenovationCost(Math.round(n));
                  }}
                  onBlur={() => {
                    setRenovationInput(String(Math.round(renovationCost)));
                  }}
                  className="text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle size={16} className="text-green-600" />
            <span className="text-sm font-medium text-gray-800">想了解更多？</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            告訴我你的月供預算，我幫你推介合適樓盤
          </p>
          <WhatsAppCTA message={waMessage} label="WhatsApp 查詢推介" block />
        </div>
      </div>

      <div className="lg:col-span-2 space-y-6">
        <div className="bg-blue-600 text-white rounded-xl p-6">
          <div className="grid gap-6 sm:grid-cols-3 sm:gap-4">
            <div>
              <div className="text-sm text-blue-200 mb-1">估算每月供款</div>
              <div className="text-3xl font-bold tabular-nums">
                {formatMortgagePayment(monthly)}
              </div>
              <div className="text-blue-200 text-xs mt-0.5">/ 月</div>
            </div>
            <div className="sm:border-l sm:border-blue-500/50 sm:pl-4">
              <div className="text-sm text-blue-200 mb-1">每月入息要求</div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatHkdCurrency(monthlyIncomeRequired)}
              </div>
              <div className="text-blue-200/90 text-xs mt-1">
                以每月供款 2 倍計算
              </div>
            </div>
            <div className="sm:border-l sm:border-blue-500/50 sm:pl-4">
              <div className="text-sm text-blue-200 mb-1">上手現金總額</div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatHkdCurrency(totalCashNeeded)}
              </div>
              <div className="text-blue-200/90 text-xs mt-1">首期 + 印花 + 雜費</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Wallet size={16} className="text-blue-500" />
            成本明細
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            印花稅為簡化階梯估算；實際以稅局及律師為準。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CostTile label="首期" value={formatHkdCurrency(downPayment)} sub={`樓價的 ${100 - ltvPct}%`} />
            <CostTile label="貸款額" value={formatHkdCurrency(loanAmount)} sub={`樓價的 ${ltvPct}%`} />
            <CostTile label="印花稅（估算）" value={formatHkdCurrency(stampDuty)} />
            <CostTile label="代理佣金（估算）" value={formatHkdCurrency(agentFee)} sub={`樓價 ${agentPct}%`} />
            <CostTile label="律師費" value={formatHkdCurrency(legalFee)} />
            <CostTile label="裝修預算" value={formatHkdCurrency(renovationCost)} />
          </div>
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              上手現金總額
            </div>
            <div className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
              {formatHkdCurrency(totalCashNeeded)}
            </div>
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              首期 + 印花稅 + 代理費 + 律師費 + 裝修；所有金額以港元顯示並四捨五入至整數。
            </p>
          </div>
          <Separator className="my-4" />
          <div className="grid gap-3 sm:grid-cols-2">
            <CostTile label="每月供款" value={formatMortgagePayment(monthly)} emphasis />
            <CostTile label="每月入息要求" value={formatHkdCurrency(monthlyIncomeRequired)} emphasis />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calculator size={16} className="text-blue-500" />
            按揭詳情
          </h3>
          <div className="space-y-3 text-sm">
            <Row label="樓價" value={formatHkdCurrency(price)} />
            <Row label={`首期 (${100 - ltvPct}%)`} value={formatHkdCurrency(downPayment)} highlight />
            <Row label={`貸款額 (${ltvPct}%)`} value={formatHkdCurrency(loanAmount)} />
            <Row label="按揭年期" value={`${years} 年`} />
            <Row label="按揭年利率" value={formatPctDisplay(actualRate)} />
            <Separator />
            <Row label="每月供款" value={formatMortgagePayment(monthly)} bold />
            <Row
              label="每月入息要求"
              value={formatHkdCurrency(monthlyIncomeRequired)}
            />
            <Separator />
            <Row label="還款總額" value={formatHkdCurrency(totalPayment)} />
            <Row
              label="總利息支出"
              value={formatHkdCurrency(totalInterest)}
              sub={
                loanAmount > 0
                  ? `佔貸款額 ${((totalInterest / loanAmount) * 100).toFixed(0)}%`
                  : undefined
              }
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingDown size={16} className="text-blue-500" />
            還款比例
          </h3>
          <div className="space-y-3">
            <BarRow label="本金" amount={loanAmount} total={totalPayment} color="bg-blue-500" />
            <BarRow label="總利息" amount={totalInterest} total={totalPayment} color="bg-orange-400" />
          </div>
        </div>

        {recommended.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                符合預算的樓盤推薦
              </h3>
              <Link
                href={`/search?maxPrice=${Math.round(price * 1.1)}&minPrice=${Math.round(price * 0.9)}`}
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                查看更多 <ArrowRight size={13} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {recommended.slice(0, 4).map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
            <div className="mt-4 text-center">
              <Link
                href={`/search?maxPrice=${Math.round(price * 1.2)}`}
                className="inline-flex items-center gap-2 text-sm text-blue-600 border border-blue-200 rounded-lg px-4 py-2 hover:bg-blue-50 transition-colors"
              >
                搜尋 {formatPrice(price)} 以下全部樓盤
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}

        {allListings.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm bg-gray-50 rounded-xl border border-gray-100">
            暫無符合預算的樓盤資料
          </div>
        )}
      </div>
    </div>
  );
}

function CostTile({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        emphasis
          ? "border-blue-200 bg-blue-50/50"
          : "border-gray-100 bg-gray-50/60"
      }`}
    >
      <div className="text-xs text-gray-600">{label}</div>
      <div
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          emphasis ? "text-blue-800" : "text-gray-900"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-gray-500">{sub}</div> : null}
    </div>
  );
}

function Row({
  label, value, highlight, bold, sub
}: {
  label: string;
  value: string;
  highlight?: boolean;
  bold?: boolean;
  sub?: string;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-gray-500">{label}</span>
      <div className="text-right">
        <span
          className={`${bold ? "font-bold text-blue-700 text-base" : "font-medium text-gray-800"} ${
            highlight ? "text-green-700" : ""
          }`}
        >
          {value}
        </span>
        {sub && <div className="text-xs text-gray-400">{sub}</div>}
      </div>
    </div>
  );
}

function BarRow({
  label, amount, total, color,
}: {
  label: string; amount: number; total: number; color: string;
}) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span>{pct.toFixed(0)}% · {formatHkdCurrency(amount)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
