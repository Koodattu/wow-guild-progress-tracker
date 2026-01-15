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

// Cumulative progression chart (simple bar representation)
function ProgressionChart({
  data,
  valueKey,
  raidStart,
  label,
}: {
  data: { date: string; killCount?: number; clearCount?: number }[];
  valueKey: "killCount" | "clearCount";
  raidStart?: string;
  label: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
        <div className="text-sm text-gray-400 mb-2">{label}</div>
        <div className="text-gray-500 text-sm">No data available</div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => (valueKey === "killCount" ? d.killCount || 0 : d.clearCount || 0)));

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
          {data.map((entry, index) => {
            const value = valueKey === "killCount" ? entry.killCount || 0 : entry.clearCount || 0;
            const heightPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
            return (
              <div key={index} className="flex-1 flex flex-col items-center group relative">
                <div className="w-full bg-blue-500/70 hover:bg-blue-500 rounded-t transition-colors" style={{ height: `${heightPercent}%`, minHeight: value > 0 ? "4px" : "0" }} />
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs whitespace-nowrap z-10">
                  <div className="text-white font-medium">{value} guilds</div>
                  <div className="text-gray-400">{formatDate(entry.date)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500 pl-8">
        <span>{data.length > 0 ? formatDate(data[0].date) : ""}</span>
        <span>{data.length > 0 ? formatDate(data[data.length - 1].date) : ""}</span>
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
      {progression && <ProgressionChart data={progression} valueKey={progressionKey} label={progressionLabel} />}
    </div>
  );
}

export default function RaidAnalyticsPage() {
  const t = useTranslations("raidAnalyticsPage");
  const [analytics, setAnalytics] = useState<RaidAnalytics | null>(null);
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
        // Default to first (most recent) raid
        if (raidsData.length > 0) {
          setSelectedRaidId(raidsData[0].id);
        }
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
    async (raidId: number) => {
      try {
        setDataLoading(true);
        setError(null);

        // Fetch analytics and bosses in parallel
        const [analyticsData, bossesData] = await Promise.all([api.getRaidAnalytics(raidId), api.getBosses(raidId)]);

        setAnalytics(analyticsData);
        setBosses(bossesData);
      } catch (err) {
        if (err instanceof Error && err.message.includes("No analytics")) {
          setError(t("noAnalyticsAvailable"));
        } else {
          setError(t("failedToLoad"));
        }
        setAnalytics(null);
        console.error("Failed to fetch raid analytics:", err);
      } finally {
        setDataLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (selectedRaidId) {
      fetchAnalytics(selectedRaidId);
    }
  }, [selectedRaidId, fetchAnalytics]);

  const handleRaidSelect = (raidId: number) => {
    setSelectedRaidId(raidId);
  };

  // Get boss icon URL
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{t("title")}</h1>
          <p className="text-gray-400 text-sm mt-1">{t("subtitle")}</p>
        </div>
        <RaidSelector raids={raids} selectedRaidId={selectedRaidId} onRaidSelect={handleRaidSelect} />
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

      {/* No data state */}
      {!dataLoading && !analytics && !error && (
        <div className="text-center py-12">
          <p className="text-gray-400">{t("selectRaidToView")}</p>
        </div>
      )}
    </div>
  );
}
