"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { usePathname } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState, useMemo } from "react";
import { AuthProvider } from "@/context/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://suomiwow.vaarattu.tv";
const SITE_NAME = "Suomi WoW";
const SITE_DESCRIPTION = "Track World of Warcraft guild progression for Finnish guilds. View raid progress, boss kills, livestreams, and events.";

// Page-specific metadata configuration
const getPageMetadata = (pathname: string, locale: "en" | "fi") => {
  const isEnglish = locale === "en";

  const pages: Record<string, { title: string; description: string }> = {
    "/": {
      title: isEnglish ? "Home" : "Etusivu",
      description: isEnglish
        ? "Track World of Warcraft guild progression for Finnish guilds. View raid progress, boss kills, and latest events."
        : "Seuraa suomalaisten World of Warcraft -kiltojen edistymistä. Katso raid-edistyminen, boss-tapit ja viimeisimmät tapahtumat.",
    },
    "/guilds": {
      title: isEnglish ? "Guilds" : "Killat",
      description: isEnglish ? "Browse all Finnish WoW guilds and their raid progression." : "Selaa kaikkia suomalaisia WoW-kiltoja ja niiden raid-edistymistä.",
    },
    "/events": {
      title: isEnglish ? "Events" : "Tapahtumat",
      description: isEnglish ? "Latest boss kills and raid events from Finnish WoW guilds." : "Viimeisimmät boss-tapit ja raid-tapahtumat suomalaisilta WoW-killoilta.",
    },
    "/livestreams": {
      title: isEnglish ? "Livestreams" : "Striimit",
      description: isEnglish ? "Watch live WoW streams from Finnish guild members." : "Katso suomalaisten kiltalaisten WoW-striimejä livenä.",
    },
    "/timetable": {
      title: isEnglish ? "Raid Timetable" : "Raid-aikataulu",
      description: isEnglish ? "View raid schedules for Finnish WoW guilds." : "Katso suomalaisten WoW-kiltojen raid-aikataulut.",
    },
    "/privacy": {
      title: isEnglish ? "Privacy Policy" : "Tietosuojakäytäntö",
      description: isEnglish ? "Privacy policy for Finnish WoW Progress." : "Finnish WoW Progressin tietosuojakäytäntö.",
    },
    "/terms": {
      title: isEnglish ? "Terms of Service" : "Käyttöehdot",
      description: isEnglish ? "Terms of service for Finnish WoW Progress." : "Finnish WoW Progressin käyttöehdot.",
    },
    "/profile": {
      title: isEnglish ? "Profile" : "Profiili",
      description: isEnglish ? "View and manage your profile." : "Näytä ja hallitse profiiliasi.",
    },
  };

  // Check for guild detail pages
  if (pathname.startsWith("/guilds/") && pathname.split("/").length >= 4) {
    const parts = pathname.split("/");
    const realm = decodeURIComponent(parts[2] || "");
    const guildName = decodeURIComponent(parts[3] || "");
    return {
      title: `${guildName} - ${realm}`,
      description: isEnglish ? `View raid progression and details for ${guildName} on ${realm}.` : `Katso ${guildName} killan raid-edistyminen ja tiedot (${realm}).`,
    };
  }

  return pages[pathname] || pages["/"];
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isLivestreamsPage = pathname === "/livestreams";
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
  const canonicalUrl = `${SITE_URL}${pathname}`;

  if (!messages) {
    return (
      <html lang={locale}>
        <head>
          <title>{SITE_NAME}</title>
          <meta name="description" content={SITE_DESCRIPTION} />
          <link rel="icon" href="/icon.png" type="image/png" />
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
        <meta property="og:image" content={`${SITE_URL}/logo.png`} />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:locale" content={locale === "fi" ? "fi_FI" : "en_US"} />

        {/* Twitter */}
        <meta property="twitter:card" content="summary" />
        <meta property="twitter:url" content={canonicalUrl} />
        <meta property="twitter:title" content={fullTitle} />
        <meta property="twitter:description" content={pageMetadata.description} />
        <meta property="twitter:image" content={`${SITE_URL}/logo.png`} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <Navigation />
            {children}
            {!isLivestreamsPage && <Footer />}
          </NextIntlClientProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
