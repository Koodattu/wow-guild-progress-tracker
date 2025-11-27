"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { setLocale, getLocale } from "@/lib/locale";

export default function Navigation() {
  const pathname = usePathname();
  const t = useTranslations("navigation");
  const tInfo = useTranslations("infoDialog");
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [isContactDropdownOpen, setIsContactDropdownOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState<"en" | "fi">("en");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentLocale(getLocale());
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsContactDropdownOpen(false);
      }
    };

    if (isContactDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isContactDropdownOpen]);

  const isActive = (path: string) => {
    if (path === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(path);
  };

  const handleLanguageChange = (newLocale: "en" | "fi") => {
    setLocale(newLocale);
  };

  return (
    <>
      <nav className="bg-gray-900 border-b border-gray-700 mb-4">
        <div className="w-full px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
                <Image src="/logo.png" alt="WoW Guild Progress" width={160} height={30} priority />
              </Link>
              <div className="flex gap-6">
                <Link
                  href="/"
                  className={`text-sm font-medium transition-colors ${
                    isActive("/") && !pathname.startsWith("/guilds") && !pathname.startsWith("/events") && !pathname.startsWith("/timetable")
                      ? "text-blue-400 border-b-2 border-blue-400"
                      : "text-gray-400 hover:text-white"
                  } py-5`}
                >
                  {t("progressLeaderboard")}
                </Link>
                <Link
                  href="/guilds"
                  className={`text-sm font-medium transition-colors ${isActive("/guilds") ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-white"} py-5`}
                >
                  {t("allGuilds")}
                </Link>
                <Link
                  href="/timetable"
                  className={`text-sm font-medium transition-colors ${isActive("/timetable") ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-white"} py-5`}
                >
                  {t("raidTimetable")}
                </Link>
                <Link
                  href="/livestreams"
                  className={`text-sm font-medium transition-colors ${
                    isActive("/livestreams") ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-white"
                  } py-5`}
                >
                  {t("livestreams")}
                </Link>
                <Link
                  href="/events"
                  className={`text-sm font-medium transition-colors ${isActive("/events") ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-white"} py-5`}
                >
                  {t("latestEvents")}
                </Link>
              </div>
            </div>

            {/* Right side buttons */}
            <div className="flex items-center gap-3">
              {/* Language Switcher */}
              <div className="flex items-center gap-1 bg-gray-800 rounded-md p-1">
                <button
                  onClick={() => handleLanguageChange("en")}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${currentLocale === "en" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
                >
                  EN
                </button>
                <button
                  onClick={() => handleLanguageChange("fi")}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${currentLocale === "fi" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
                >
                  FI
                </button>
              </div>

              {/* Info Dialog Button */}
              <button
                onClick={() => setIsInfoDialogOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md transition-colors font-medium text-sm cursor-pointer"
                aria-label="Information"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                {t("info")}
              </button>

              {/* Contact Dropdown Button */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsContactDropdownOpen(!isContactDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md transition-colors font-medium text-sm cursor-pointer"
                  aria-label="Contact Links"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                  {t("contact")}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-4 w-4 transition-transform ${isContactDropdownOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {isContactDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-32 bg-gray-800 rounded-md shadow-lg border border-gray-700 z-50 overflow-hidden">
                    <div className="py-0">
                      {/* GitHub Link */}
                      <a
                        href="https://github.com/Koodattu/wow-guild-progress-tracker"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setIsContactDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm text-white bg-gray-700 hover:bg-gray-600 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                        {t("github")}
                      </a>

                      {/* Discord Link */}
                      <a
                        href="https://discord.gg/BgQDncamHZ"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setIsContactDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                        </svg>
                        {t("discord")}
                      </a>

                      {/* Twitch Link */}
                      <a
                        href="https://www.twitch.tv/vaarattu"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setIsContactDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm text-white bg-purple-600 hover:bg-purple-500 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                        </svg>
                        {t("twitch")}
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Login with Discord Button */}
              <button
                className="flex items-center gap-2 px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors font-medium text-sm cursor-pointer"
                aria-label="Login with Discord"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                {t("loginWithDiscord")}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Info Dialog */}
      {isInfoDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsInfoDialogOpen(false)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4 border border-blue-500 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-3">{tInfo("title")}</h3>
                <p className="text-gray-300 mb-4">{tInfo("description")}</p>
                <ul className="list-disc list-inside text-gray-300 space-y-2 mb-4">
                  <li>{tInfo("features.realtime")}</li>
                  <li>{tInfo("features.rankings")}</li>
                  <li>{tInfo("features.history")}</li>
                  <li>{tInfo("features.schedules")}</li>
                  <li>{tInfo("features.livestreams")}</li>
                </ul>
                <p className="text-gray-400 text-sm">{tInfo("dataSource")}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setIsInfoDialogOpen(false)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium">
                {tInfo("close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
