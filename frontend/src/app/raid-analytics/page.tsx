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

  // Create buckets
  const buckets: { [key: number]: number } = {};
  data.forEach((guild) => {
    const value = guild[valueKey];
    const bucket = Math.floor(value / bucketSize) * bucketSize;
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  });

  // Convert to array and sort
  const chartData = Object.keys(buckets)
    .map((key) => ({
      bucket: parseInt(key),
      count: buckets[parseInt(key)],
      label: formatLabel(parseInt(key)),
    }))
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
            contentStyle={{
              backgroundColor: "#1F2937",
              border: "1px solid #374151",
              borderRadius: "4px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#D1D5DB" }}
            itemStyle={{ color: "#60A5FA" }}
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

// Compact progression chart
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

  const weeklyData: { weekNumber: number; value: number; weekStart: Date; weekEnd: Date }[] = [];

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

    weeklyData.push({ weekNumber: week, value: weekValue, weekStart, weekEnd });
  }

  const maxValue = Math.max(...weeklyData.map((d) => d.value));

  const getYAxisSteps = (max: number): number[] => {
    if (max === 0) return [0];
    if (max <= 5) return Array.from({ length: max + 1 }, (_, i) => i);
    if (max <= 10) return [0, Math.ceil(max / 2), max];
    const step = Math.ceil(max / 4);
    const steps: number[] = [];
    for (let i = 0; i <= max; i += step) {
      steps.push(i);
    }
    if (steps[steps.length - 1] !== max) {
      steps.push(max);
    }
    return steps;
  };

  const yAxisSteps = getYAxisSteps(maxValue);

  return (
    <div className="bg-gray-800/30 rounded border border-gray-800/50 p-3">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">{label}</div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between h-20 text-[10px] text-gray-600 pr-2 border-r border-gray-800">
          {yAxisSteps
            .slice()
            .reverse()
            .map((step, index) => (
              <div key={index} className="leading-none">
                {step}
              </div>
            ))}
        </div>
        <div className="flex-1 flex items-end gap-1 h-20">
          {weeklyData.map((weekData) => {
            const heightPx = maxValue > 0 ? (weekData.value / maxValue) * 80 : 0;
            return (
              <div key={weekData.weekNumber} className="flex-1 flex flex-col items-center group relative">
                <div
                  className="w-full bg-blue-500/60 hover:bg-blue-400/80 rounded-t transition-all duration-200"
                  style={{ height: `${heightPx}px`, minHeight: weekData.value > 0 ? "4px" : "0" }}
                />
                <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs whitespace-nowrap z-10 shadow-xl">
                  <div className="text-white font-bold">{weekData.value} guilds</div>
                  <div className="text-gray-500 text-[10px]">Week {weekData.weekNumber}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-600 pl-7">
        <span>W1</span>
        {totalWeeks > 2 && <span>W{Math.ceil(totalWeeks / 2)}</span>}
        <span>W{totalWeeks}</span>
      </div>
    </div>
  );
}

// Stats section with 2-column layout
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
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Left column: Stats and distribution charts */}
      <div className="space-y-3">
        <CompactStat label="Pull Count" average={pullStats.average} min={pullStats.lowest} max={pullStats.highest} formatValue={(val) => (val === 0 ? "-" : val.toString())} />
        <CompactStat label="Time Spent" average={timeStats.average} min={timeStats.lowest} max={timeStats.highest} formatValue={formatTime} />

        {guildDistribution && guildDistribution.length > 0 && (
          <>
            <DistributionChart data={guildDistribution} title="Pull Distribution" valueKey="pullCount" bucketSize={10} formatLabel={(val) => `${val}-${val + 9}`} />
            <DistributionChart data={guildDistribution} title="Time Distribution" valueKey="timeSpent" bucketSize={1800} formatLabel={(val) => formatTime(val)} />
          </>
        )}
      </div>

      {/* Right column: Progression chart */}
      <div>{progression && <ProgressionChart data={progression} valueKey={progressionKey} raidStart={raidStart} raidEnd={raidEnd} label={progressionLabel} />}</div>
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

          {/* Overall summary - horizontal inline stats */}
          <div className="bg-gray-900/60 rounded border border-gray-800/50 p-3">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-gray-500">Cleared</span>
                <span className="text-xl font-bold text-green-400">{analytics.overall.guildsCleared}</span>
              </div>
              <span className="text-gray-700">•</span>
              <div className="flex items-baseline gap-2">
                <span className="text-gray-500">Progressing</span>
                <span className="text-xl font-bold text-yellow-400">{analytics.overall.guildsProgressing}</span>
              </div>
              <span className="text-gray-700">•</span>
              <div className="flex items-baseline gap-2">
                <span className="text-gray-500">Avg Pulls</span>
                <span className="text-xl font-bold text-white">{analytics.overall.pullCount.average || "-"}</span>
              </div>
              <span className="text-gray-700">•</span>
              <div className="flex items-baseline gap-2">
                <span className="text-gray-500">Avg Time</span>
                <span className="text-xl font-bold text-white">{formatTime(analytics.overall.timeSpent.average)}</span>
              </div>
            </div>
          </div>

          {/* Overall stats section */}
          <div className="bg-gray-900/60 rounded border border-gray-800/50 p-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wide mb-3">{t("overallStatistics")}</h2>
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
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-baseline gap-1">
                          <span className="text-base font-bold text-green-400">{boss.guildsKilled}</span>
                          <span className="text-gray-500">killed</span>
                        </div>
                        {boss.guildsProgressing > 0 && (
                          <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-yellow-400">{boss.guildsProgressing}</span>
                            <span className="text-gray-500">prog</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Boss stats */}
                    <div className="px-3 py-3">
                      {boss.guildsKilled > 0 ? (
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
