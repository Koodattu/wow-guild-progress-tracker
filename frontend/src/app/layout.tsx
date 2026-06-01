"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { usePathname } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState, useMemo } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { QueryProvider } from "@/lib/query-provider";
import {
  buildWebSiteStructuredData,
  getCanonicalUrl,
  getPageMetadata,
  SEO_KEYWORDS,
  SITE_IMAGE,
  SITE_IMAGE_ALT,
  SITE_NAME,
} from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const WEBSITE_STRUCTURED_DATA = buildWebSiteStructuredData();
const KEYWORDS = SEO_KEYWORDS.join(", ");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isLivestreamsPage = pathname === "/livestreams";
  const isHomePage = pathname === "/";
  const robotsContent =
    pathname.startsWith("/admin") || pathname.startsWith("/profile")
      ? "noindex, nofollow"
      : "index, follow";
  const [locale, setLocale] = useState<"en" | "fi">("en");
  const [messages, setMessages] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    // Get locale from cookie
    const match = document.cookie.match(/NEXT_LOCALE=([^;]+)/);
    const cookieLocale = (match?.[1] as "en" | "fi") || "en";
    setLocale(cookieLocale);

    // Load messages
    import(`../../messages/${cookieLocale}.json`).then((m) => setMessages(m.default));
  }, []);

  const pageMetadata = useMemo(() => getPageMetadata(pathname, locale), [pathname, locale]);
  const fullTitle = `${pageMetadata.title} | ${SITE_NAME}`;
  const canonicalUrl = getCanonicalUrl(pathname);

  if (!messages) {
    return (
      <html lang={locale}>
        <head>
          <title>{fullTitle}</title>
          <meta name="title" content={fullTitle} />
          <meta name="description" content={pageMetadata.description} />
          <meta name="application-name" content={SITE_NAME} />
          <meta name="apple-mobile-web-app-title" content={SITE_NAME} />
          <meta name="keywords" content={KEYWORDS} />
          <meta name="robots" content={robotsContent} />
          <link rel="icon" href="/icon.png" type="image/png" />
          <link rel="canonical" href={canonicalUrl} />
          <meta property="og:type" content="website" />
          <meta property="og:url" content={canonicalUrl} />
          <meta property="og:title" content={fullTitle} />
          <meta property="og:description" content={pageMetadata.description} />
          <meta property="og:image" content={SITE_IMAGE} />
          <meta property="og:image:secure_url" content={SITE_IMAGE} />
          <meta property="og:image:type" content="image/png" />
          <meta property="og:image:width" content="1187" />
          <meta property="og:image:height" content="536" />
          <meta property="og:image:alt" content={SITE_IMAGE_ALT} />
          <meta property="og:site_name" content={SITE_NAME} />
          <meta property="og:locale" content="en_US" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:url" content={canonicalUrl} />
          <meta name="twitter:title" content={fullTitle} />
          <meta name="twitter:description" content={pageMetadata.description} />
          <meta name="twitter:image" content={SITE_IMAGE} />
          <meta name="twitter:image:alt" content={SITE_IMAGE_ALT} />
          {isHomePage && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify(WEBSITE_STRUCTURED_DATA),
              }}
            />
          )}
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-white">Loading...</div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang={locale}>
      <head>
        {/* Primary Meta Tags */}
        <title>{fullTitle}</title>
        <meta name="title" content={fullTitle} />
        <meta name="description" content={pageMetadata.description} />
        <meta name="application-name" content={SITE_NAME} />
        <meta name="apple-mobile-web-app-title" content={SITE_NAME} />
        <meta name="keywords" content={KEYWORDS} />
        <meta name="robots" content={robotsContent} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#1a1a2e" />

        {/* Favicon */}
        <link rel="icon" href="/icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icon.png" />

        {/* Canonical URL */}
        <link rel="canonical" href={canonicalUrl} />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={pageMetadata.description} />
        <meta property="og:image" content={SITE_IMAGE} />
        <meta property="og:image:secure_url" content={SITE_IMAGE} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1187" />
        <meta property="og:image:height" content="536" />
        <meta property="og:image:alt" content={SITE_IMAGE_ALT} />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:locale" content={locale === "fi" ? "fi_FI" : "en_US"} />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={canonicalUrl} />
        <meta name="twitter:title" content={fullTitle} />
        <meta name="twitter:description" content={pageMetadata.description} />
        <meta name="twitter:image" content={SITE_IMAGE} />
        <meta name="twitter:image:alt" content={SITE_IMAGE_ALT} />

        {isHomePage && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(WEBSITE_STRUCTURED_DATA),
            }}
          />
        )}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <QueryProvider>
          <AuthProvider>
            <NextIntlClientProvider locale={locale} messages={messages}>
              <Navigation />
              {children}
              {!isLivestreamsPage && <Footer />}
            </NextIntlClientProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
