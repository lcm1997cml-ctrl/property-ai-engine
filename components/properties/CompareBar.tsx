"use client";

import { useRouter } from "next/navigation";
import { GitCompare, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompareBarProps {
  selectedIds: string[];
  selectedNames: string[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export default function CompareBar({
  selectedIds,
  selectedNames,
  onRemove,
  onClear,
}: CompareBarProps) {
  const router = useRouter();

  if (selectedIds.length === 0) return null;

  const goCompare = () => {
    const params = selectedIds.map((id) => `ids=${id}`).join("&");
    router.push(`/compare?${params}`);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <GitCompare size={16} className="text-blue-600" />
          <span className="text-sm font-medium text-gray-700">
            比較 ({selectedIds.length}/4)
          </span>
        </div>

        {/* Selected items */}
        <div className="flex-1 flex flex-wrap gap-1.5 overflow-hidden">
          {selectedNames.map((name, i) => (
            <span
              key={selectedIds[i]}
              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs rounded-full px-2.5 py-1 max-w-[140px]"
            >
              <span className="truncate">{name}</span>
              <button
                onClick={() => onRemove(selectedIds[i])}
                className="hover:text-blue-900 shrink-0"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onClear}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            清除
          </button>
          <Button
            size="sm"
            onClick={goCompare}
            disabled={selectedIds.length < 2}
            className="gap-1"
          >
            開始比較
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
