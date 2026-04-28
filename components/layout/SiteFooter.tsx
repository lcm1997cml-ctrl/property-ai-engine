import Link from "next/link";
import { SITE_CONFIG } from "@/lib/config";

/**
 * Global site footer.
 *
 * Renders on every page (mounted in app/layout.tsx). Contains:
 *   • Disclaimer (PDPO + 物業相關風險合規語)
 *   • Privacy / Terms / Contact navigation
 *   • Data-source freshness note
 *
 * Kept minimal & accessible — designed not to clash with existing pages.
 */
export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white mt-12">
      <div className="max-w-7xl mx-auto px-4 py-8 text-sm text-gray-500 space-y-4">
        {/* Disclaimer block — most important */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs leading-relaxed text-amber-900">
          <p className="font-semibold mb-1">免責聲明</p>
          <p>
            本網站所列樓盤資料（包括價格、面積、戶型、預計落成日期等）均為
            <span className="font-medium">參考性質</span>，
            <span className="font-medium">不構成任何要約或合約建議</span>。
            所有資料雖盡力核實，但本網站
            <span className="font-medium">不保證準確性、完整性或時效性</span>。
            買賣樓宇前，請以
            <span className="font-medium">發展商正式價單、地產代理及律師意見</span>
            為準。本網站不就任何因依賴本網內容而招致之損失負責。
          </p>
        </div>

        {/* Data-source note */}
        <div className="text-xs text-gray-400 leading-relaxed">
          <p>
            本站新樓盤資料源自公開渠道，每 6 小時自動更新一次；二手盤為
            <span className="text-gray-500">精選成交參考</span>，並非完整二手放盤列表。
          </p>
        </div>

        {/* Nav row */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 border-t border-gray-100 text-xs">
          <Link href="/privacy" className="text-gray-500 hover:text-gray-700">
            私隱政策
          </Link>
          <Link href="/terms" className="text-gray-500 hover:text-gray-700">
            使用條款
          </Link>
          <Link href="/contact" className="text-gray-500 hover:text-gray-700">
            聯絡我們
          </Link>
          <span className="ml-auto text-gray-400">
            © {year} {SITE_CONFIG.name}
          </span>
        </div>
      </div>
    </footer>
  );
}
