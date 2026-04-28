import Link from "next/link";
import { Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <div className="text-6xl font-bold text-gray-200 mb-2">404</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-3">搵唔到呢個頁面</h1>
      <p className="text-sm text-gray-500 mb-8 leading-relaxed">
        個樓盤可能已經售出、下架或者連結過時。
        <br />
        試吓返首頁，或者直接搜尋你心儀嘅地區。
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Home size={15} />
          返回首頁
        </Link>
        <Link
          href="/search"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Search size={15} />
          搜尋樓盤
        </Link>
      </div>
    </div>
  );
}
