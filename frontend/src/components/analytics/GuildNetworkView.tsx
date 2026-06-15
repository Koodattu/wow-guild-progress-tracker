"use client";

import { useMemo } from "react";
import { api } from "@/lib/api";
import { useGuildNetworkMeta } from "@/lib/queries";

function withVersion(url: string, etag?: string): string {
  if (!etag) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(etag)}`;
}

export default function GuildNetworkView() {
  const { data: meta } = useGuildNetworkMeta();

  const iframeSrc = useMemo(() => {
    const universeUrl = withVersion(api.getGuildNetworkUniverseUrl(), meta?.etag);
    return `/guild-network-poc/index.html?universe=${encodeURIComponent(universeUrl)}`;
  }, [meta?.etag]);

  return (
    <div className="h-[calc(100vh-5rem)] min-h-[640px] w-full overflow-hidden bg-[#050711]">
      <iframe
        key={meta?.etag || "latest"}
        src={iframeSrc}
        title="Raider Network"
        className="block h-full w-full border-0"
        loading="eager"
        referrerPolicy="same-origin"
      />
    </div>
  );
}
