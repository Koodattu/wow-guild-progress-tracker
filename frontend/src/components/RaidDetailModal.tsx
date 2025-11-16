"use client";

import { Guild, RaidProgress, BossProgress, RaidInfo, Boss } from "@/types";
import { formatTime, formatPercent, getDifficultyColor, getKillLogUrl, formatPhaseDisplay } from "@/lib/utils";
import IconImage from "./IconImage";

interface RaidDetailModalProps {
  guild: Guild;
  onClose: () => void;
  selectedRaidId: number | null;
  raids: RaidInfo[];
  bosses: Boss[];
}

export default function RaidDetailModal({ guild, onClose, selectedRaidId, raids, bosses }: RaidDetailModalProps) {
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

  const renderBossRow = (boss: BossProgress, bossNumber: number) => {
    const isDefeated = boss.kills > 0;
    const hasKillLog = boss.firstKillReportCode && boss.firstKillFightId;
    const hasBestPullLog = boss.bestPullReportCode && boss.bestPullFightId;
    const isClickable = (isDefeated && hasKillLog) || (!isDefeated && hasBestPullLog);
    const bossIconFilename = getBossIconUrl(boss.bossName);

    return (
      <tr
        key={boss.bossId}
        onClick={() => isClickable && handleBossClick(boss)}
        className={`border-b border-gray-800 ${isDefeated ? "bg-green-900/10" : ""} ${isClickable ? "cursor-pointer hover:bg-gray-800/50 transition-colors" : ""}`}
        title={isClickable ? (isDefeated ? "Click to view kill log on WarcraftLogs" : "Click to view best pull log on WarcraftLogs") : ""}
      >
        <td className="px-4 py-3 text-sm text-gray-400">{bossNumber}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <IconImage iconFilename={bossIconFilename} alt={`${boss.bossName} icon`} width={32} height={32} className="rounded" />
            <span className={isDefeated ? "text-green-400 font-semibold" : "text-white"}>
              {boss.bossName}
              {isClickable && <span className="ml-2 text-xs text-gray-500">🔗</span>}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-center text-sm">{isDefeated ? <span className="text-white">{boss.kills}</span> : <span className="text-gray-500">-</span>}</td>
        <td className="px-4 py-3 text-center text-sm text-gray-300">{boss.pullCount || 0}</td>
        <td className="px-4 py-3 text-center text-sm">
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
        <td className="px-4 py-3 text-center text-sm text-gray-300">{boss.timeSpent > 0 ? formatTime(boss.timeSpent) : "-"}</td>
        <td className="px-4 py-3 text-center text-sm text-gray-400">{boss.firstKillTime ? new Date(boss.firstKillTime).toLocaleDateString("fi-FI") : "-"}</td>
      </tr>
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
      <div key={`${progress.raidId}-${progress.difficulty}`} className="mb-8">
        <h3 className={`text-xl font-bold mb-4 ${getDifficultyColor(progress.difficulty)}`}>
          {progress.raidName} - {progress.difficulty.charAt(0).toUpperCase() + progress.difficulty.slice(1)}
        </h3>
        <div className="mb-4 flex gap-6">
          <div>
            <span className="text-gray-400">Progress: </span>
            <span className="text-white font-semibold">
              {progress.bossesDefeated}/{progress.totalBosses}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Total Time: </span>
            <span className="text-white font-semibold">{formatTime(progress.totalTimeSpent)}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/50">
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">#</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-300">Boss</th>
                <th className="px-4 py-2 text-center text-sm font-semibold text-gray-300">Kills</th>
                <th className="px-4 py-2 text-center text-sm font-semibold text-gray-300">Pulls</th>
                <th className="px-4 py-2 text-center text-sm font-semibold text-gray-300">Best %</th>
                <th className="px-4 py-2 text-center text-sm font-semibold text-gray-300">Time</th>
                <th className="px-4 py-2 text-center text-sm font-semibold text-gray-300">First Kill</th>
              </tr>
            </thead>
            <tbody>{sortedBosses.map((boss) => renderBossRow(boss, bossDisplayNumberMap.get(boss.bossId)!))}</tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center overflow-y-auto z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-lg shadow-2xl max-w-5xl w-full my-8 border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-lg">
          <div>
            <h2 className="text-2xl font-bold text-white">
              {guild.name}
              <span className="text-gray-400 font-normal"> - {guild.realm}</span>
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none px-3 py-1">
            ×
          </button>
        </div>

        <div className="px-6 py-6">
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
