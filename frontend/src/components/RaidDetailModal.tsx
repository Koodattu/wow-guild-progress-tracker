"use client";

import React, { useState } from "react";
import { Guild, RaidProgress, BossProgress, RaidInfo, Boss, WorldRankHistoryEntry } from "@/types";
import { formatTime, formatPercent, getDifficultyColor, getKillLogUrl, formatPhaseDisplay } from "@/lib/utils";
import IconImage from "./IconImage";
import GuildCrest from "./GuildCrest";
import PullProgressChart from "./PullProgressChart";
import PhaseDistributionChart from "./PhaseDistributionChart";
import { useBossPullHistory } from "@/lib/queries";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// Collapsible chart showing world rank history over time
function WorldRankHistorySection({ history }: { history: WorldRankHistoryEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!history || history.length < 2) return null;

  const chartData = history.map((entry) => ({
    date: new Date(entry.recordedAt).getTime(),
    worldRank: entry.worldRank,
    wclWorldRank: entry.wclWorldRank,
    rioWorldRank: entry.rioWorldRank,
  }));

  // For world rank, lower is better — invert the Y axis
  const ranks = chartData.map((d) => d.worldRank);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  // Add some breathing room to the domain
  const domainMin = Math.max(1, minRank - Math.max(1, Math.floor((maxRank - minRank) * 0.1)));
  const domainMax = maxRank + Math.max(1, Math.floor((maxRank - minRank) * 0.1));

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString("fi-FI", { day: "numeric", month: "numeric" });
  };

  return (
    <div className="mb-4">
      <button type="button" onClick={() => setExpanded((prev) => !prev)} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors px-2 py-1">
        <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        World Rank History
        <span className="text-xs text-gray-500">
          (#{minRank} → #{ranks[ranks.length - 1]})
        </span>
      </button>
      {expanded && (
        <div className="mt-2 border border-gray-700 rounded-lg bg-gray-800/50 p-2 md:p-4">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" type="number" domain={["dataMin", "dataMax"]} tickFormatter={formatDate} tick={{ fill: "#9CA3AF", fontSize: 11 }} stroke="#4B5563" />
              <YAxis reversed domain={[domainMin, domainMax]} tick={{ fill: "#9CA3AF", fontSize: 11 }} stroke="#4B5563" width={40} tickFormatter={(v: number) => `#${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "0.5rem" }}
                labelStyle={{ color: "#9CA3AF" }}
                labelFormatter={(timestamp: number) => new Date(timestamp).toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric" })}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => {
                  const label = name === "worldRank" ? "World Rank" : name === "wclWorldRank" ? "WCL Rank" : "RIO Rank";
                  return [`#${value}`, label];
                }}
              />
              <Line type="stepAfter" dataKey="worldRank" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3, fill: "#F59E0B" }} activeDot={{ r: 5 }} name="worldRank" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

interface RaidDetailModalProps {
  guild: Guild;
  onClose: () => void;
  selectedRaidId: number | null;
  raids: RaidInfo[];
  bosses: Boss[];
  loading?: boolean;
}

// Sub-component that fetches and renders pull history charts when a boss is expanded.
// By mounting only when expanded, the React Query hook fires on-demand.
function BossPullHistoryContent({
  realm,
  guildName,
  raidId,
  bossId,
  difficulty,
  variant,
}: {
  realm: string;
  guildName: string;
  raidId: number;
  bossId: number;
  difficulty: "mythic" | "heroic";
  variant: "mobile" | "desktop";
}) {
  const { data, isLoading } = useBossPullHistory(realm, guildName, raidId, bossId, difficulty);

  const pullHistory = data?.pullHistory;
  const phaseDistribution = data?.phaseDistribution;
  const hasPullHistory = pullHistory && pullHistory.length > 0;

  if (isLoading) {
    return <div className="text-center py-4 text-gray-500">Loading pull history...</div>;
  }

  if (!hasPullHistory) {
    return <div className="text-center py-4 text-gray-500">No pull history available</div>;
  }

  if (variant === "mobile") {
    return (
      <>
        <PullProgressChart pullHistory={pullHistory} />
        {phaseDistribution && phaseDistribution.length > 1 && <PhaseDistributionChart phaseDistribution={phaseDistribution} />}
      </>
    );
  }

  return (
    <div className={`grid grid-cols-1 gap-2 items-start ${phaseDistribution && phaseDistribution.length > 1 ? "lg:grid-cols-[5fr_1fr]" : ""}`}>
      <PullProgressChart pullHistory={pullHistory} />
      {phaseDistribution && phaseDistribution.length > 1 && <PhaseDistributionChart phaseDistribution={phaseDistribution} />}
    </div>
  );
}

export default function RaidDetailModal({ guild, onClose, selectedRaidId, raids, bosses, loading }: RaidDetailModalProps) {
  const [expandedBosses, setExpandedBosses] = useState<Set<string>>(new Set());

  const toggleBossExpanded = (bossId: number, difficulty: "mythic" | "heroic") => {
    const expandedKey = `${bossId}-${difficulty}`;
    setExpandedBosses((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(expandedKey)) {
        newSet.delete(expandedKey);
      } else {
        newSet.add(expandedKey);
      }
      return newSet;
    });
  };

  const getBossIconUrl = (bossName: string): string | undefined => {
    const boss = bosses.find((b) => b.name === bossName);
    return boss?.iconUrl;
  };

  const handleBossClick = (boss: BossProgress) => {
    if (boss.kills > 0) {
      // Boss is killed - use kill log
      if (boss.firstKillReportCode && boss.firstKillFightId) {
        const url = getKillLogUrl(boss.firstKillReportCode, boss.firstKillFightId);
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } else {
      // Boss is not killed - use best pull log
      if (boss.bestPullReportCode && boss.bestPullFightId) {
        const url = getKillLogUrl(boss.bestPullReportCode, boss.bestPullFightId);
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  };

  // Mobile card component for boss
  const MobileBossCard = ({ boss, bossNumber, difficulty }: { boss: BossProgress; bossNumber: number; difficulty: "mythic" | "heroic" }) => {
    const isDefeated = boss.kills > 0;
    const hasKillLog = boss.firstKillReportCode && boss.firstKillFightId;
    const hasBestPullLog = boss.bestPullReportCode && boss.bestPullFightId;
    const hasLogLink = (isDefeated && hasKillLog) || (!isDefeated && hasBestPullLog);
    const bossIconFilename = getBossIconUrl(boss.bossName);
    const expandedKey = `${boss.bossId}-${difficulty}`;
    const isExpanded = expandedBosses.has(expandedKey);

    return (
      <div
        className={`rounded-lg p-2 mb-1.5 ${isDefeated ? "bg-green-900/20 border border-green-800/50" : "bg-gray-800/50 border border-gray-700/50"} cursor-pointer`}
        onClick={() => toggleBossExpanded(boss.bossId, difficulty)}
      >
        <div className="flex items-center gap-2">
          {/* Boss number and icon */}
          <span className="text-gray-500 text-xs w-4 shrink-0">{bossNumber}</span>
          <IconImage iconFilename={bossIconFilename} alt={`${boss.bossName} icon`} width={32} height={32} className="rounded w-8 h-8 shrink-0" />

          {/* Boss name and log link */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className={`text-sm font-medium truncate ${isDefeated ? "text-green-400" : "text-white"}`}>{boss.bossName}</span>
              {hasLogLink && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBossClick(boss);
                  }}
                  className="text-xs text-gray-500 hover:text-blue-400 shrink-0"
                >
                  🔗
                </button>
              )}
            </div>
          </div>

          {/* Stats in compact row */}
          <div className="flex items-center gap-2 shrink-0 text-xs">
            <div className="text-center">
              <div className="text-gray-300">{boss.pullCount || 0}</div>
              <div className="text-[9px] text-gray-500">pulls</div>
            </div>
            <div className="text-center min-w-7">
              <div className={isDefeated ? "text-green-400" : "text-gray-300"}>
                {isDefeated
                  ? "✓"
                  : boss.bestPullPhase?.displayString
                    ? formatPhaseDisplay(boss.bestPullPhase.displayString)
                    : boss.bestPercent < 100
                      ? formatPercent(boss.bestPercent)
                      : "-"}
              </div>
              <div className="text-[9px] text-gray-500">best</div>
            </div>
            <div className="text-center min-w-8">
              <div className="text-gray-300">{boss.timeSpent > 0 ? formatTime(boss.timeSpent) : "-"}</div>
              <div className="text-[9px] text-gray-500">time</div>
            </div>
            <span className="text-gray-500">{isExpanded ? "▼" : "▶"}</span>
          </div>
        </div>

        {/* Expanded charts */}
        {isExpanded && (
          <div className="mt-2 pt-2 border-t border-gray-700 space-y-4">
            <BossPullHistoryContent realm={guild.realm} guildName={guild.name} raidId={selectedRaidId ?? 0} bossId={boss.bossId} difficulty={difficulty} variant="mobile" />
          </div>
        )}
      </div>
    );
  };

  const renderBossRow = (boss: BossProgress, bossNumber: number, difficulty: "mythic" | "heroic") => {
    const isDefeated = boss.kills > 0;
    const hasKillLog = boss.firstKillReportCode && boss.firstKillFightId;
    const hasBestPullLog = boss.bestPullReportCode && boss.bestPullFightId;
    const hasLogLink = (isDefeated && hasKillLog) || (!isDefeated && hasBestPullLog);
    const bossIconFilename = getBossIconUrl(boss.bossName);
    const expandedKey = `${boss.bossId}-${difficulty}`;
    const isExpanded = expandedBosses.has(expandedKey);

    return (
      <React.Fragment key={boss.bossId}>
        <tr
          className={`border-b border-gray-800 ${isDefeated ? "bg-green-900/10" : ""} cursor-pointer hover:bg-gray-800/50 transition-colors`}
          onClick={() => toggleBossExpanded(boss.bossId, difficulty)}
          title="Click to view pull progress chart"
        >
          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-400">{bossNumber}</td>
          <td className="px-2 md:px-4 py-2 md:py-3">
            <div className="flex items-center gap-1.5 md:gap-2">
              <IconImage iconFilename={bossIconFilename} alt={`${boss.bossName} icon`} width={32} height={32} className="rounded w-6 h-6 md:w-8 md:h-8" />
              <span className={`text-xs md:text-base ${isDefeated ? "text-green-400 font-semibold" : "text-white"}`}>
                {boss.bossName}
                {hasLogLink && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBossClick(boss);
                    }}
                    className="ml-1 md:ml-2 text-xs text-gray-500 hover:text-blue-400"
                    title={isDefeated ? "View kill log on WarcraftLogs" : "View best pull log on WarcraftLogs"}
                  >
                    🔗
                  </button>
                )}
              </span>
            </div>
          </td>
          <td className="px-2 md:px-4 py-2 md:py-3 text-center text-xs md:text-sm">
            {isDefeated ? <span className="text-white">{boss.kills}</span> : <span className="text-gray-500">-</span>}
          </td>
          <td className="px-2 md:px-4 py-2 md:py-3 text-center text-xs md:text-sm text-gray-300">{boss.pullCount || 0}</td>
          <td className="px-2 md:px-4 py-2 md:py-3 text-center text-xs md:text-sm">
            {isDefeated ? (
              <span className="text-green-400">✓</span>
            ) : boss.bestPullPhase?.displayString ? (
              <span className="text-gray-300 font-medium">{formatPhaseDisplay(boss.bestPullPhase.displayString)}</span>
            ) : boss.bestPercent < 100 ? (
              <span className="text-gray-300">{formatPercent(boss.bestPercent)}</span>
            ) : (
              <span className="text-gray-500">-</span>
            )}
          </td>
          <td className="px-2 md:px-4 py-2 md:py-3 text-center text-xs md:text-sm text-gray-300">{boss.timeSpent > 0 ? formatTime(boss.timeSpent) : "-"}</td>
          <td className="px-2 md:px-4 py-2 md:py-3 text-center text-xs md:text-sm text-gray-400 hidden md:table-cell">
            {boss.firstKillTime ? new Date(boss.firstKillTime).toLocaleDateString("fi-FI") : "-"}
          </td>
          <td className="px-1 md:px-2 py-2 md:py-3 text-center text-xs md:text-sm">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleBossExpanded(boss.bossId, difficulty);
              }}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1"
              title={isExpanded ? "Hide pull progress" : "Show pull progress"}
            >
              {isExpanded ? "▼" : "▶"}
            </button>
          </td>
        </tr>
        {isExpanded && (
          <tr className="border-b border-gray-800 bg-gray-900/50">
            <td colSpan={8} className="px-2 md:px-4 py-2 md:py-3">
              <BossPullHistoryContent realm={guild.realm} guildName={guild.name} raidId={selectedRaidId ?? 0} bossId={boss.bossId} difficulty={difficulty} variant="desktop" />
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  const renderProgressSection = (progress: RaidProgress) => {
    if (!selectedRaidId) return null;

    // Get the raid to know the boss order
    const raid = raids.find((r) => r.id === selectedRaidId);
    if (!raid) return null;

    const totalBosses = bosses.length;

    // Create a map of bossId to its default order position (1-indexed)
    const bossDefaultOrderMap = new Map<number, number>();
    bosses.forEach((boss, index) => {
      bossDefaultOrderMap.set(boss.id, index + 1);
    });

    // Create a map of existing progress data
    const progressMap = new Map<number, BossProgress>();
    progress.bosses.forEach((boss) => {
      progressMap.set(boss.bossId, boss);
    });

    // Merge all bosses with progress data (create placeholder for missing bosses)
    const allBossesWithProgress: BossProgress[] = bosses.map((boss) => {
      const existingProgress = progressMap.get(boss.id);
      if (existingProgress) {
        return existingProgress;
      }
      // Create a placeholder for bosses with no progress
      return {
        bossId: boss.id,
        bossName: boss.name,
        kills: 0,
        bestPercent: 100,
        pullCount: 0,
        timeSpent: 0,
        lastUpdated: new Date().toISOString(),
      };
    });

    // Sort bosses for display:
    // 1. Unkilled bosses first, in reverse default order (last boss first)
    // 2. Then killed bosses, in reverse kill order (most recent kill first)
    const sortedBosses = [...allBossesWithProgress].sort((a, b) => {
      const aKilled = a.kills > 0;
      const bKilled = b.kills > 0;

      // Both unkilled: sort by default order in reverse (higher bossId first)
      if (!aKilled && !bKilled) {
        const aOrder = bossDefaultOrderMap.get(a.bossId) || 0;
        const bOrder = bossDefaultOrderMap.get(b.bossId) || 0;
        return bOrder - aOrder; // Reverse order
      }

      // Unkilled bosses come before killed bosses
      if (!aKilled) return -1;
      if (!bKilled) return 1;

      // Both killed: sort by kill order in reverse (higher killOrder first)
      const aKillOrder = a.killOrder || 0;
      const bKillOrder = b.killOrder || 0;
      return bKillOrder - aKillOrder;
    });

    // Create display numbers based on sorted order: first item gets highest number
    const bossDisplayNumberMap = new Map<number, number>();
    sortedBosses.forEach((boss, index) => {
      bossDisplayNumberMap.set(boss.bossId, totalBosses - index);
    });

    return (
      <div key={`${progress.raidId}-${progress.difficulty}`} className="mb-6 md:mb-8">
        <h3 className={`text-lg md:text-xl font-bold mb-3 md:mb-4 ${getDifficultyColor(progress.difficulty)}`}>
          {progress.raidName} - {progress.difficulty.charAt(0).toUpperCase() + progress.difficulty.slice(1)}
        </h3>
        <div className="mb-3 md:mb-4 flex gap-4 md:gap-6 text-sm md:text-base">
          <div>
            <span className="text-gray-400">Progress: </span>
            <span className="text-white font-semibold">
              {progress.bossesDefeated}/{progress.totalBosses}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Time: </span>
            <span className="text-white font-semibold">{formatTime(progress.totalTimeSpent)}</span>
          </div>
        </div>
        {/* Mobile card view */}
        <div className="md:hidden">
          {sortedBosses.map((boss) => (
            <MobileBossCard key={boss.bossId} boss={boss} bossNumber={bossDisplayNumberMap.get(boss.bossId)!} difficulty={progress.difficulty} />
          ))}
        </div>

        {/* Desktop table view */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/50">
                <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm font-semibold text-gray-300">#</th>
                <th className="px-2 md:px-4 py-2 text-left text-xs md:text-sm font-semibold text-gray-300">Boss</th>
                <th className="px-2 md:px-4 py-2 text-center text-xs md:text-sm font-semibold text-gray-300">Kills</th>
                <th className="px-2 md:px-4 py-2 text-center text-xs md:text-sm font-semibold text-gray-300">Pulls</th>
                <th className="px-2 md:px-4 py-2 text-center text-xs md:text-sm font-semibold text-gray-300">Best</th>
                <th className="px-2 md:px-4 py-2 text-center text-xs md:text-sm font-semibold text-gray-300">Time</th>
                <th className="px-2 md:px-4 py-2 text-center text-xs md:text-sm font-semibold text-gray-300">Kill Date</th>
                <th className="px-1 md:px-2 py-2 text-center text-sm font-semibold text-gray-300 w-8 md:w-10"></th>
              </tr>
            </thead>
            <tbody>{sortedBosses.map((boss) => renderBossRow(boss, bossDisplayNumberMap.get(boss.bossId)!, progress.difficulty))}</tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center overflow-y-auto z-50" onClick={onClose}>
      <div className="bg-gray-900 rounded-lg shadow-2xl max-w-7xl w-full my-4 md:my-8 border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-3 md:px-6 py-3 md:py-4 flex items-center justify-between rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 shrink-0">
              <GuildCrest crest={guild.crest} faction={guild.faction} size={128} className="scale-[0.33] md:scale-[0.375] origin-top-left" />
            </div>
            <h2 className="text-lg md:text-2xl font-bold text-white">
              {guild.name}
              <span className="text-gray-400 font-normal"> - {guild.realm}</span>
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl md:text-3xl leading-none px-2 md:px-3 py-1">
            ×
          </button>
        </div>

        <div className="px-2 md:px-6 py-4 md:py-6">
          {!loading && guild.worldRankHistory && guild.worldRankHistory.length >= 2 && <WorldRankHistorySection history={guild.worldRankHistory} />}
          {loading ? (
            <div className="space-y-6">
              {[0, 1].map((section) => (
                <div key={section} className="animate-pulse">
                  <div className="h-6 md:h-7 w-48 bg-gray-700 rounded mb-3 md:mb-4" />
                  <div className="flex gap-4 md:gap-6 mb-3 md:mb-4">
                    <div className="h-4 w-24 bg-gray-800 rounded" />
                    <div className="h-4 w-20 bg-gray-800 rounded" />
                  </div>
                  <div className="space-y-2">
                    {[0, 1, 2, 3, 4].map((row) => (
                      <div key={row} className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-2 md:p-3">
                        <div className="w-4 h-4 bg-gray-700 rounded" />
                        <div className="w-7 h-7 md:w-8 md:h-8 bg-gray-700 rounded" />
                        <div className="h-4 flex-1 bg-gray-700 rounded" />
                        <div className="h-4 w-10 bg-gray-700 rounded" />
                        <div className="h-4 w-10 bg-gray-700 rounded" />
                        <div className="h-4 w-12 bg-gray-700 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : guild.progress?.length > 0 && selectedRaidId ? (
            (() => {
              // Filter progress for only the selected raid
              const raidProgress = guild.progress.filter((p) => p.raidId === selectedRaidId);

              if (raidProgress.length === 0) {
                return <div className="text-center py-12 text-gray-500">No progress data available for the selected raid yet.</div>;
              }

              // Sort by difficulty (mythic first)
              return raidProgress
                .sort((a, b) => {
                  if (a.difficulty !== b.difficulty) {
                    return a.difficulty === "mythic" ? -1 : 1;
                  }
                  return 0;
                })
                .map((progress) => renderProgressSection(progress));
            })()
          ) : (
            <div className="text-center py-12 text-gray-500">No progress data available for this guild yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
