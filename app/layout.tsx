import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import SiteFooter from "@/components/layout/SiteFooter";
import { defaultMetadata, organizationJsonLd, websiteJsonLd } from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = defaultMetadata();

/**
 * Mobile viewport + brand color for the address bar (mobile Chrome / Safari)
 * — `viewport` is the App-Router-friendly replacement for the legacy
 * `<meta name="viewport">`.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-HK" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        {/* Site-wide JSON-LD: Organization + WebSite (with site-search action). */}
        <script
          type="application/ld+json"
          // JSON.stringify is server-side; React doesn't escape inside script tag —
          // safe because we control the input shape (no user data interpolated).
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd()),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd()),
          }}
        />
      </head>
      <body className="antialiased bg-gray-50 min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
