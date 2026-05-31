"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { setLocale, getLocale } from "@/lib/locale";
import { useAuth } from "@/context/AuthContext";
import { HorseRaceMode, useHorseRaceMode } from "@/lib/horse-race-preferences";

const HORSE_RACE_MODE_OPTIONS: Array<{ mode: HorseRaceMode; labelKey: "horseRaceRandom" | "horseRaceCrest" | "horseRaceJapanese" | "horseRaceUma" | "horseRaceOff" }> = [
  { mode: "random", labelKey: "horseRaceRandom" },
  { mode: "crest", labelKey: "horseRaceCrest" },
  { mode: "japanese", labelKey: "horseRaceJapanese" },
  { mode: "uma", labelKey: "horseRaceUma" },
  { mode: "off", labelKey: "horseRaceOff" },
];

const NAVIGATION_LINKS = [
  { href: "/", labelKey: "progressLeaderboard" },
  { href: "/guilds", labelKey: "allGuilds" },
  { href: "/character-rankings", labelKey: "characterRankings" },
  { href: "/compare", labelKey: "compare" },
  { href: "/tierlists", labelKey: "tierLists" },
  { href: "/raid-analytics", labelKey: "raidAnalytics" },
  { href: "/timetable", labelKey: "raidTimetable" },
  { href: "/livestreams", labelKey: "livestreams" },
  { href: "/events", labelKey: "latestEvents" },
  { href: "/pickems", labelKey: "pickems" },
] as const;

const getDesktopNavLinkClass = (isCurrent: boolean, previousIsCurrent: boolean, nextIsCurrent: boolean) =>
  `flex h-full min-w-24 flex-1 items-center justify-center whitespace-nowrap border-x border-b-2 px-2 text-center text-sm font-medium transition-[background-color,color] ${
    isCurrent
      ? "border-x-transparent border-b-blue-400 bg-blue-600/35 text-white"
      : `border-b-transparent text-gray-400 hover:bg-gray-800/80 hover:text-white ${previousIsCurrent ? "border-l-transparent" : "border-l-gray-700/80"} ${
          nextIsCurrent ? "border-r-transparent" : "border-r-gray-700/80"
        }`
  }`;

const getMobileNavLinkClass = (isCurrent: boolean) =>
  `block rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
    isCurrent ? "border-blue-400/30 bg-blue-500/15 text-blue-100" : "border-transparent text-gray-300 hover:border-white/10 hover:bg-white/5 hover:text-white"
  }`;

export default function Navigation() {
  const pathname = usePathname();
  const t = useTranslations("navigation");
  const tInfo = useTranslations("infoDialog");
  const { user, isLoading, login, logout } = useAuth();
  const {
    mode: horseRaceMode,
    showCharacters: showHorseRaceCharacters,
    showBackground: showHorseRaceBackground,
    setMode: setHorseRaceMode,
    setShowCharacters: setShowHorseRaceCharacters,
    setShowBackground: setShowHorseRaceBackground,
  } = useHorseRaceMode();
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [isContactDropdownOpen, setIsContactDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isHorseRaceDropdownOpen, setIsHorseRaceDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState<"en" | "fi">("en");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const horseRaceDropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentLocale(getLocale());
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsHorseRaceDropdownOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsContactDropdownOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
      if (horseRaceDropdownRef.current && !horseRaceDropdownRef.current.contains(event.target as Node)) {
        setIsHorseRaceDropdownOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isContactDropdownOpen || isUserDropdownOpen || isHorseRaceDropdownOpen || isMobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isContactDropdownOpen, isHorseRaceDropdownOpen, isUserDropdownOpen, isMobileMenuOpen]);

  const isActive = (path: string) => {
    if (path === "/") {
      return pathname === "/" || pathname === "/progress";
    }
    return pathname.startsWith(path);
  };

  const handleLanguageChange = (newLocale: "en" | "fi") => {
    setLocale(newLocale);
  };

  const isFrontpage = pathname === "/";
  const horseRaceModeLabel =
    horseRaceMode === "random"
      ? t("horseRaceRandom")
      : horseRaceMode === "crest"
        ? t("horseRaceCrest")
        : horseRaceMode === "japanese"
          ? t("horseRaceJapanese")
          : horseRaceMode === "uma"
            ? t("horseRaceUma")
            : t("horseRaceOff");

  return (
    <>
      <nav className="mb-4 border-b border-gray-700 bg-gray-900">
        <div className="w-full px-4 md:px-6">
          <div className="flex h-14 items-center justify-between gap-3 md:h-16">
            {/* Left side: Logo and Desktop Navigation */}
            <div className="flex h-full min-w-0 flex-1 items-center gap-4 md:gap-8">
              <Link href="/" className="flex shrink-0 items-center transition-opacity hover:opacity-80">
                <Image src="/logo.png" alt="WoW Guild Progress" width={100} height={18} className="md:w-[120px]" priority />
              </Link>

              {/* Desktop Navigation Links - Hidden on mobile */}
              <div className="hidden h-full min-w-0 flex-1 lg:block">
                <div className="flex h-full max-w-full items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {NAVIGATION_LINKS.map((link, index) => {
                    const isCurrent = isActive(link.href);
                    const previousIsCurrent = index > 0 ? isActive(NAVIGATION_LINKS[index - 1].href) : false;
                    const nextIsCurrent = index < NAVIGATION_LINKS.length - 1 ? isActive(NAVIGATION_LINKS[index + 1].href) : false;

                    return (
                      <Link key={link.href} href={link.href} className={getDesktopNavLinkClass(isCurrent, previousIsCurrent, nextIsCurrent)}>
                        {t(link.labelKey)}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right side buttons */}
            <div className="flex items-center gap-2 md:gap-3">
              <div className={`relative h-8 w-8 shrink-0 ${isFrontpage ? "" : "pointer-events-none invisible"}`} ref={horseRaceDropdownRef}>
                <button
                  onClick={() => setIsHorseRaceDropdownOpen((isOpen) => !isOpen)}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center transition-transform hover:scale-110 active:scale-95"
                  title={t("horseRaceToggleTitle")}
                  aria-label={`${t("horseRaceToggleTitle")}: ${horseRaceModeLabel}`}
                  aria-expanded={isHorseRaceDropdownOpen}
                >
                  <img
                    src="/horse/racer.png"
                    alt=""
                    className={`h-7 w-7 shrink-0 object-contain transition-all ${horseRaceMode === "off" ? "grayscale opacity-55" : "opacity-100"}`}
                    aria-hidden="true"
                  />
                </button>

                {isFrontpage && isHorseRaceDropdownOpen && (
                  <div className="absolute left-1/2 z-50 mt-2 w-max min-w-56 -translate-x-1/2 rounded-md border border-white/10 bg-gray-950/95 p-2 shadow-2xl shadow-black/40">
                    <div className="flex overflow-hidden rounded border border-white/10 bg-black/25">
                      {HORSE_RACE_MODE_OPTIONS.map((option) => (
                        <button
                          key={option.mode}
                          onClick={() => setHorseRaceMode(option.mode)}
                          className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            horseRaceMode === option.mode ? "bg-blue-500 text-white" : "text-gray-300 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {t(option.labelKey)}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex w-full overflow-hidden rounded border border-white/10 bg-black/25">
                      <button
                        onClick={() => setShowHorseRaceCharacters(true)}
                        className={`flex-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          showHorseRaceCharacters ? "bg-blue-500 text-white" : "text-gray-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {t("horseRaceCharacters")}
                      </button>
                      <button
                        onClick={() => setShowHorseRaceCharacters(false)}
                        className={`flex-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          !showHorseRaceCharacters ? "bg-blue-500 text-white" : "text-gray-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {t("horseRaceOff")}
                      </button>
                    </div>
                    <div className="mt-2 flex w-full overflow-hidden rounded border border-white/10 bg-black/25">
                      <button
                        onClick={() => setShowHorseRaceBackground(true)}
                        className={`flex-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          showHorseRaceBackground ? "bg-blue-500 text-white" : "text-gray-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {t("horseRaceBackground")}
                      </button>
                      <button
                        onClick={() => setShowHorseRaceBackground(false)}
                        className={`flex-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          !showHorseRaceBackground ? "bg-blue-500 text-white" : "text-gray-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {t("horseRaceOff")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Language Switcher - Always visible */}
              <div className="flex h-9 items-center gap-1 rounded-md border border-white/10 bg-black/25 p-1 shadow-inner shadow-black/20">
                <button
                  onClick={() => handleLanguageChange("en")}
                  className={`h-7 rounded px-2 text-xs font-medium transition-colors ${currentLocale === "en" ? "bg-blue-500 text-white shadow-sm shadow-blue-950/50" : "text-gray-400 hover:bg-white/10 hover:text-white"}`}
                >
                  EN
                </button>
                <button
                  onClick={() => handleLanguageChange("fi")}
                  className={`h-7 rounded px-2 text-xs font-medium transition-colors ${currentLocale === "fi" ? "bg-blue-500 text-white shadow-sm shadow-blue-950/50" : "text-gray-400 hover:bg-white/10 hover:text-white"}`}
                >
                  FI
                </button>
              </div>

              {/* Desktop-only buttons */}
              <div className="hidden items-center gap-2 md:flex">
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
                    <div className="absolute right-0 z-50 mt-2 w-36 overflow-hidden rounded-md border border-white/10 bg-gray-950/95 shadow-2xl shadow-black/40">
                      <div className="py-0">
                        {/* GitHub Link */}
                        <a
                          href="https://github.com/Koodattu/wow-guild-progress-tracker"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setIsContactDropdownOpen(false)}
                          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-200 transition-colors hover:bg-white/10 hover:text-white"
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
                          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-200 transition-colors hover:bg-indigo-500/15 hover:text-white"
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
                          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-200 transition-colors hover:bg-purple-500/15 hover:text-white"
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

                {/* Login with Discord Button or User Profile */}
                {isLoading ? (
                  <div className="hidden h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 text-sm text-gray-400 md:flex">
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : user ? (
                  <div className="relative" ref={userDropdownRef}>
                    <button
                      onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                      className="hidden h-9 cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 text-sm shadow-sm shadow-black/20 transition-colors hover:border-blue-400/35 hover:bg-white/[0.08] md:flex"
                      aria-label="User menu"
                    >
                      <img src={user.discord.avatarUrl} alt={user.discord.username} className="w-7 h-7 rounded-full" />
                      <span className="text-sm text-white font-medium pr-1">{user.discord.username}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`h-4 w-4 text-gray-400 transition-transform ${isUserDropdownOpen ? "rotate-180" : ""}`}
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

                    {/* User Dropdown Menu */}
                    {isUserDropdownOpen && (
                      <div className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-md border border-white/10 bg-gray-950/95 shadow-2xl shadow-black/40">
                        <div className="py-0">
                          <Link
                            href="/profile"
                            onClick={() => setIsUserDropdownOpen(false)}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-200 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                            {t("profile")}
                          </Link>
                          {user.isAdmin && (
                            <Link
                              href="/admin"
                              onClick={() => setIsUserDropdownOpen(false)}
                              className="flex items-center gap-2 px-3 py-2.5 text-sm text-amber-300 transition-colors hover:bg-amber-400/10 hover:text-amber-100"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path
                                  fillRule="evenodd"
                                  d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              {t("adminPanel")}
                            </Link>
                          )}
                          <button
                            onClick={() => {
                              setIsUserDropdownOpen(false);
                              logout();
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-300 transition-colors hover:bg-red-400/10 hover:text-red-100"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {t("logout")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={login}
                    className="hidden h-9 cursor-pointer items-center gap-2 rounded-md border border-indigo-300/30 bg-indigo-500/90 px-4 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:border-indigo-200/50 hover:bg-indigo-500 md:flex"
                    aria-label="Login with Discord"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                    {t("loginWithDiscord")}
                  </button>
                )}
              </div>

              {/* Mobile Hamburger Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-gray-300 shadow-sm shadow-black/20 transition-colors hover:border-blue-400/35 hover:bg-white/[0.08] hover:text-white lg:hidden"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />

          {/* Menu Panel */}
          <div
            ref={mobileMenuRef}
            className="fixed right-0 top-0 h-full w-[min(20rem,calc(100vw-2rem))] overflow-y-auto border-l border-white/10 bg-[#070b16] shadow-2xl shadow-black/60"
          >
            {/* Menu Header */}
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <Image src="/logo.png" alt="WoW Guild Progress" width={112} height={20} />
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Navigation Links */}
            <div className="space-y-1 px-3 py-3">
              {NAVIGATION_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className={getMobileNavLinkClass(isActive(link.href))}>
                  {t(link.labelKey)}
                </Link>
              ))}
            </div>

            {/* Divider */}
            <div className="my-2 border-t border-white/10"></div>

            {/* Action Buttons */}
            <div className="space-y-3 px-4 py-3">
              {/* Info Button */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsInfoDialogOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition-colors hover:border-emerald-300/40 hover:bg-emerald-400/15 hover:text-white"
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

              {/* Social Links */}
              <div className="grid grid-cols-3 gap-2">
                <a
                  href="https://github.com/Koodattu/wow-guild-progress-tracker"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-gray-200 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                </a>
                <a
                  href="https://discord.gg/BgQDncamHZ"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-md border border-indigo-300/20 bg-indigo-400/10 px-3 py-2.5 text-sm text-indigo-100 transition-colors hover:bg-indigo-400/20 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                </a>
                <a
                  href="https://www.twitch.tv/vaarattu"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-md border border-purple-300/20 bg-purple-400/10 px-3 py-2.5 text-sm text-purple-100 transition-colors hover:bg-purple-400/20 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                  </svg>
                </a>
              </div>

              {/* Login Button or User Profile (Mobile) */}
              {isLoading ? (
                <div className="flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : user ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
                    <img src={user.discord.avatarUrl} alt={user.discord.username} className="w-10 h-10 rounded-full" />
                    <span className="text-white font-medium">{user.discord.username}</span>
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                    {t("profile")}
                  </Link>
                  {user.isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex w-full items-center gap-2 rounded-md border border-amber-300/20 bg-amber-400/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-400/20 hover:text-white"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {t("adminPanel")}
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-red-300/20 bg-red-400/10 px-4 py-2.5 text-sm font-medium text-red-100 transition-colors hover:bg-red-400/20 hover:text-white"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {t("logout")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    login();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-indigo-300/30 bg-indigo-500/90 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-500"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  {t("loginWithDiscord")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info Dialog */}
      {isInfoDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsInfoDialogOpen(false)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-lg mx-4 border border-blue-500 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              <div className="shrink-0 text-3xl" aria-hidden="true">
                💙
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-3">{tInfo("title")}</h3>
                <p className="text-gray-300 mb-3">{tInfo("description")}</p>
                <p className="text-gray-300 mb-3">{tInfo("community")}</p>
                <p className="text-gray-300 mb-3">{tInfo("noMonetization")}</p>
                <p className="text-gray-300 mb-3">{tInfo("asIs")}</p>
                <p className="text-gray-300 mb-4">{tInfo("contact")}</p>
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
