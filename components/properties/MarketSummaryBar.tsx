import { TrendingUp, BarChart2, ArrowDownUp } from "lucide-react";
import { formatPrice, formatPsf } from "@/lib/formatters";
import type { MarketSummary } from "@/types/listing";

export default function MarketSummaryBar({ summary }: { summary: MarketSummary }) {
  if (summary.count === 0) return null;

  return (
    <div className="bg-blue-600 text-white rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 size={16} />
        <span className="text-sm font-semibold">市場概況</span>
        <span className="text-blue-200 text-xs ml-auto">共 {summary.count} 個盤</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          icon={<TrendingUp size={14} />}
          label="平均售價"
          value={formatPrice(summary.avgPrice)}
        />
        <Stat
          icon={<BarChart2 size={14} />}
          label="平均呎價"
          value={formatPsf(summary.avgPsf)}
        />
        <Stat
          icon={<ArrowDownUp size={14} />}
          label="最低"
          value={formatPrice(summary.minPrice)}
        />
        <Stat
          icon={<ArrowDownUp size={14} className="rotate-180" />}
          label="最高"
          value={formatPrice(summary.maxPrice)}
        />
      </div>
      {/* Price distribution */}
      <div className="mt-3 pt-3 border-t border-blue-500">
        <div className="text-xs text-blue-200 mb-2">價格分佈</div>
        <div className="flex flex-wrap gap-2">
          {summary.priceRange
            .filter((r) => r.count > 0)
            .map((r) => (
              <span
                key={r.label}
                className="bg-blue-500 rounded-full px-2.5 py-0.5 text-xs"
              >
                {r.label}: {r.count}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-blue-500/40 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1 text-blue-200 text-xs mb-0.5">
        {icon}
        {label}
      </div>
      <div className="font-bold text-sm">{value}</div>
    </div>
  );
}
