"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Building2, Menu, X, Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { SITE_CONFIG } from "@/lib/config";

const NAV_LINKS = [
  { href: "/search", label: "搜尋樓盤" },
  { href: "/mortgage", label: "按揭計算" },
  { href: "/compare", label: "比較樓盤" },
];

/**
 * Compact name-search input — submits to /search?q=<query>.
 *
 * Mounted twice: once in the desktop nav (always visible at md+) and once
 * inside the mobile menu so users searching from a phone don't lose access.
 */
function NameSearchBox({ onSubmitNavigate, autoFocus = false }: {
  onSubmitNavigate?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        const url = q ? `/search?q=${encodeURIComponent(q)}` : "/search";
        router.push(url);
        onSubmitNavigate?.();
      }}
      className="relative w-full"
    >
      <Search
        size={14}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="搵樓盤..."
        className="w-full h-9 pl-8 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-lg placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        autoComplete="off"
        enterKeyHint="search"
        autoFocus={autoFocus}
        aria-label="樓盤名稱搜尋"
      />
    </form>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-3">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-gray-900 text-lg shrink-0"
          >
            <Building2 className="h-5 w-5 text-blue-600" />
            <span className="hidden sm:inline">{SITE_CONFIG.name}</span>
          </Link>

          {/* Desktop search — between logo and nav links */}
          <div className="hidden md:block flex-1 max-w-sm">
            <NameSearchBox />
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 shrink-0">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                  pathname.startsWith(link.href)
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <div className="p-3 border-b border-gray-100">
            <NameSearchBox
              onSubmitNavigate={() => setMobileOpen(false)}
              autoFocus
            />
          </div>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "block px-4 py-3 text-sm font-medium border-b border-gray-50",
                pathname.startsWith(link.href)
                  ? "text-blue-700 bg-blue-50"
                  : "text-gray-700 hover:bg-gray-50"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
