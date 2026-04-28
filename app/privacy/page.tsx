import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SITE_CONFIG } from "@/lib/config";

export const metadata: Metadata = {
  title: "私隱政策",
  description: `${SITE_CONFIG.name} 私隱政策 — 個人資料收集、使用、保留、用戶權利與聯絡方式`,
};

/**
 * Privacy Policy — aligned with Hong Kong Personal Data (Privacy) Ordinance (Cap. 486).
 *
 * Covers: data collected, lawful purpose, retention period, transfer / disclosure,
 * user rights (access / correction), security, contact for data-access requests.
 */
export default function PrivacyPolicyPage() {
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

      <h1 className="text-2xl font-bold text-gray-900 mb-2">私隱政策</h1>
      <p className="text-sm text-gray-500 mb-8">最後更新：{updated}</p>

      <div className="space-y-7 text-sm text-gray-700 leading-relaxed">
        <Section title="1. 我哋係邊個">
          <p>
            「{SITE_CONFIG.name}」（下稱「本網站」）係一個樓盤資訊搜尋及比較平台，
            為香港用戶提供新盤、精選二手對比、按揭計算等資訊服務。本網站重視用戶私隱，
            並嚴格遵守
            <span className="font-medium">《個人資料（私隱）條例》（香港法例第486章）</span>
            (PDPO) 處理任何個人資料。
          </p>
        </Section>

        <Section title="2. 我哋會收集咩資料">
          <p>本網站只會收集為提供服務所必須的最少資料，包括：</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              <span className="font-medium">技術性資料</span>：瀏覽器類型、裝置類型、IP 位址、
              訪問時間、頁面瀏覽紀錄、搜尋關鍵字等（用於改善網站體驗）。
            </li>
            <li>
              <span className="font-medium">用戶提交資料</span>：當你透過 WhatsApp 或其他渠道
              主動聯絡我哋時，所提供之姓名、聯絡電話、查詢內容、預算、心儀地區及房型等資料。
            </li>
            <li>
              <span className="font-medium">Cookies 及類似技術</span>：用於記住偏好設定、
              統計流量。本網站不使用追蹤式廣告 cookies。
            </li>
          </ul>
          <p className="mt-2 text-gray-500 text-xs">
            本網站
            <span className="font-medium">不會主動要求或儲存</span>
            身份證號碼、銀行戶口資料、信用卡號碼。
          </p>
        </Section>

        <Section title="3. 收集個人資料嘅目的">
          <p>個人資料只會用於以下目的：</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>回應你嘅查詢及提供樓盤資訊</li>
            <li>聯繫安排睇樓、提供價單或相關物業服務</li>
            <li>改善網站功能、用戶體驗及內容質素</li>
            <li>遵守適用法律及監管要求</li>
          </ul>
          <p className="mt-2">
            未經你嘅明確同意，
            <span className="font-medium">本網站不會將個人資料用於直接促銷</span>。
          </p>
        </Section>

        <Section title="4. 個人資料嘅保留期">
          <p>個人資料保留期視乎收集目的：</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              查詢類紀錄：自最後互動起保留
              <span className="font-medium">不超過 12 個月</span>，
              到期後自動刪除。
            </li>
            <li>
              成功配對個案：相關客戶資料按
              <span className="font-medium">代理／信託合約</span>
              所訂期限保留。
            </li>
            <li>
              網站技術日誌（access logs）：保留
              <span className="font-medium">不超過 90 日</span>。
            </li>
          </ul>
        </Section>

        <Section title="5. 資料披露及轉移">
          <p>
            除非以下情況，本網站
            <span className="font-medium">不會將個人資料轉移或披露</span>
            予第三方：
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>取得你嘅明確同意</li>
            <li>
              為提供你要求嘅服務，必須轉介至持牌地產代理、律師或銀行（事前會通知）
            </li>
            <li>法律要求或政府部門合法要求披露</li>
            <li>保障本網站、用戶或第三方合法權益</li>
          </ul>
        </Section>

        <Section title="6. 你嘅權利（PDPO 第十八／二十二／二十三條）">
          <p>根據《個人資料（私隱）條例》，你有權：</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>查詢本網站是否持有你嘅個人資料</li>
            <li>要求查閱及取得該等資料嘅副本</li>
            <li>要求更正不準確或過時嘅資料</li>
            <li>要求刪除個人資料（受法律保留要求所限）</li>
            <li>撤回先前給予嘅同意</li>
          </ul>
          <p className="mt-2">
            提出查閱或更正要求時，可能需收取合理行政費（按 PDPO 容許範圍）。
          </p>
        </Section>

        <Section title="7. 資料安全">
          <p>
            本網站採用業界常見嘅技術及程序保護個人資料，包括 HTTPS 加密傳輸、
            服務存取限制、定期安全檢視等。雖然如此，
            <span className="font-medium">
              網絡傳輸無法做到絕對安全
            </span>
            ，請審慎評估網上提交嘅資料。
          </p>
        </Section>

        <Section title="8. 兒童私隱">
          <p>
            本網站服務對象為成年用戶，不會主動收集 18 歲以下人士嘅個人資料。
            如發現未成年用戶提交資料，將會盡快刪除。
          </p>
        </Section>

        <Section title="9. 政策更新">
          <p>
            本網站可能因應法律或服務變更而修訂本私隱政策；任何重大變更會於本頁面
            顯著位置公告。請定期查閱。
          </p>
        </Section>

        <Section title="10. 聯絡我哋">
          <p>
            如你對本網站嘅私隱實務有疑問、希望行使上述權利、或欲提出投訴，
            請透過以下方式聯絡：
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              WhatsApp：
              <a
                href={`https://wa.me/${SITE_CONFIG.whatsappNumber}?text=${encodeURIComponent(
                  "你好，我想查詢私隱政策／個人資料事宜。"
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline ml-1"
              >
                +{SITE_CONFIG.whatsappNumber}
              </a>
            </li>
            <li>
              站內聯絡頁：
              <Link href="/contact" className="text-blue-600 hover:underline ml-1">
                /contact
              </Link>
            </li>
          </ul>
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
