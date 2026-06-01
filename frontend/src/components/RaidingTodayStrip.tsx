"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import GuildCrest from "@/components/GuildCrest";
import { useRaidingToday } from "@/lib/queries";
import { useSingleRowOverflow } from "@/lib/useSingleRowOverflow";
import { formatGuildName, getGuildProfileUrl } from "@/lib/utils";
import { RaidingTodayGuild } from "@/types";

const formatHour = (hour: number): string => {
  const totalMinutes = Math.round(hour * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
};

const getGuildKey = (guild: RaidingTodayGuild) =>
  [guild._id, guild.realm, guild.name, guild.parent_guild ?? "", guild.raidTime.day, guild.raidTime.startHour, guild.raidTime.endHour].join("-");

export default function RaidingTodayStrip() {
  const t = useTranslations("homePage");
  const { data, isLoading, error } = useRaidingToday();
  const guilds = data?.guilds ?? [];
  const [expanded, setExpanded] = useState(false);
  const guildKeys = useMemo(() => guilds.map(getGuildKey), [guilds]);
  const guildKeySignature = useMemo(() => guildKeys.join("|"), [guildKeys]);
  const overflowCounts = useMemo(() => Array.from({ length: guilds.length }, (_, index) => index + 1), [guilds.length]);
  const {
    containerRef: listRef,
    visibleCount,
    registerItem,
    registerOverflowIndicator,
  } = useSingleRowOverflow({
    itemKeys: guildKeys,
    enabled: !expanded && !isLoading,
    resetKey: data?.date,
  });

  useEffect(() => {
    setExpanded(false);
  }, [data?.date, guildKeySignature, guilds.length]);

  if (error || (!isLoading && guilds.length === 0)) {
    return null;
  }

  const visibleGuilds = expanded ? guilds : guilds.slice(0, visibleCount);
  const hiddenCount = expanded ? 0 : Math.max(0, guilds.length - visibleCount);

  return (
    <section className="mb-1 px-1 py-0.5" aria-label={t("raidingToday")}>
      <div className={`flex items-center gap-x-3 gap-y-1 ${expanded ? "flex-wrap" : "flex-nowrap"}`}>
        <div className="shrink-0 text-[11px] font-medium uppercase text-gray-500">{t("raidingToday")}:</div>

        <div ref={listRef} className={`relative flex min-w-0 items-center gap-x-3 gap-y-1 ${expanded ? "flex-wrap" : "flex-nowrap overflow-hidden"}`}>
          <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] top-0 flex">
            {overflowCounts.map((count) => (
              <button key={count} ref={registerOverflowIndicator(count)} type="button" tabIndex={-1} className="h-6 whitespace-nowrap text-xs font-medium text-gray-500">
                {t("raidingTodayMore", { count })}
              </button>
            ))}
          </div>

          {isLoading
            ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-5 w-28 shrink-0 animate-pulse rounded bg-gray-800/50" />)
            : visibleGuilds.map((guild) => {
                const raidStart = formatHour(guild.raidTime.startHour);
                const raidEnd = formatHour(guild.raidTime.endHour);
                const guildLabel = formatGuildName(guild.name, guild.realm, guild.parent_guild);
                const key = getGuildKey(guild);

                return (
                  <Link
                    key={key}
                    ref={registerItem(key)}
                    href={getGuildProfileUrl(guild.realm, guild.name)}
                    title={`${guildLabel} ${raidStart}-${raidEnd}`}
                    className="group inline-flex h-6 max-w-[220px] shrink-0 items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                  >
                    <span className="h-5 w-5 shrink-0">
                      <GuildCrest crest={guild.crest} faction={guild.faction} size={128} className="scale-[0.156] origin-top-left" drawFactionCircle={false} />
                    </span>
                    <span className="min-w-0 truncate font-medium text-gray-300 group-hover:text-white">{guild.name}</span>
                    <span className="shrink-0 text-gray-500 group-hover:text-gray-300">
                      {raidStart}-{raidEnd}
                    </span>
                  </Link>
                );
              })}

          {!isLoading && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="h-6 shrink-0 whitespace-nowrap text-xs font-medium text-gray-500 transition-colors hover:text-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              aria-expanded={expanded}
            >
              {t("raidingTodayMore", { count: hiddenCount })}
            </button>
          )}

          {!isLoading && expanded && guilds.length > visibleCount && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="h-6 shrink-0 whitespace-nowrap text-xs font-medium text-gray-500 transition-colors hover:text-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              aria-expanded={expanded}
            >
              {t("raidingTodayShowLess")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
