"use client";

import { Event } from "@/types";
import { formatPhaseDisplay } from "@/lib/utils";
import { ReactNode } from "react";
import GuildCrest from "@/components/GuildCrest";
import IconImage from "@/components/IconImage";

// Inline guild name with optional crest
function GuildName({ event }: { event: Event }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {event.guildCrest && <GuildCrest crest={event.guildCrest} size={18} className="inline-block shrink-0" drawFactionCircle={false} />}
      <span className="font-semibold">{event.guildName}</span>
    </span>
  );
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

// Render event message as JSX with inline guild crest and boss icons
export default function EventMessage({ event, showDifficulty = false }: { event: Event; showDifficulty?: boolean }) {
  const { type, data, difficulty } = event;
  const diffSuffix = showDifficulty ? ` (${difficulty})` : "";

  if (type === "boss_kill") {
    const pulls = data.pullCount || 0;
    return (
      <span>
        <GuildName event={event} /> defeated <BossName event={event} />{diffSuffix} after {pulls} pull{pulls !== 1 ? "s" : ""}!
      </span>
    );
  }

  if (type === "best_pull") {
    const progressText = data.progressDisplay ? formatPhaseDisplay(data.progressDisplay) : `${(data.bestPercent || 0).toFixed(1)}%`;
    return (
      <span>
        <GuildName event={event} /> reached {progressText} on <BossName event={event} />{diffSuffix}!
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
          <GuildName event={event} /> failed to improve on <BossName event={event} />{diffSuffix} ({percent.toFixed(1)}%) during their raid.
        </span>
      );
    }
    return (
      <span>
        <GuildName event={event} /> had no progress during their raid.
      </span>
    );
  }

  if (type === "reproge") {
    const pulls = data.pullCount || 0;
    return (
      <span>
        <GuildName event={event} /> re-killed <BossName event={event} />{diffSuffix} after {pulls} pull{pulls !== 1 ? "s" : ""}!
      </span>
    );
  }

  return (
    <span>
      <GuildName event={event} /> - <BossName event={event} />
    </span>
  );
}
