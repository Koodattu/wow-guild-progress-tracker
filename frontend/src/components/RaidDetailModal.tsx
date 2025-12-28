"use client";

import React, { useState } from "react";
import { Guild, RaidProgress, BossProgress, RaidInfo, Boss } from "@/types";
import { formatTime, formatPercent, getDifficultyColor, getKillLogUrl, formatPhaseDisplay } from "@/lib/utils";
import IconImage from "./IconImage";
import PullProgressChart from "./PullProgressChart";

interface RaidDetailModalProps {
  guild: Guild;
  onClose: () => void;
  selectedRaidId: number | null;
  raids: RaidInfo[];
  bosses: Boss[];
}

export default function RaidDetailModal({ guild, onClose, selectedRaidId, raids, bosses }: RaidDetailModalProps) {
  // Track which bosses have their charts expanded
  const [expandedBosses, setExpandedBosses] = useState<Set<number>>(new Set());

  const toggleBossExpanded = (bossId: number) => {
    setExpandedBosses((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(bossId)) {
        newSet.delete(bossId);
      } else {
        newSet.add(bossId);
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
  const MobileBossCard = ({ boss, bossNumber }: { boss: BossProgress; bossNumber: number }) => {
    const isDefeated = boss.kills > 0;
    const hasKillLog = boss.firstKillReportCode && boss.firstKillFightId;
    const hasBestPullLog = boss.bestPullReportCode && boss.bestPullFightId;
    const hasLogLink = (isDefeated && hasKillLog) || (!isDefeated && hasBestPullLog);
    const bossIconFilename = getBossIconUrl(boss.bossName);
    const hasPullHistory = boss.pullHistory && boss.pullHistory.length > 0;
    const isExpanded = expandedBosses.has(boss.bossId);

    return (
      <div
        className={`rounded-lg p-2 mb-1.5 ${isDefeated ? "bg-green-900/20 border border-green-800/50" : "bg-gray-800/50 border border-gray-700/50"} ${
          hasPullHistory ? "cursor-pointer" : ""
        }`}
        onClick={() => hasPullHistory && toggleBossExpanded(boss.bossId)}
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
            <div className="text-center min-w-[28px]">
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
            <div className="text-center min-w-[32px]">
              <div className="text-gray-300">{boss.timeSpent > 0 ? formatTime(boss.timeSpent) : "-"}</div>
              <div className="text-[9px] text-gray-500">time</div>
            </div>
            {hasPullHistory && <span className="text-gray-500">{isExpanded ? "▼" : "▶"}</span>}
          </div>
        </div>

        {/* Expanded chart */}
        {isExpanded && hasPullHistory && (
          <div className="mt-2 pt-2 border-t border-gray-700">
            <PullProgressChart pullHistory={boss.pullHistory!} />
          </div>
        )}
      </div>
    );
  };

  const renderBossRow = (boss: BossProgress, bossNumber: number) => {
    const isDefeated = boss.kills > 0;
    const hasKillLog = boss.firstKillReportCode && boss.firstKillFightId;
    const hasBestPullLog = boss.bestPullReportCode && boss.bestPullFightId;
    const hasLogLink = (isDefeated && hasKillLog) || (!isDefeated && hasBestPullLog);
    const bossIconFilename = getBossIconUrl(boss.bossName);
    const hasPullHistory = boss.pullHistory && boss.pullHistory.length > 0;
    const isExpanded = expandedBosses.has(boss.bossId);

    return (
      <React.Fragment key={boss.bossId}>
        <tr
          className={`border-b border-gray-800 ${isDefeated ? "bg-green-900/10" : ""} ${hasPullHistory ? "cursor-pointer hover:bg-gray-800/50 transition-colors" : ""}`}
          onClick={() => hasPullHistory && toggleBossExpanded(boss.bossId)}
          title={hasPullHistory ? "Click to view pull progress chart" : ""}
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
            {hasPullHistory && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleBossExpanded(boss.bossId);
                }}
                className="text-gray-500 hover:text-gray-300 transition-colors p-1"
                title={isExpanded ? "Hide pull progress" : "Show pull progress"}
              >
                {isExpanded ? "▼" : "▶"}
              </button>
            )}
          </td>
        </tr>
        {isExpanded && hasPullHistory && (
          <tr className="border-b border-gray-800 bg-gray-900/50">
            <td colSpan={8} className="px-2 md:px-4 py-2 md:py-3">
              <PullProgressChart pullHistory={boss.pullHistory!} />
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
            <MobileBossCard key={boss.bossId} boss={boss} bossNumber={bossDisplayNumberMap.get(boss.bossId)!} />
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
            <tbody>{sortedBosses.map((boss) => renderBossRow(boss, bossDisplayNumberMap.get(boss.bossId)!))}</tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center overflow-y-auto z-50 p-2 md:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-lg shadow-2xl max-w-5xl w-full my-4 md:my-8 border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-3 md:px-6 py-3 md:py-4 flex items-center justify-between rounded-t-lg">
          <div>
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
          {guild.progress.length > 0 && selectedRaidId ? (
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
