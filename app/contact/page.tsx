import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MessageCircle, AlertTriangle, Mail } from "lucide-react";
import WhatsAppCTA from "@/components/shared/WhatsAppCTA";
import { WHATSAPP_MESSAGES, SITE_CONFIG, buildWhatsAppUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "聯絡我們",
  description: `${SITE_CONFIG.name} 聯絡渠道 — WhatsApp 查詢、回報資料錯誤、私隱要求`,
};

export default function ContactPage() {
  const dataErrorUrl = buildWhatsAppUrl(
    "你好，我想回報網站上嘅資料錯誤：\n樓盤名稱：\n錯誤內容：\n（如方便，請提供樓盤頁面網址）",
    SITE_CONFIG.whatsappNumber
  );
  const privacyUrl = buildWhatsAppUrl(
    "你好，我想查詢私隱政策／個人資料事宜（例如：查閱、更正、刪除）。",
    SITE_CONFIG.whatsappNumber
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={14} />
        返回首頁
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">聯絡我們</h1>
      <p className="text-sm text-gray-500 mb-8">
        歡迎透過以下渠道聯絡，一般查詢會於 1 個工作日內回覆。
      </p>

      <div className="space-y-4">
        {/* WhatsApp 一般查詢 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
              <MessageCircle size={20} className="text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 mb-0.5">WhatsApp 查詢</h2>
              <p className="text-xs text-gray-500">樓盤、按揭、查詢價單、安排睇樓</p>
            </div>
          </div>
          <WhatsAppCTA
            message={WHATSAPP_MESSAGES.general()}
            label="WhatsApp 即時查詢"
            size="md"
            block
          />
        </div>

        {/* 回報資料錯誤 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 mb-0.5">回報資料錯誤</h2>
              <p className="text-xs text-gray-500">
                睇到價格、面積、戶型不正確？協助我哋改善資料質素。
              </p>
            </div>
          </div>
          <a
            href={dataErrorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg py-2.5 hover:bg-amber-100 transition-colors font-medium"
          >
            <AlertTriangle size={15} />
            WhatsApp 回報錯誤
          </a>
        </div>

        {/* 私隱要求 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
              <Mail size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 mb-0.5">私隱／個人資料要求</h2>
              <p className="text-xs text-gray-500">
                查閱、更正、刪除個人資料（按 PDPO 第十八／二十二／二十三條）
              </p>
            </div>
          </div>
          <a
            href={privacyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-lg py-2.5 hover:bg-blue-100 transition-colors font-medium"
          >
            <Mail size={15} />
            WhatsApp 查詢私隱事宜
          </a>
          <p className="text-xs text-gray-400 mt-3">
            詳情可參閱
            <Link href="/privacy" className="text-blue-600 hover:underline ml-1">
              私隱政策
            </Link>
            。
          </p>
        </div>
      </div>
    </div>
  );
}
