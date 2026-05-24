"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import IconImage from "@/components/IconImage";
import RaidSelector from "@/components/RaidSelector";
import { useRaidCompare, useRaids } from "@/lib/queries";
import { CompareGuildMetric, RaidCompare } from "@/types";

type ViewMode = "table" | "visual";

type MetricEntry = {
  guild: CompareGuildMetric;
  value: number;
  muted?: boolean;
};

function formatTime(seconds: number): string {
  if (!seconds) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatNumber(value?: number): string {
  if (!value) return "-";
  return value.toLocaleString("en-US");
}

function guildHref(guild: CompareGuildMetric): string {
  return `/guilds/${encodeURIComponent(guild.realm)}/${encodeURIComponent(guild.name)}`;
}

function bossMetric(guild: CompareGuildMetric, bossId: number) {
  return guild.bosses.find((boss) => boss.bossId === bossId);
}

function MetricCompareCard({
  title,
  subtitle,
  entries,
  valueFormatter,
  emptyLabel,
}: {
  title: string;
  subtitle?: string;
  entries: MetricEntry[];
  valueFormatter: (value: number) => string;
  emptyLabel: string;
}) {
  const visibleEntries = entries.filter((entry) => Number.isFinite(entry.value) && entry.value > 0);
  const values = visibleEntries.map((entry) => entry.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const range = max - min;

  return (
    <section className="bg-gray-900/60 border border-gray-800/70 rounded p-4">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-4">
        <div>
          <h3 className="text-base font-bold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        {visibleEntries.length > 0 && (
          <div className="text-xs text-gray-500">
            {valueFormatter(min)} to {valueFormatter(max)}
          </div>
        )}
      </div>

      {visibleEntries.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">{emptyLabel}</div>
      ) : (
        <div className="space-y-3">
          {visibleEntries.map((entry) => {
            const position = range === 0 ? 50 : ((entry.value - min) / range) * 100;

            return (
              <div key={`${entry.guild.id}-${title}`} className={entry.muted ? "opacity-60" : ""}>
                <div className="grid gap-2 sm:grid-cols-[190px_1fr_96px] sm:items-center">
                  <Link href={guildHref(entry.guild)} className="min-w-0 text-sm font-medium text-gray-200 hover:text-blue-300 transition-colors truncate">
                    <span className="text-gray-500 mr-2">#{entry.guild.guildRank ?? "-"}</span>
                    {entry.guild.name}
                  </Link>
                  <div className="relative h-7">
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-700" />
                    <div className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400 shadow-[0_0_0_4px_rgba(96,165,250,0.12)]" style={{ left: `${position}%` }} />
                  </div>
                  <div className="text-sm tabular-nums text-gray-300 sm:text-right">{valueFormatter(entry.value)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CompareTable({ compare, t }: { compare: RaidCompare; t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="overflow-x-auto border border-gray-800 rounded bg-gray-950/40">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-900 text-xs uppercase text-gray-400">
            <th className="sticky left-0 z-20 bg-gray-900 px-3 py-3 text-left font-semibold">{t("guild")}</th>
            <th className="px-3 py-3 text-right font-semibold">{t("rank")}</th>
            <th className="px-3 py-3 text-right font-semibold">{t("worldRank")}</th>
            <th className="px-3 py-3 text-right font-semibold">{t("totalPulls")}</th>
            <th className="px-3 py-3 text-right font-semibold">{t("combatTime")}</th>
            {compare.raid.bosses.map((boss) => (
              <th key={boss.id} colSpan={2} className="border-l border-gray-800 px-3 py-3 text-center font-semibold">
                <span className="whitespace-nowrap">{boss.name}</span>
              </th>
            ))}
          </tr>
          <tr className="bg-gray-900/80 text-[11px] uppercase text-gray-500">
            <th className="sticky left-0 z-20 bg-gray-900/80 px-3 py-2" />
            <th className="px-3 py-2" />
            <th className="px-3 py-2" />
            <th className="px-3 py-2" />
            <th className="px-3 py-2" />
            {compare.raid.bosses.map((boss) => (
              <Fragment key={boss.id}>
                <th key={`${boss.id}-pulls`} className="border-l border-gray-800 px-3 py-2 text-right font-medium">
                  {t("pulls")}
                </th>
                <th key={`${boss.id}-time`} className="px-3 py-2 text-right font-medium">
                  {t("time")}
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {compare.guilds.map((guild) => (
            <tr key={guild.id} className="border-t border-gray-800/80 hover:bg-gray-900/50">
              <td className="sticky left-0 z-10 bg-gray-950 px-3 py-3">
                <Link href={guildHref(guild)} className="font-medium text-white hover:text-blue-300 transition-colors">
                  {guild.name}
                </Link>
                <div className="text-xs text-gray-500">{guild.realm}</div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-gray-300">#{guild.guildRank ?? "-"}</td>
              <td className="px-3 py-3 text-right tabular-nums text-gray-300">{guild.worldRank ? `#${formatNumber(guild.worldRank)}` : "-"}</td>
              <td className="px-3 py-3 text-right tabular-nums text-gray-300">{formatNumber(guild.totalPulls)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-gray-300">{formatTime(guild.totalTimeSpent)}</td>
              {compare.raid.bosses.map((boss) => {
                const metric = bossMetric(guild, boss.id);
                const killed = (metric?.kills ?? 0) > 0;

                return (
                  <Fragment key={`${guild.id}-${boss.id}`}>
                    <td key={`${guild.id}-${boss.id}-pulls`} className={`border-l border-gray-800 px-3 py-3 text-right tabular-nums ${killed ? "text-gray-200" : "text-gray-500"}`}>
                      {metric?.pulls ? formatNumber(metric.pulls) : "-"}
                    </td>
                    <td key={`${guild.id}-${boss.id}-time`} className={`px-3 py-3 text-right tabular-nums ${killed ? "text-gray-200" : "text-gray-500"}`}>
                      {metric?.timeSpent ? formatTime(metric.timeSpent) : "-"}
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ComparePage() {
  const t = useTranslations("comparePage");
  const [selectedRaidId, setSelectedRaidId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("visual");
  const { data: raids = [], isLoading: raidsLoading } = useRaids();
  const { data: compare, isLoading: compareLoading, error } = useRaidCompare(selectedRaidId);

  useEffect(() => {
    if (selectedRaidId === null && raids.length > 0) {
      setSelectedRaidId(raids[0].id);
    }
  }, [raids, selectedRaidId]);

  const sortedGuilds = useMemo(() => {
    return [...(compare?.guilds ?? [])].sort((a, b) => (a.guildRank ?? 99999) - (b.guildRank ?? 99999));
  }, [compare?.guilds]);

  const loading = raidsLoading || (selectedRaidId !== null && compareLoading);

  return (
    <div className="w-full px-4 md:px-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-bold text-white">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex rounded bg-gray-900 border border-gray-800 p-1">
            <button
              onClick={() => setViewMode("visual")}
              className={`px-3 py-2 text-sm rounded transition-colors ${viewMode === "visual" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              {t("visual")}
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-2 text-sm rounded transition-colors ${viewMode === "table" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
            >
              {t("table")}
            </button>
          </div>
          <RaidSelector raids={raids} selectedRaidId={selectedRaidId} onRaidSelect={setSelectedRaidId} />
        </div>
      </div>

      {loading && <div className="flex min-h-64 items-center justify-center text-gray-500">{t("loading")}</div>}

      {!loading && error && <div className="rounded border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{t("error")}</div>}

      {!loading && compare && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            {compare.raid.iconUrl && <IconImage iconFilename={compare.raid.iconUrl} alt={compare.raid.name} width={32} height={32} className="rounded" />}
            <span className="font-medium text-gray-300">{compare.raid.name}</span>
            <span>{t("mythicOnly")}</span>
            <span>{t("guildCount", { count: compare.guilds.length })}</span>
          </div>

          {compare.guilds.length === 0 ? (
            <div className="rounded border border-gray-800 bg-gray-900/50 py-12 text-center text-gray-500">{t("noGuilds")}</div>
          ) : viewMode === "table" ? (
            <CompareTable compare={compare} t={t} />
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-3">
                <MetricCompareCard
                  title={t("worldRank")}
                  subtitle={t("lowerIsBetter")}
                  entries={sortedGuilds.map((guild) => ({ guild, value: guild.worldRank ?? 0 }))}
                  valueFormatter={(value) => `#${formatNumber(value)}`}
                  emptyLabel={t("noMetricData")}
                />
                <MetricCompareCard
                  title={t("totalPulls")}
                  subtitle={t("combatPullsSubtitle")}
                  entries={sortedGuilds.map((guild) => ({ guild, value: guild.totalPulls }))}
                  valueFormatter={formatNumber}
                  emptyLabel={t("noMetricData")}
                />
                <MetricCompareCard
                  title={t("combatTime")}
                  subtitle={t("combatTimeSubtitle")}
                  entries={sortedGuilds.map((guild) => ({ guild, value: guild.totalTimeSpent }))}
                  valueFormatter={formatTime}
                  emptyLabel={t("noMetricData")}
                />
              </div>

              <div className="space-y-4">
                {compare.raid.bosses.map((boss) => {
                  const killedEntries = sortedGuilds
                    .map((guild) => ({ guild, metric: bossMetric(guild, boss.id) }))
                    .filter(({ metric }) => (metric?.kills ?? 0) > 0);

                  return (
                    <section key={boss.id} className="space-y-3">
                      <div className="flex items-center gap-3">
                        {boss.iconUrl && <IconImage iconFilename={boss.iconUrl} alt={boss.name} width={28} height={28} className="rounded" />}
                        <h2 className="text-lg font-bold text-white">{boss.name}</h2>
                      </div>
                      <div className="grid gap-4 xl:grid-cols-2">
                        <MetricCompareCard
                          title={t("bossPulls")}
                          subtitle={t("killedGuildsOnly")}
                          entries={killedEntries.map(({ guild, metric }) => ({ guild, value: metric?.pulls ?? 0 }))}
                          valueFormatter={formatNumber}
                          emptyLabel={t("noBossKills")}
                        />
                        <MetricCompareCard
                          title={t("bossTime")}
                          subtitle={t("killedGuildsOnly")}
                          entries={killedEntries.map(({ guild, metric }) => ({ guild, value: metric?.timeSpent ?? 0 }))}
                          valueFormatter={formatTime}
                          emptyLabel={t("noBossKills")}
                        />
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
