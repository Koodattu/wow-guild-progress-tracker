"use client";

import { useEffect, useState, useCallback } from "react";
import { RaidAnalytics, RaidInfo, Boss } from "@/types";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import RaidSelector from "@/components/RaidSelector";
import IconImage from "@/components/IconImage";

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

// Simple stat card component
function StatCard({ label, value, subValue }: { label: string; value: string | number; subValue?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 md:p-4 border border-gray-700">
      <div className="text-xs md:text-sm text-gray-400 mb-1">{label}</div>
      <div className="text-lg md:text-2xl font-bold text-white">{value}</div>
      {subValue && <div className="text-xs text-gray-500 mt-1">{subValue}</div>}
    </div>
  );
}

// Guild reference display
function GuildRefDisplay({ guild, label }: { guild?: { name: string; realm: string; count?: number; time?: number }; label: string }) {
  if (!guild) return null;
  return (
    <div className="text-xs text-gray-400">
      <span className="text-gray-500">{label}:</span>{" "}
      <span className="text-gray-300">
        {guild.name}
        <span className="text-gray-500"> ({guild.realm})</span>
      </span>
      {guild.count !== undefined && <span className="text-gray-400 ml-1">({guild.count} pulls)</span>}
      {guild.time !== undefined && <span className="text-gray-400 ml-1">({formatTime(guild.time)})</span>}
    </div>
  );
}

// Cumulative progression chart with weekly buckets
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
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
        <div className="text-sm text-gray-400 mb-2">{label}</div>
        <div className="text-gray-500 text-sm">No data available</div>
      </div>
    );
  }

  // Calculate weekly buckets from raidStart to raidEnd (or current date)
  const startDate = new Date(raidStart);
  const endDate = raidEnd ? new Date(raidEnd) : new Date();

  // Calculate number of weeks
  const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
  const totalWeeks = Math.ceil((endDate.getTime() - startDate.getTime()) / millisecondsPerWeek);

  // Create weekly buckets
  const weeklyData: { weekNumber: number; value: number; weekStart: Date; weekEnd: Date }[] = [];

  for (let week = 1; week <= totalWeeks; week++) {
    const weekStart = new Date(startDate.getTime() + (week - 1) * millisecondsPerWeek);
    const weekEnd = new Date(Math.min(weekStart.getTime() + millisecondsPerWeek, endDate.getTime()));

    // Find the latest value in this week (cumulative data, so we want the last entry)
    let weekValue = 0;
    for (const entry of data) {
      const entryDate = new Date(entry.date);
      if (entryDate >= weekStart && entryDate < weekEnd) {
        const value = valueKey === "killCount" ? entry.killCount || 0 : entry.clearCount || 0;
        weekValue = Math.max(weekValue, value); // Take the highest cumulative value in the week
      }
    }

    // If no data in this week, carry forward the previous week's value
    if (weekValue === 0 && week > 1) {
      weekValue = weeklyData[week - 2].value;
    }

    weeklyData.push({
      weekNumber: week,
      value: weekValue,
      weekStart,
      weekEnd,
    });
  }

  const maxValue = Math.max(...weeklyData.map((d) => d.value));

  // Calculate nice y-axis steps
  const getYAxisSteps = (max: number): number[] => {
    if (max === 0) return [0];
    if (max <= 5) return Array.from({ length: max + 1 }, (_, i) => i);
    if (max <= 10) return [0, Math.ceil(max / 2), max];

    // For larger values, show ~4-5 labels
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
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
      <div className="text-sm text-gray-400 mb-3">{label}</div>
      <div className="flex gap-2">
        {/* Y-axis */}
        <div className="flex flex-col justify-between h-24 text-xs text-gray-500 pr-2 border-r border-gray-700">
          {yAxisSteps
            .slice()
            .reverse()
            .map((step, index) => (
              <div key={index} className="leading-none">
                {step}
              </div>
            ))}
        </div>

        {/* Chart bars */}
        <div className="flex-1 flex items-end gap-1 h-24">
          {weeklyData.map((weekData) => {
            const heightPx = maxValue > 0 ? (weekData.value / maxValue) * 96 : 0; // 96px = h-24
            return (
              <div key={weekData.weekNumber} className="flex-1 flex flex-col items-center group relative">
                <div
                  className="w-full bg-blue-500/70 hover:bg-blue-500 rounded-t transition-colors"
                  style={{ height: `${heightPx}px`, minHeight: weekData.value > 0 ? "4px" : "0" }}
                />
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs whitespace-nowrap z-10">
                  <div className="text-white font-medium">{weekData.value} guilds</div>
                  <div className="text-gray-400">Week {weekData.weekNumber}</div>
                  <div className="text-gray-500 text-[10px]">
                    {formatDate(weekData.weekStart.toISOString())} - {formatDate(weekData.weekEnd.toISOString())}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-gray-500 pl-8">
        <span>Week 1</span>
        {totalWeeks > 2 && <span>Week {Math.ceil(totalWeeks / 2)}</span>}
        <span>Week {totalWeeks}</span>
      </div>
    </div>
  );
}

// Stats section component
function StatsSection({
  title,
  pullStats,
  timeStats,
  progression,
  progressionLabel,
  progressionKey,
  raidStart,
  raidEnd,
}: {
  title: string;
  pullStats: {
    average: number;
    lowest: number;
    highest: number;
    lowestGuild?: { name: string; realm: string; count?: number };
    highestGuild?: { name: string; realm: string; count?: number };
  };
  timeStats: {
    average: number;
    lowest: number;
    highest: number;
    lowestGuild?: { name: string; realm: string; time?: number };
    highestGuild?: { name: string; realm: string; time?: number };
  };
  progression?: { date: string; killCount?: number; clearCount?: number }[];
  progressionLabel: string;
  progressionKey: "killCount" | "clearCount";
  raidStart?: string;
  raidEnd?: string;
}) {
  const t = useTranslations("raidAnalyticsPage");

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">{title}</h3>

      {/* Pull count stats */}
      <div>
        <div className="text-sm text-gray-400 mb-2">{t("pullCount")}</div>
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <StatCard label={t("average")} value={pullStats.average || "-"} />
          <StatCard label={t("lowest")} value={pullStats.lowest || "-"} />
          <StatCard label={t("highest")} value={pullStats.highest || "-"} />
        </div>
        <div className="mt-2 space-y-1">
          <GuildRefDisplay guild={pullStats.lowestGuild} label={t("fastestGuild")} />
          <GuildRefDisplay guild={pullStats.highestGuild} label={t("slowestGuild")} />
        </div>
      </div>

      {/* Time spent stats */}
      <div>
        <div className="text-sm text-gray-400 mb-2">{t("timeSpent")}</div>
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <StatCard label={t("average")} value={formatTime(timeStats.average)} />
          <StatCard label={t("lowest")} value={formatTime(timeStats.lowest)} />
          <StatCard label={t("highest")} value={formatTime(timeStats.highest)} />
        </div>
        <div className="mt-2 space-y-1">
          <GuildRefDisplay guild={timeStats.lowestGuild} label={t("fastestGuild")} />
          <GuildRefDisplay guild={timeStats.highestGuild} label={t("slowestGuild")} />
        </div>
      </div>

      {/* Progression chart */}
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
        // Default to "overall" view (null)
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
          // Fetch all analytics
          const allAnalyticsData = await api.getAllRaidAnalytics();
          setAllAnalytics(allAnalyticsData);
          setAnalytics(null);
          setBosses([]);
        } else {
          // Fetch analytics and bosses for specific raid
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

  // Get boss icon URL for single raid view
  const getBossIconUrl = (bossName: string): string | undefined => {
    const boss = bosses.find((b) => b.name === bossName);
    return boss?.iconUrl;
  };

  // Get boss icon URL for all raids view (need to search within raid data)
  const getBossIconUrlFromRaid = (raidAnalytics: RaidAnalytics, bossName: string): string | undefined => {
    // For the overall view, we don't have bosses loaded, so we'll skip icons for now
    // Could be enhanced later by loading all bosses
    return undefined;
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{t("title")}</h1>
          <p className="text-gray-400 text-sm mt-1">{t("subtitle")}</p>
        </div>
        <RaidSelector raids={raids} selectedRaidId={selectedRaidId} onRaidSelect={handleRaidSelect} showOverall={true} />
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Loading state for data */}
      {dataLoading && (
        <div className="flex justify-center items-center min-h-64">
          <div className="text-gray-400">{t("loadingAnalytics")}</div>
        </div>
      )}

      {/* Analytics content */}
      {!dataLoading && analytics && (
        <div className="space-y-8">
          {/* Last calculated info */}
          <div className="text-xs text-gray-500">
            {t("lastCalculated")}: {formatDate(analytics.lastCalculated)}
            {analytics.raidStart && (
              <>
                {" • "}
                {t("raidSeason")}: {formatDate(analytics.raidStart)}
                {analytics.raidEnd ? ` - ${formatDate(analytics.raidEnd)}` : ` - ${t("ongoing")}`}
              </>
            )}
          </div>

          {/* Overall summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <StatCard label={t("guildsCleared")} value={analytics.overall.guildsCleared} />
            <StatCard label={t("guildsProgressing")} value={analytics.overall.guildsProgressing} />
            <StatCard label={t("avgPullsToClean")} value={analytics.overall.pullCount.average || "-"} />
            <StatCard label={t("avgTimeToClean")} value={formatTime(analytics.overall.timeSpent.average)} />
          </div>

          {/* Overall raid statistics */}
          <div className="bg-gray-900 rounded-lg p-4 md:p-6 border border-gray-700">
            <StatsSection
              title={t("overallStatistics")}
              pullStats={analytics.overall.pullCount}
              timeStats={analytics.overall.timeSpent}
              progression={analytics.overall.clearProgression}
              progressionLabel={t("clearProgression")}
              progressionKey="clearCount"
              raidStart={analytics.raidStart}
              raidEnd={analytics.raidEnd}
            />
          </div>

          {/* Boss-by-boss breakdown */}
          <div>
            <h2 className="text-xl font-bold text-white mb-4">{t("bossBreakdown")}</h2>
            <div className="space-y-4">
              {analytics.bosses.map((boss, index) => {
                const bossIcon = getBossIconUrl(boss.bossName);
                return (
                  <div key={boss.bossId} className="bg-gray-900 rounded-lg p-4 md:p-6 border border-gray-700">
                    {/* Boss header */}
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-gray-500 font-mono text-sm w-6">#{index + 1}</span>
                      <IconImage iconFilename={bossIcon} alt={boss.bossName} width={40} height={40} className="rounded" />
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white">{boss.bossName}</h3>
                        <div className="text-sm text-gray-400">
                          <span className="text-green-400">
                            {boss.guildsKilled} {t("killed")}
                          </span>
                          {boss.guildsProgressing > 0 && (
                            <span className="text-yellow-400 ml-2">
                              • {boss.guildsProgressing} {t("progressing")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Boss stats */}
                    {boss.guildsKilled > 0 ? (
                      <StatsSection
                        title=""
                        pullStats={boss.pullCount}
                        timeStats={boss.timeSpent}
                        progression={boss.killProgression}
                        raidStart={analytics.raidStart}
                        raidEnd={analytics.raidEnd}
                        progressionLabel={t("killProgression")}
                        progressionKey="killCount"
                      />
                    ) : (
                      <div className="text-gray-500 text-sm">{t("noBossKills")}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* All raids overall view */}
      {!dataLoading && allAnalytics && allAnalytics.length > 0 && (
        <div className="space-y-8">
          <div className="text-sm text-gray-400 mb-4">
            {t("showingOverallStatsForAllRaids")} ({allAnalytics.length} raids)
          </div>

          {allAnalytics.map((raidAnalytics) => (
            <div key={raidAnalytics.raidId} className="bg-gray-900 rounded-lg p-4 md:p-6 border border-gray-700">
              {/* Raid header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">{raidAnalytics.raidName}</h2>
                  <div className="text-xs text-gray-500 mt-1">
                    {t("lastCalculated")}: {formatDate(raidAnalytics.lastCalculated)}
                    {raidAnalytics.raidStart && (
                      <>
                        {" • "}
                        {formatDate(raidAnalytics.raidStart)}
                        {raidAnalytics.raidEnd ? ` - ${formatDate(raidAnalytics.raidEnd)}` : ` - ${t("ongoing")}`}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Overall summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
                <StatCard label={t("guildsCleared")} value={raidAnalytics.overall.guildsCleared} />
                <StatCard label={t("guildsProgressing")} value={raidAnalytics.overall.guildsProgressing} />
                <StatCard label={t("avgPullsToClean")} value={raidAnalytics.overall.pullCount.average || "-"} />
                <StatCard label={t("avgTimeToClean")} value={formatTime(raidAnalytics.overall.timeSpent.average)} />
              </div>

              {/* Overall raid statistics */}
              <StatsSection
                title={t("overallStatistics")}
                pullStats={raidAnalytics.overall.pullCount}
                timeStats={raidAnalytics.overall.timeSpent}
                progression={raidAnalytics.overall.clearProgression}
                progressionLabel={t("clearProgression")}
                progressionKey="clearCount"
                raidStart={raidAnalytics.raidStart}
                raidEnd={raidAnalytics.raidEnd}
              />
            </div>
          ))}
        </div>
      )}

      {/* No data state */}
      {!dataLoading && !analytics && !error && (
        <div className="text-center py-12">
          <p className="text-gray-400">{t("selectRaidToView")}</p>
        </div>
      )}
    </div>
  );
}
