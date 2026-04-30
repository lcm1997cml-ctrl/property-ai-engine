// Site-wide configuration — update these values before going live
export const SITE_CONFIG = {
  name: "香港樓盤搜尋",
  tagline: "搵樓、比較、計按揭，一站搞掂",
  description: "香港樓盤搜尋比較工具，按地區、預算、房型搵樓，即時計按揭月供",
  // Operator's WhatsApp number — country code 852 (HK) + 91202466.
  // The env var takes precedence (set in Vercel → Project → Environment Variables);
  // this fallback ensures production still routes correctly if the env var
  // isn't set yet.
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "85291202466",
};

// WhatsApp message templates for different pages
export const WHATSAPP_MESSAGES = {
  search: (district?: string, budgetDescription?: string) => {
    if (district && budgetDescription) {
      return `你好，我想查詢${district}區、${budgetDescription}的樓盤，請幫我介紹。`;
    }
    if (district) {
      return `你好，我想查詢${district}區樓盤，請幫我介紹。`;
    }
    if (budgetDescription) {
      return `你好，我想查詢${budgetDescription}的樓盤，請幫我介紹。`;
    }
    return `你好，我想查詢香港樓盤，請幫我介紹。`;
  },
  compare: (listings?: string[]) =>
    listings?.length
      ? `你好，我想比較以下樓盤，想請你幫我分析邊個更適合我：\n${listings.join("\n")}`
      : `你好，我想比較幾個樓盤，想請你幫我分析邊個更適合我。`,
  mortgage: (monthlyPayment?: string) =>
    monthlyPayment
      ? `你好，我按揭預算大概係每月供款 ${monthlyPayment}，想你幫我推介合適樓盤。`
      : `你好，我想了解按揭詳情，請幫我推介合適樓盤。`,
  listing: (name?: string) =>
    name
      ? `你好，我對「${name}」有興趣，想了解更多詳情。`
      : `你好，我對某樓盤有興趣，想了解更多詳情。`,
  general: () => `你好，我想查詢香港樓盤資訊，請幫幫我。`,
};

export function buildWhatsAppUrl(message: string, number?: string): string {
  const phone = number || SITE_CONFIG.whatsappNumber;
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${phone}?text=${encoded}`;
}
