import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SITE_CONFIG } from "@/lib/config";

export const metadata: Metadata = {
  title: "使用條款",
  description: `${SITE_CONFIG.name} 使用條款 — 服務性質、用戶責任、免責聲明`,
};

/**
 * Terms of Use — kept short and pragmatic. Focus on disclaiming reliance,
 * accuracy, and limit-of-liability. Not legal advice; user should have a
 * solicitor review before public launch.
 */
export default function TermsPage() {
  const updated = "2026-04-27";

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={14} />
        返回首頁
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">使用條款</h1>
      <p className="text-sm text-gray-500 mb-8">最後更新：{updated}</p>

      <div className="space-y-7 text-sm text-gray-700 leading-relaxed">
        <Section title="1. 接受條款">
          <p>
            當你使用「{SITE_CONFIG.name}」（下稱「本網站」），即表示你同意接受本使用條款。
            如不同意，請停止使用。
          </p>
        </Section>

        <Section title="2. 服務性質">
          <p>
            本網站係樓盤資訊搜尋及比較平台，所提供之資料、戶型、價格、AI 摘要、按揭計算結果、
            「精選二手」對比等
            <span className="font-medium">純屬參考性質</span>，
            <span className="font-medium">不構成任何要約、合約建議、財務或法律意見</span>。
          </p>
        </Section>

        <Section title="3. 資料來源及準確性">
          <p>
            新樓盤資料源自公開渠道（包括但不限於 28Hse、發展商銷售網站等），由系統定期抓取，
            可能存在延遲、解析錯誤或缺漏。二手盤為精選成交參考，並非完整放盤列表。
            最終資料以
            <span className="font-medium">發展商正式價單、地產代理及律師意見</span>
            為準。
          </p>
        </Section>

        <Section title="4. 用戶責任">
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>不得利用本網站進行違法、騷擾、欺詐或侵犯他人權利之活動</li>
            <li>不得試圖破解、爬取超出個人合理使用之資料</li>
            <li>所提供之查詢資料須為真實、準確</li>
            <li>就涉及之物業交易，自行作獨立查證、聘請律師及專業顧問</li>
          </ul>
        </Section>

        <Section title="5. 免責聲明">
          <p>
            本網站<span className="font-medium">不保證</span>所列資料嘅準確性、完整性、時效性或可靠性。
            本網站、其經營者、僱員及合作伙伴
            <span className="font-medium">不就任何因依賴本網內容</span>
            而招致之直接、間接、相應或衍生損失承擔責任，包括但不限於：
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>樓盤價格、面積、戶型等資料與實際不符</li>
            <li>按揭計算結果與銀行實際批核不同</li>
            <li>瀏覽中斷、資料遺失、第三方鏈結失效</li>
          </ul>
        </Section>

        <Section title="6. 知識產權">
          <p>
            本網站之版面設計、原創內容、AI 生成摘要、整理及比較分析屬本網站所有；
            未經書面同意，不得複製、修改、公開傳播或作商業用途。樓盤原始資料及圖片
            版權歸原來源所有。
          </p>
        </Section>

        <Section title="7. 適用法律">
          <p>
            本使用條款受
            <span className="font-medium">香港特別行政區法律</span>
            管轄並按其詮釋；任何爭議受香港法院專屬管轄。
          </p>
        </Section>

        <Section title="8. 條款變更">
          <p>
            本網站可能不時修訂本使用條款；重大變更會於本頁面顯著位置公告。
            繼續使用即視為接受最新條款。
          </p>
        </Section>

        <Section title="9. 聯絡">
          <p>
            如有任何疑問，請瀏覽
            <Link href="/contact" className="text-blue-600 hover:underline ml-1">
              聯絡我們
            </Link>
            頁面。
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold text-gray-900 mb-2">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
