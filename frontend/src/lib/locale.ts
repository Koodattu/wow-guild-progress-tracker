"use client";

export function setLocale(locale: "en" | "fi") {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`;
  window.location.reload();
}

export function getLocale(): "en" | "fi" {
  if (typeof document === "undefined") return "en";

  const match = document.cookie.match(/NEXT_LOCALE=([^;]+)/);
  return (match?.[1] as "en" | "fi") || "en";
}
