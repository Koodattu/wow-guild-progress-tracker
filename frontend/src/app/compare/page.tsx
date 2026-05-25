"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import IconImage from "@/components/IconImage";
import RaidSelector from "@/components/RaidSelector";
import { useRaidCompare, useRaids } from "@/lib/queries";
import { CompareGuildMetric, RaidCompare } from "@/types";

type ViewMode = "table" | "visual";

type MetricEntry = {
  guild: CompareGuildMetric;
  value: number;
};

type MetricOption = {
  id: string;
  label: string;
  subtitle?: string;
  entries: MetricEntry[];
  valueFormatter: (value: number) => string;
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

function getGuildColor(rank?: number): string {
  if (rank === 1) return "#facc15";
  if (rank === 2) return "#d1d5db";
  if (rank === 3) return "#fb923c";
  return "#60a5fa";
}

function MetricScatterChart({
  title,
  subtitle,
  entries,
  valueFormatter,
  emptyLabel,
  iconUrl,
  iconAlt,
}: {
  title: string;
  subtitle?: string;
  entries: MetricEntry[];
  valueFormatter: (value: number) => string;
  emptyLabel: string;
  iconUrl?: string;
  iconAlt?: string;
}) {
  const visibleEntries = entries.filter((entry) => Number.isFinite(entry.value) && entry.value > 0).sort((a, b) => a.value - b.value);
  const values = visibleEntries.map((entry) => entry.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const lanes = 5;
  const chartData = visibleEntries.map((entry, index) => ({
    ...entry,
    value: entry.value,
    lane: (index % lanes) + 1,
    guildName: entry.guild.name,
    realm: entry.guild.realm,
    guildRank: entry.guild.guildRank,
  }));

  return (
    <section className="bg-gray-900/60 border border-gray-800/70 rounded p-4">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {iconUrl && <IconImage iconFilename={iconUrl} alt={iconAlt ?? title} width={28} height={28} className="rounded" />}
            <h3 className="text-base font-bold text-white truncate">{title}</h3>
          </div>
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
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 18, bottom: 8, left: 4 }}>
              <CartesianGrid stroke="#374151" strokeDasharray="3 3" opacity={0.35} vertical={true} horizontal={false} />
              <XAxis
                type="number"
                dataKey="value"
                domain={[0, max]}
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                tickFormatter={(value) => valueFormatter(Number(value))}
                stroke="#4b5563"
              />
              <YAxis type="number" dataKey="lane" domain={[0, lanes + 1]} hide />
              <Tooltip
                cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload;
                  if (!active || !point) return null;

                  return (
                    <div className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-xs shadow-xl">
                      <div className="font-semibold text-white">
                        #{point.guildRank ?? "-"} {point.guildName}
                      </div>
                      <div className="text-gray-500">{point.realm}</div>
                      <div className="mt-1 text-blue-300">{valueFormatter(point.value)}</div>
                    </div>
                  );
                }}
              />
              <Scatter data={chartData}>
                {chartData.map((entry) => (
                  <Cell key={entry.guild.id} fill={getGuildColor(entry.guild.guildRank)} stroke="#0f172a" strokeWidth={1.5} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function MetricToggleChart({
  title,
  iconUrl,
  iconAlt,
  options,
  emptyLabel,
}: {
  title: string;
  iconUrl?: string;
  iconAlt?: string;
  options: MetricOption[];
  emptyLabel: string;
}) {
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");
  const selected = options.find((option) => option.id === selectedId) ?? options[0];

  if (!selected) return null;

  return (
    <div className="relative">
      <div className="absolute right-4 top-4 z-10 flex rounded bg-gray-950/80 border border-gray-800 p-1">
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => setSelectedId(option.id)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${selected.id === option.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <MetricScatterChart
        title={title}
        iconUrl={iconUrl}
        iconAlt={iconAlt}
        subtitle={selected.subtitle}
        entries={selected.entries}
        valueFormatter={selected.valueFormatter}
        emptyLabel={emptyLabel}
      />
    </div>
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
              <th key={boss.id} colSpan={2} className="border-l border-gray-800 px-2 py-2 text-center font-semibold" title={boss.name}>
                <span className="flex justify-center">
                  {boss.iconUrl ? (
                    <IconImage iconFilename={boss.iconUrl} alt={boss.name} width={28} height={28} className="rounded" />
                  ) : (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-gray-800 text-[10px] text-gray-400">{boss.name.slice(0, 2)}</span>
                  )}
                </span>
                <span className="sr-only">{boss.name}</span>
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
              <div className="space-y-4">
                <MetricScatterChart
                  title={t("worldRank")}
                  subtitle={t("lowerIsBetter")}
                  entries={sortedGuilds.map((guild) => ({ guild, value: guild.worldRank ?? 0 }))}
                  valueFormatter={(value) => `#${formatNumber(value)}`}
                  emptyLabel={t("noMetricData")}
                />
                <MetricToggleChart
                  title={t("totalEffort")}
                  options={[
                    {
                      id: "pulls",
                      label: t("pulls"),
                      subtitle: t("combatPullsSubtitle"),
                      entries: sortedGuilds.map((guild) => ({ guild, value: guild.totalPulls })),
                      valueFormatter: formatNumber,
                    },
                    {
                      id: "time",
                      label: t("time"),
                      subtitle: t("combatTimeSubtitle"),
                      entries: sortedGuilds.map((guild) => ({ guild, value: guild.totalTimeSpent })),
                      valueFormatter: formatTime,
                    },
                  ]}
                  emptyLabel={t("noMetricData")}
                />
              </div>

              <div className="space-y-4">
                {compare.raid.bosses.map((boss) => {
                  const killedEntries = sortedGuilds
                    .map((guild) => ({ guild, metric: bossMetric(guild, boss.id) }))
                    .filter(({ metric }) => (metric?.kills ?? 0) > 0);

                  return (
                    <MetricToggleChart
                      key={boss.id}
                      title={boss.name}
                      iconUrl={boss.iconUrl}
                      iconAlt={boss.name}
                      options={[
                        {
                          id: "pulls",
                          label: t("pulls"),
                          subtitle: t("killedGuildsOnly"),
                          entries: killedEntries.map(({ guild, metric }) => ({ guild, value: metric?.pulls ?? 0 })),
                          valueFormatter: formatNumber,
                        },
                        {
                          id: "time",
                          label: t("time"),
                          subtitle: t("killedGuildsOnly"),
                          entries: killedEntries.map(({ guild, metric }) => ({ guild, value: metric?.timeSpent ?? 0 })),
                          valueFormatter: formatTime,
                        },
                      ]}
                      emptyLabel={t("noBossKills")}
                    />
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
