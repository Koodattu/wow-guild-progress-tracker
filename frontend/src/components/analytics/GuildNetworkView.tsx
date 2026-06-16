"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useGuildNetworkMeta } from "@/lib/queries";

function withVersion(url: string, etag?: string): string {
  if (!etag) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(etag)}`;
}

function getUniverseUrl(etag?: string): string {
  const sameOriginPath = "/api/guild-network/universe";
  const configuredUrl = api.getGuildNetworkUniverseUrl();

  if (typeof window === "undefined") {
    return withVersion(sameOriginPath, etag);
  }

  try {
    const parsed = new URL(configuredUrl, window.location.origin);
    const currentHostIsLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const configuredHostIsLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

    if (parsed.origin === window.location.origin || (configuredHostIsLocal && !currentHostIsLocal)) {
      return withVersion(sameOriginPath, etag);
    }
  } catch {
    return withVersion(sameOriginPath, etag);
  }

  return withVersion(configuredUrl, etag);
}

function injectUniverseUrl(html: string, universeUrl: string): string {
  return html.replace(
    'const universeUrl = params.get("universe") || "/api/guild-network/universe";',
    `const universeUrl = ${JSON.stringify(universeUrl)};`,
  );
}

export default function GuildNetworkView() {
  const { data: meta } = useGuildNetworkMeta();
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const universeUrl = useMemo(() => {
    return getUniverseUrl(meta?.etag);
  }, [meta?.etag]);

  useEffect(() => {
    let active = true;

    fetch("/guild-network-poc/index.html", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load network shell (${response.status})`);
        return response.text();
      })
      .then((html) => {
        if (!active) return;
        setSrcDoc(injectUniverseUrl(html, universeUrl));
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load network shell");
      });

    return () => {
      active = false;
    };
  }, [universeUrl]);

  return (
    <div className="h-[calc(100vh-5rem)] min-h-[640px] w-full overflow-hidden bg-[#050711]">
      {error ? (
        <div className="grid h-full place-items-center px-4 text-sm font-semibold text-red-200">{error}</div>
      ) : srcDoc ? (
        <iframe key={meta?.etag || "latest"} srcDoc={srcDoc} title="Raider Network" className="block h-full w-full border-0" loading="eager" />
      ) : (
        <div className="grid h-full place-items-center px-4 text-sm font-semibold text-slate-300">Loading raider network…</div>
      )}
    </div>
  );
}
