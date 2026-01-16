"use client";

import { useEffect, useState, useCallback } from "react";
import { RaidAnalytics, RaidInfo, Boss, GuildDistributionEntry } from "@/types";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import RaidSelector from "@/components/RaidSelector";
import IconImage from "@/components/IconImage";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

// Format seconds to hours and minutes
function formatTime(seconds: number): string {
  if (seconds === 0) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

// Format date for display
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Compact inline stat - single line with label, average (large), min (small green), max (small amber)
function CompactStat({ label, average, min, max, formatValue }: { label: string; average: number; min: number; max: number; formatValue: (val: number) => string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-gray-500 min-w-[100px]">{label}</span>
      <span className="text-2xl font-bold text-white">{formatValue(average)}</span>
      <span className="text-xs text-gray-600">•</span>
      <span className="text-sm text-green-400">{formatValue(min)}</span>
      <span className="text-xs text-gray-600">to</span>
      <span className="text-sm text-amber-400">{formatValue(max)}</span>
    </div>
  );
}

// Distribution chart - bar chart showing guild count in buckets
function DistributionChart({
  data,
  title,
  valueKey,
  bucketSize,
  formatLabel,
}: {
  data: GuildDistributionEntry[];
  title: string;
  valueKey: "pullCount" | "timeSpent";
  bucketSize: number;
  formatLabel: (val: number) => string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-800/30 rounded border border-gray-800/50 p-3">
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">{title}</div>
        <div className="text-xs text-gray-600">No data</div>
      </div>
    );
  }

  // Find min and max values
  const values = data.map((guild) => guild[valueKey]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue;

  // Calculate optimal bucket size for max 5 buckets
  const maxBuckets = 5;
  const optimalBucketSize = range > 0 ? Math.ceil(range / maxBuckets) : 1;

  // Round bucket size to a nice number
  const niceNumbers = [1, 2, 5, 10, 15, 20, 25, 30, 50, 100, 200, 300, 500, 1000, 1800, 3600];
  const finalBucketSize = niceNumbers.find((n) => n >= optimalBucketSize) || optimalBucketSize;

  // Create buckets starting from min value
  const buckets: { [key: number]: GuildDistributionEntry[] } = {};
  data.forEach((guild) => {
    const value = guild[valueKey];
    const bucketKey = Math.floor((value - minValue) / finalBucketSize) * finalBucketSize + minValue;
    if (!buckets[bucketKey]) {
      buckets[bucketKey] = [];
    }
    buckets[bucketKey].push(guild);
  });

  // Convert to array and sort
  const chartData = Object.keys(buckets)
    .map((key) => {
      const bucketStart = parseInt(key);
      const bucketEnd = bucketStart + finalBucketSize - 1;
      return {
        bucket: bucketStart,
        count: buckets[parseInt(key)].length,
        label: valueKey === "timeSpent" ? formatTime(bucketStart) : `${bucketStart}-${bucketEnd}`,
        guilds: buckets[parseInt(key)],
      };
    })
    .sort((a, b) => a.bucket - b.bucket);

  // Generate gradient colors
  const getColor = (index: number, total: number) => {
    const hue = 200 + (index / total) * 60; // Blue to cyan
    return `hsl(${hue}, 70%, 50%)`;
  };

  return (
    <div className="bg-gray-800/30 rounded border border-gray-800/50 p-3">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">{title}</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 10 }} />
          <YAxis tick={{ fill: "#9CA3AF", fontSize: 10 }} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs max-w-xs">
                    <div className="text-white font-bold mb-1">{data.label}</div>
                    <div className="text-blue-400 mb-1">{data.count} guilds</div>
                    {data.guilds && data.guilds.length > 0 && (
                      <div className="text-gray-400 text-[10px] max-h-32 overflow-y-auto">
                        {data.guilds.map((guild: GuildDistributionEntry, idx: number) => (
                          <div key={idx} className="truncate">
                            {guild.name}-{guild.realm}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(index, chartData.length)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Compact progression chart using Recharts
function ProgressionChart({
  data,
  valueKey,
  raidStart,
  raidEnd,
  label,
}: {
  data: { date: string; killCount?: number; clearCount?: number }[];
  valueKey: "killCount" | "clearCount";
  raidStart?: string;
  raidEnd?: string;
  label: string;
}) {
  if (!data || data.length === 0 || !raidStart) {
    return (
      <div className="bg-gray-800/30 rounded border border-gray-800/50 p-3">
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">{label}</div>
        <div className="text-xs text-gray-600">No data available</div>
      </div>
    );
  }

  // Calculate weekly buckets
  const startDate = new Date(raidStart);
  const endDate = raidEnd ? new Date(raidEnd) : new Date();
  const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
  const totalWeeks = Math.ceil((endDate.getTime() - startDate.getTime()) / millisecondsPerWeek);

  const weeklyData: { weekNumber: number; value: number; label: string }[] = [];

  for (let week = 1; week <= totalWeeks; week++) {
    const weekStart = new Date(startDate.getTime() + (week - 1) * millisecondsPerWeek);
    const weekEnd = new Date(Math.min(weekStart.getTime() + millisecondsPerWeek, endDate.getTime()));

    let weekValue = 0;
    for (const entry of data) {
      const entryDate = new Date(entry.date);
      if (entryDate >= weekStart && entryDate < weekEnd) {
        const value = valueKey === "killCount" ? entry.killCount || 0 : entry.clearCount || 0;
        weekValue = Math.max(weekValue, value);
      }
    }

    if (weekValue === 0 && week > 1) {
      weekValue = weeklyData[week - 2].value;
    }

    weeklyData.push({
      weekNumber: week,
      value: weekValue,
      label: `W${week}`,
    });
  }

  // Generate gradient colors
  const getColor = (index: number, total: number) => {
    const hue = 200 + (index / total) * 60; // Blue to cyan
    return `hsl(${hue}, 70%, 50%)`;
  };

  return (
    <div className="bg-gray-800/30 rounded border border-gray-800/50 p-3">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">{label}</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={weeklyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 10 }} />
          <YAxis tick={{ fill: "#9CA3AF", fontSize: 10 }} />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs">
                    <div className="text-white font-bold">Week {data.weekNumber}</div>
                    <div className="text-blue-400">{data.value} guilds</div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {weeklyData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(index, weeklyData.length)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Stats section with 3 charts in a single row
function StatsSection({
  pullStats,
  timeStats,
  progression,
  progressionLabel,
  progressionKey,
  raidStart,
  raidEnd,
  guildDistribution,
}: {
  pullStats: {
    average: number;
    lowest: number;
    highest: number;
  };
  timeStats: {
    average: number;
    lowest: number;
    highest: number;
  };
  progression?: { date: string; killCount?: number; clearCount?: number }[];
  progressionLabel: string;
  progressionKey: "killCount" | "clearCount";
  raidStart?: string;
  raidEnd?: string;
  guildDistribution?: GuildDistributionEntry[];
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Pull Distribution Chart */}
      {guildDistribution && guildDistribution.length > 0 && (
        <DistributionChart data={guildDistribution} title="Pull Distribution" valueKey="pullCount" bucketSize={10} formatLabel={(val) => `${val}-${val + 9}`} />
      )}

      {/* Time Distribution Chart */}
      {guildDistribution && guildDistribution.length > 0 && (
        <DistributionChart data={guildDistribution} title="Time Distribution" valueKey="timeSpent" bucketSize={1800} formatLabel={(val) => formatTime(val)} />
      )}

      {/* Progression Chart */}
      {progression && <ProgressionChart data={progression} valueKey={progressionKey} raidStart={raidStart} raidEnd={raidEnd} label={progressionLabel} />}
    </div>
  );
}

export default function RaidAnalyticsPage() {
  const t = useTranslations("raidAnalyticsPage");
  const [analytics, setAnalytics] = useState<RaidAnalytics | null>(null);
  const [allAnalytics, setAllAnalytics] = useState<RaidAnalytics[] | null>(null);
  const [raids, setRaids] = useState<RaidInfo[]>([]);
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [selectedRaidId, setSelectedRaidId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load - fetch raids
  useEffect(() => {
    const fetchRaids = async () => {
      try {
        const raidsData = await api.getRaids();
        setRaids(raidsData);
        setSelectedRaidId(null);
      } catch (err) {
        setError("Failed to load raids");
        console.error("Failed to fetch raids:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchRaids();
  }, []);

  // Fetch analytics when raid selection changes
  const fetchAnalytics = useCallback(
    async (raidId: number | null) => {
      try {
        setDataLoading(true);
        setError(null);

        if (raidId === null) {
          const allAnalyticsData = await api.getAllRaidAnalytics();
          setAllAnalytics(allAnalyticsData);
          setAnalytics(null);
          setBosses([]);
        } else {
          const [analyticsData, bossesData] = await Promise.all([api.getRaidAnalytics(raidId), api.getBosses(raidId)]);
          setAnalytics(analyticsData);
          setAllAnalytics(null);
          setBosses(bossesData);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("No analytics")) {
          setError(t("noAnalyticsAvailable"));
        } else {
          setError(t("failedToLoad"));
        }
        setAnalytics(null);
        setAllAnalytics(null);
        console.error("Failed to fetch raid analytics:", err);
      } finally {
        setDataLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (selectedRaidId !== undefined) {
      fetchAnalytics(selectedRaidId);
    }
  }, [selectedRaidId, fetchAnalytics]);

  const handleRaidSelect = (raidId: number | null) => {
    setSelectedRaidId(raidId);
  };

  const getBossIconUrl = (bossName: string): string | undefined => {
    const boss = bosses.find((b) => b.name === bossName);
    return boss?.iconUrl;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-gray-400">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 md:px-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">{t("title")}</h1>
          <p className="text-gray-500 text-sm">{t("subtitle")}</p>
        </div>
        <RaidSelector raids={raids} selectedRaidId={selectedRaidId} onRaidSelect={handleRaidSelect} showOverall={true} />
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded px-3 py-2 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {dataLoading && (
        <div className="flex justify-center items-center min-h-64">
          <div className="text-gray-500">{t("loadingAnalytics")}</div>
        </div>
      )}

      {/* Single raid analytics */}
      {!dataLoading && analytics && (
        <div className="space-y-4">
          {/* Meta info - inline */}
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <span>
              {t("lastCalculated")}: {formatDate(analytics.lastCalculated)}
            </span>
            {analytics.raidStart && (
              <>
                <span>•</span>
                <span>
                  {formatDate(analytics.raidStart)}
                  {analytics.raidEnd ? ` - ${formatDate(analytics.raidEnd)}` : ` - ${t("ongoing")}`}
                </span>
              </>
            )}
          </div>

          {/* Overall stats section with summary */}
          <div className="bg-gray-900/60 rounded border border-gray-800/50 p-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wide mb-3">{t("overallStatistics")}</h2>

            {/* Summary stats - single row with 4 equal columns */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">Cleared</span>
                <span className="text-2xl font-bold text-green-400">{analytics.overall.guildsCleared}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">Progressing</span>
                <span className="text-2xl font-bold text-yellow-400">{analytics.overall.guildsProgressing}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">Pull Count</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-white">{analytics.overall.pullCount.average || "-"}</span>
                  <span className="text-xs text-gray-600">avg</span>
                </div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xs text-green-400">{analytics.overall.pullCount.lowest}</span>
                  <span className="text-xs text-gray-700">-</span>
                  <span className="text-xs text-amber-400">{analytics.overall.pullCount.highest}</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">Time Spent</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-white">{formatTime(analytics.overall.timeSpent.average)}</span>
                  <span className="text-xs text-gray-600">avg</span>
                </div>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xs text-green-400">{formatTime(analytics.overall.timeSpent.lowest)}</span>
                  <span className="text-xs text-gray-700">-</span>
                  <span className="text-xs text-amber-400">{formatTime(analytics.overall.timeSpent.highest)}</span>
                </div>
              </div>
            </div>

            <StatsSection
              pullStats={analytics.overall.pullCount}
              timeStats={analytics.overall.timeSpent}
              progression={analytics.overall.clearProgression}
              progressionLabel={t("clearProgression")}
              progressionKey="clearCount"
              raidStart={analytics.raidStart}
              raidEnd={analytics.raidEnd}
              guildDistribution={analytics.overall.guildDistribution}
            />
          </div>

          {/* Boss breakdown */}
          <div>
            <h2 className="text-base font-bold text-white mb-3">{t("bossBreakdown")}</h2>
            <div className="space-y-2">
              {analytics.bosses.map((boss, index) => {
                const bossIcon = getBossIconUrl(boss.bossName);
                return (
                  <div key={boss.bossId} className="bg-gray-900/60 rounded border border-gray-800/50 overflow-hidden hover:border-gray-700/50 transition-colors">
                    {/* Boss header - compact */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/30 border-b border-gray-800/50">
                      <span className="text-gray-600 font-mono text-xs w-5">#{index + 1}</span>
                      <IconImage iconFilename={bossIcon} alt={boss.bossName} width={28} height={28} className="rounded" />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">{boss.bossName}</h3>
                      </div>
                    </div>

                    {/* Boss stats */}
                    <div className="px-3 py-3">
                      {boss.guildsKilled > 0 ? (
                        <>
                          {/* Summary stats - single row with 4 equal columns */}
                          <div className="grid grid-cols-4 gap-4 mb-3">
                            <div className="flex flex-col">
                              <span className="text-xs text-gray-500 mb-1">Killed</span>
                              <span className="text-xl font-bold text-green-400">{boss.guildsKilled}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-gray-500 mb-1">Progressing</span>
                              <span className="text-xl font-bold text-yellow-400">{boss.guildsProgressing}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-gray-500 mb-1">Pull Count</span>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-xl font-bold text-white">{boss.pullCount.average || "-"}</span>
                                <span className="text-xs text-gray-600">avg</span>
                              </div>
                              <div className="flex items-baseline gap-1 mt-0.5">
                                <span className="text-xs text-green-400">{boss.pullCount.lowest}</span>
                                <span className="text-xs text-gray-700">-</span>
                                <span className="text-xs text-amber-400">{boss.pullCount.highest}</span>
                              </div>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs text-gray-500 mb-1">Time Spent</span>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-xl font-bold text-white">{formatTime(boss.timeSpent.average)}</span>
                                <span className="text-xs text-gray-600">avg</span>
                              </div>
                              <div className="flex items-baseline gap-1 mt-0.5">
                                <span className="text-xs text-green-400">{formatTime(boss.timeSpent.lowest)}</span>
                                <span className="text-xs text-gray-700">-</span>
                                <span className="text-xs text-amber-400">{formatTime(boss.timeSpent.highest)}</span>
                              </div>
                            </div>
                          </div>

                          <StatsSection
                            pullStats={boss.pullCount}
                            timeStats={boss.timeSpent}
                            progression={boss.killProgression}
                            raidStart={analytics.raidStart}
                            raidEnd={analytics.raidEnd}
                            progressionLabel={t("killProgression")}
                            progressionKey="killCount"
                            guildDistribution={boss.guildDistribution}
                          />
                        </>
                      ) : (
                        <div className="text-gray-600 text-xs">{t("noBossKills")}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* All raids view */}
      {!dataLoading && allAnalytics && allAnalytics.length > 0 && (
        <div className="space-y-4">
          <div className="text-sm text-gray-500">
            {t("showingOverallStatsForAllRaids")} ({allAnalytics.length} raids)
          </div>

          {allAnalytics.map((raidAnalytics) => (
            <div key={raidAnalytics.raidId} className="bg-gray-900/60 rounded border border-gray-800/50 overflow-hidden">
              {/* Raid header */}
              <div className="px-4 py-3 bg-gray-800/30 border-b border-gray-800/50">
                <h2 className="text-lg font-bold text-white">{raidAnalytics.raidName}</h2>
                <div className="flex items-center gap-3 text-xs text-gray-600 mt-1">
                  <span>
                    {t("lastCalculated")}: {formatDate(raidAnalytics.lastCalculated)}
                  </span>
                  {raidAnalytics.raidStart && (
                    <>
                      <span>•</span>
                      <span>
                        {formatDate(raidAnalytics.raidStart)}
                        {raidAnalytics.raidEnd ? ` - ${formatDate(raidAnalytics.raidEnd)}` : ` - ${t("ongoing")}`}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Summary - inline */}
                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="text-gray-500">Cleared</span>
                    <span className="text-xl font-bold text-green-400">{raidAnalytics.overall.guildsCleared}</span>
                  </div>
                  <span className="text-gray-700">•</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-gray-500">Progressing</span>
                    <span className="text-xl font-bold text-yellow-400">{raidAnalytics.overall.guildsProgressing}</span>
                  </div>
                  <span className="text-gray-700">•</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-gray-500">Avg Pulls</span>
                    <span className="text-xl font-bold text-white">{raidAnalytics.overall.pullCount.average || "-"}</span>
                  </div>
                  <span className="text-gray-700">•</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-gray-500">Avg Time</span>
                    <span className="text-xl font-bold text-white">{formatTime(raidAnalytics.overall.timeSpent.average)}</span>
                  </div>
                </div>

                {/* Stats */}
                <StatsSection
                  pullStats={raidAnalytics.overall.pullCount}
                  timeStats={raidAnalytics.overall.timeSpent}
                  progression={raidAnalytics.overall.clearProgression}
                  progressionLabel={t("clearProgression")}
                  progressionKey="clearCount"
                  raidStart={raidAnalytics.raidStart}
                  raidEnd={raidAnalytics.raidEnd}
                  guildDistribution={raidAnalytics.overall.guildDistribution}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No data state */}
      {!dataLoading && !analytics && !allAnalytics && !error && (
        <div className="text-center py-12">
          <p className="text-gray-500">{t("selectRaidToView")}</p>
        </div>
      )}
    </div>
  );
}
