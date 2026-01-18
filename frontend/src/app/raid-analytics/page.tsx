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

  // Always render chart, even with single guild

  // Find min and max values
  const values = data.map((guild) => guild[valueKey]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue;

  // Determine number of buckets based on number of guilds
  const numGuilds = data.length;
  const targetBuckets = numGuilds < 5 ? numGuilds : 5;

  // If no range (all guilds have same value), use single bucket
  if (range === 0 || targetBuckets === 1) {
    const singleBucket = minValue;
    const chartData = [
      {
        bucket: singleBucket,
        count: data.length,
        label: valueKey === "timeSpent" ? formatTime(Math.floor(singleBucket)) : `${Math.floor(singleBucket)}`,
        guilds: data,
      },
    ];

    // Render chart with single bucket
    const getColor = (index: number, total: number) => {
      const hue = 200 + (index / total) * 60;
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
              cursor={false}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs max-w-xs">
                      <div className="text-white font-bold mb-1">{data.label}</div>
                      <div className="text-blue-400 mb-1">{data.count} guilds</div>
                      {data.guilds && Array.isArray(data.guilds) && data.guilds.length > 0 && (
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
            <Bar dataKey="count" radius={[4, 4, 0, 0]} activeBar={{ filter: 'brightness(1.3)' }}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getColor(index, chartData.length)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Use quantile-based bucketing for better distribution
  // This creates buckets with roughly equal numbers of guilds in each
  // More buckets where data is dense, fewer where sparse

  // Sort guilds by value
  const sortedData = [...data].sort((a, b) => a[valueKey] - b[valueKey]);

  // Calculate quantile boundaries for targetBuckets
  const bucketBoundaries: number[] = [minValue];
  for (let i = 1; i < targetBuckets; i++) {
    const quantileIndex = Math.floor((i / targetBuckets) * sortedData.length);
    bucketBoundaries.push(sortedData[quantileIndex][valueKey]);
  }
  bucketBoundaries.push(maxValue + 1); // Add upper boundary (exclusive)

  // Create buckets based on quantile boundaries
  const buckets: { min: number; max: number; guilds: GuildDistributionEntry[] }[] = [];

  for (let i = 0; i < targetBuckets; i++) {
    const bucketMin = bucketBoundaries[i];
    const bucketMax = bucketBoundaries[i + 1];

    // Find all guilds in this range
    const guildsInBucket = sortedData.filter(
      (guild) => guild[valueKey] >= bucketMin && guild[valueKey] < bucketMax
    );

    // For the last bucket, include guilds at the max boundary
    if (i === targetBuckets - 1) {
      guildsInBucket.push(
        ...sortedData.filter((guild) => guild[valueKey] === bucketMax - 1)
      );
    }

    buckets.push({
      min: bucketMin,
      max: bucketMax - 1, // Make it inclusive for display
      guilds: guildsInBucket,
    });
  }

  // Convert to chart data format
  const chartData = buckets
    .filter((bucket) => bucket.guilds.length > 0) // Only include non-empty buckets
    .map((bucket) => {
      // Format labels
      let label: string;
      if (valueKey === "timeSpent") {
        // For time, show the average (middle point) of the bucket
        const bucketAverage = (bucket.min + bucket.max) / 2;
        label = formatTime(Math.floor(bucketAverage));
      } else {
        // For pulls, show the range
        label = `${Math.floor(bucket.min)}-${Math.floor(bucket.max)}`;
      }

      return {
        bucket: bucket.min,
        count: bucket.guilds.length,
        label,
        guilds: bucket.guilds,
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
            cursor={false}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs max-w-xs">
                    <div className="text-white font-bold mb-1">{data.label}</div>
                    <div className="text-blue-400 mb-1">{data.count} guilds</div>
                    {data.guilds && Array.isArray(data.guilds) && data.guilds.length > 0 && (
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
          <Bar dataKey="count" radius={[4, 4, 0, 0]} activeBar={{ filter: 'brightness(1.3)' }}>
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
  if (!raidStart) {
    return (
      <div className="bg-gray-800/30 rounded border border-gray-800/50 p-3">
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">{label}</div>
        <div className="text-xs text-gray-600">No data available</div>
      </div>
    );
  }

  // Always render chart, even with no progression data yet
  const safeData = data || [];

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
    for (const entry of safeData) {
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
            cursor={false}
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
          <Bar dataKey="value" radius={[4, 4, 0, 0]} activeBar={{ filter: 'brightness(1.3)' }}>
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
      {progression && Array.isArray(progression) && (
        <ProgressionChart data={progression} valueKey={progressionKey} raidStart={raidStart} raidEnd={raidEnd} label={progressionLabel} />
      )}
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
    [t],
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

  const getRaidIconUrl = (raidId: number): string | undefined => {
    const raid = raids.find((r) => r.id === raidId);
    return raid?.iconUrl;
  };

  const getRaidInfo = (raidId: number): RaidInfo | undefined => {
    return raids.find((r) => r.id === raidId);
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
          <div className="bg-gray-900/60 rounded border border-gray-800/50 p-2">
            {/* Raid header with icon and inline stats */}
            <div className="flex items-center gap-4 mb-2 pb-2 border-b border-gray-800/50">
              {getRaidIconUrl(analytics.raidId) && (
                <IconImage iconFilename={getRaidIconUrl(analytics.raidId)} alt={analytics.raidName} width={40} height={40} className="rounded" />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-white">{analytics.raidName}</h2>
                <p className="text-xs text-gray-500">{t("overallStatistics")}</p>
              </div>
              {/* Summary stats - inline with header */}
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                  <span className="text-xs text-gray-500">Cleared</span>
                  <span className="text-xl font-bold text-green-400">{analytics.overall.guildsCleared}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-gray-500">Progressing</span>
                  <span className="text-xl font-bold text-yellow-400">{analytics.overall.guildsProgressing}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-gray-500">Avg Pulls</span>
                  <span className="text-xl font-bold text-white">{analytics.overall.pullCount.average || "-"}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-gray-500">Avg Time</span>
                  <span className="text-xl font-bold text-white">{formatTime(analytics.overall.timeSpent.average)}</span>
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
                    {/* Boss header with inline stats */}
                    <div className="flex items-center gap-3 px-3 py-2 bg-gray-800/30 border-b border-gray-800/50">
                      <span className="text-gray-600 font-mono text-xs w-5">#{index + 1}</span>
                      <IconImage iconFilename={bossIcon} alt={boss.bossName} width={28} height={28} className="rounded" />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">{boss.bossName}</h3>
                      </div>
                      {boss.guildsKilled > 0 && (
                        <div className="flex items-center gap-5">
                          <div className="flex flex-col items-end">
                            <span className="text-xs text-gray-500">Killed</span>
                            <span className="text-base font-bold text-green-400">{boss.guildsKilled}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-xs text-gray-500">Progressing</span>
                            <span className="text-base font-bold text-yellow-400">{boss.guildsProgressing}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-xs text-gray-500">Avg Pulls</span>
                            <span className="text-base font-bold text-white">{boss.pullCount.average || "-"}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-xs text-gray-500">Avg Time</span>
                            <span className="text-base font-bold text-white">{formatTime(boss.timeSpent.average)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Boss stats */}
                    <div className="px-3 py-3">
                      {boss.guildsKilled > 0 ? (
                        <>
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
              {/* Raid header with inline stats */}
              <div className="px-4 py-3 bg-gray-800/30 border-b border-gray-800/50">
                <div className="flex items-center gap-4">
                  {getRaidIconUrl(raidAnalytics.raidId) && (
                    <IconImage iconFilename={getRaidIconUrl(raidAnalytics.raidId)} alt={raidAnalytics.raidName} width={32} height={32} className="rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3">
                      <h2 className="text-lg font-bold text-white">{raidAnalytics.raidName}</h2>
                      {raidAnalytics.raidStart && (
                        <span className="text-xs text-gray-500">
                          {formatDate(raidAnalytics.raidStart)}
                          {raidAnalytics.raidEnd ? ` - ${formatDate(raidAnalytics.raidEnd)}` : ` - ${t("ongoing")}`}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Summary stats - inline with header */}
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-gray-500">Cleared</span>
                      <span className="text-xl font-bold text-green-400">{raidAnalytics.overall.guildsCleared}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-gray-500">Progressing</span>
                      <span className="text-xl font-bold text-yellow-400">{raidAnalytics.overall.guildsProgressing}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-gray-500">Avg Pulls</span>
                      <span className="text-xl font-bold text-white">{raidAnalytics.overall.pullCount.average || "-"}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-gray-500">Avg Time</span>
                      <span className="text-xl font-bold text-white">{formatTime(raidAnalytics.overall.timeSpent.average)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-4">
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
