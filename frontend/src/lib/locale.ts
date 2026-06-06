"use client";

export const LOCALE_CHANGE_EVENT = "locale-change";

export type Locale = "en" | "fi";

function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "fi";
}

export function setLocale(locale: Locale) {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`;
  window.dispatchEvent(new CustomEvent<Locale>(LOCALE_CHANGE_EVENT, { detail: locale }));
}

export function getLocale(): Locale {
  if (typeof document === "undefined") return "en";

  const match = document.cookie.match(/NEXT_LOCALE=([^;]+)/);
  return isLocale(match?.[1]) ? match[1] : "en";
}
