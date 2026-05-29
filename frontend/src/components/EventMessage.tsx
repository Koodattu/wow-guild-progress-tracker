"use client";

import { Event } from "@/types";
import { formatPhaseDisplay, formatTime, getDifficultyColor, getGuildProfileUrl } from "@/lib/utils";
import { useBosses } from "@/lib/queries";
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
  const shouldResolveBossIcon = !event.bossIconUrl && !!event.bossName;
  const { data: bosses = [] } = useBosses(shouldResolveBossIcon ? event.raidId : null);

  if (!event.bossName) return null;

  const bossIconUrl = event.bossIconUrl ?? (bosses.find((boss) => boss.id === event.bossId) ?? bosses.find((boss) => boss.name === event.bossName))?.iconUrl;

  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {bossIconUrl && <IconImage iconFilename={bossIconUrl} alt={event.bossName} width={18} height={18} className="inline-block rounded shrink-0" />}
      <span className="font-semibold">{event.bossName}</span>
    </span>
  );
}

function DifficultyWord({ difficulty }: { difficulty: Event["difficulty"] }) {
  return <span className={`${getDifficultyColor(difficulty)} font-semibold lowercase`}>{difficulty}</span>;
}

// "Watch" link - exported for use in card layouts, renders nothing if no live streamers
export function WatchButton({ event }: { event: Event }) {
  if (!event.liveStreamers || event.liveStreamers.length === 0) return null;
  const streamsParam = event.liveStreamers.join(",");
  return (
    <Link
      href={`/livestreams?streams=${encodeURIComponent(streamsParam)}`}
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-red-400 hover:text-red-300 transition-colors font-semibold text-xs"
    >
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
      Watch Live
    </Link>
  );
}

// Render event message as JSX with inline guild crest and boss icons
export default function EventMessage({ event }: { event: Event; showDifficulty?: boolean }) {
  const { type, data, difficulty } = event;

  if (type === "boss_kill") {
    const pulls = data.pullCount || 0;
    const timeSpent = data.timeSpent || 0;
    return (
      <span>
        <GuildName event={event} /> defeated <DifficultyWord difficulty={difficulty} /> <BossName event={event} /> after {pulls} pull{pulls !== 1 ? "s" : ""}
        {timeSpent > 0 && <> over {formatTime(timeSpent)}</>}!
      </span>
    );
  }

  if (type === "best_pull") {
    const progressText = data.progressDisplay ? formatPhaseDisplay(data.progressDisplay) : `${(data.bestPercent || 0).toFixed(1)}%`;
    const pulls = data.pullCount || 0;
    return (
      <span>
        <GuildName event={event} /> reached {progressText} on <DifficultyWord difficulty={difficulty} /> <BossName event={event} />
        {pulls > 0 && <> on pull {pulls}</>}!
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
          <GuildName event={event} /> failed to improve on <DifficultyWord difficulty={difficulty} /> <BossName event={event} /> ({percent.toFixed(1)}%) during their raid.
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
        <GuildName event={event} /> re-killed <DifficultyWord difficulty={difficulty} /> <BossName event={event} /> after {pulls} pull{pulls !== 1 ? "s" : ""}!
      </span>
    );
  }

  return (
    <span>
      <GuildName event={event} /> - <DifficultyWord difficulty={difficulty} /> <BossName event={event} />
    </span>
  );
}
