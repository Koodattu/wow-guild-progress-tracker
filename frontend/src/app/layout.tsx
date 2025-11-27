"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { usePathname } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isLivestreamsPage = pathname === "/livestreams";
  const [locale, setLocale] = useState<"en" | "fi">("en");
  const [messages, setMessages] = useState<any>(null);

  useEffect(() => {
    // Get locale from cookie
    const match = document.cookie.match(/NEXT_LOCALE=([^;]+)/);
    const cookieLocale = (match?.[1] as "en" | "fi") || "en";
    setLocale(cookieLocale);

    // Load messages
    import(`../../messages/${cookieLocale}.json`).then((m) => setMessages(m.default));
  }, []);

  if (!messages) {
    return (
      <html lang={locale}>
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Navigation />
          {children}
          {!isLivestreamsPage && <Footer />}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
