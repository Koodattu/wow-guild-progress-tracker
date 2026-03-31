"use client";

import { Event } from "@/types";
import { formatPhaseDisplay, getGuildProfileUrl } from "@/lib/utils";
import Link from "next/link";
import GuildCrest from "@/components/GuildCrest";
import IconImage from "@/components/IconImage";

// Inline guild name with optional crest, linked to guild profile
function GuildName({ event }: { event: Event }) {
  const inner = (
    <span className="inline-flex items-center gap-1 align-middle">
      <span className="w-5 h-5 shrink-0 inline-block">
        <GuildCrest crest={event.guildCrest} size={128} className="scale-[0.156] origin-top-left" drawFactionCircle={false} />
      </span>
      <span className="font-semibold">{event.guildName}</span>
    </span>
  );

  if (event.guildRealm) {
    return (
      <Link href={getGuildProfileUrl(event.guildRealm, event.guildName)} className="hover:text-blue-400 transition-colors">
        {inner}
      </Link>
    );
  }

  return inner;
}

// Inline boss name with optional icon
function BossName({ event }: { event: Event }) {
  if (!event.bossName) return null;
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {event.bossIconUrl && <IconImage iconFilename={event.bossIconUrl} alt={event.bossName} width={18} height={18} className="inline-block rounded shrink-0" />}
      <span className="font-semibold">{event.bossName}</span>
    </span>
  );
}

// "Watch Live" link that opens the livestreams page with this guild's live streamers pre-selected
function WatchLive({ event }: { event: Event }) {
  if (!event.liveStreamers || event.liveStreamers.length === 0) return null;
  const streamsParam = event.liveStreamers.join(",");
  return (
    <>
      {" "}
      <Link
        href={`/livestreams?streams=${encodeURIComponent(streamsParam)}`}
        className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors font-semibold align-middle"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
        Watch Live
      </Link>
    </>
  );
}

// Render event message as JSX with inline guild crest and boss icons
export default function EventMessage({ event, showDifficulty = false }: { event: Event; showDifficulty?: boolean }) {
  const { type, data, difficulty } = event;
  const diffSuffix = showDifficulty ? ` (${difficulty})` : "";

  if (type === "boss_kill") {
    const pulls = data.pullCount || 0;
    return (
      <span>
        <GuildName event={event} /> defeated <BossName event={event} />
        {diffSuffix} after {pulls} pull{pulls !== 1 ? "s" : ""}!<WatchLive event={event} />
      </span>
    );
  }

  if (type === "best_pull") {
    const progressText = data.progressDisplay ? formatPhaseDisplay(data.progressDisplay) : `${(data.bestPercent || 0).toFixed(1)}%`;
    return (
      <span>
        <GuildName event={event} /> reached {progressText} on <BossName event={event} />
        {diffSuffix}!<WatchLive event={event} />
      </span>
    );
  }

  if (type === "hiatus") {
    const days = data.hiatusDays || 7;
    const daysText = days >= 30 ? "over a month" : `${days} days`;
    return (
      <span>
        <GuildName event={event} /> has not raided for {daysText}.
      </span>
    );
  }

  if (type === "regress") {
    if (event.bossName) {
      const percent = data.bestPercent || 0;
      return (
        <span>
          <GuildName event={event} /> failed to improve on <BossName event={event} />
          {diffSuffix} ({percent.toFixed(1)}%) during their raid.
          <WatchLive event={event} />
        </span>
      );
    }
    return (
      <span>
        <GuildName event={event} /> had no progress during their raid.
        <WatchLive event={event} />
      </span>
    );
  }

  if (type === "reproge") {
    const pulls = data.pullCount || 0;
    return (
      <span>
        <GuildName event={event} /> re-killed <BossName event={event} />
        {diffSuffix} after {pulls} pull{pulls !== 1 ? "s" : ""}!<WatchLive event={event} />
      </span>
    );
  }

  return (
    <span>
      <GuildName event={event} /> - <BossName event={event} />
      <WatchLive event={event} />
    </span>
  );
}
