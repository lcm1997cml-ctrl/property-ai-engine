import { cn } from "@/lib/utils";
import type { AIInsight } from "@/types/listing";

const CONFIG = {
  below_market: { label: "低於市價", className: "bg-green-100 text-green-700" },
  at_market: { label: "市價水平", className: "bg-blue-100 text-blue-700" },
  above_market: { label: "高於市價", className: "bg-orange-100 text-orange-700" },
};

export default function PricePositionBadge({
  positioning,
}: {
  positioning: AIInsight["pricePositioning"];
}) {
  const { label, className } = CONFIG[positioning];
  return (
    <span className={cn("inline-block text-xs font-medium px-2 py-0.5 rounded-full", className)}>
      {label}
    </span>
  );
}
