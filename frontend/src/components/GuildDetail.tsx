"use client";

import { Guild, RaidProgress, BossProgress } from "@/types";
import { formatTime, formatPercent, getDifficultyColor, getKillLogUrl } from "@/lib/utils";

interface GuildDetailProps {
  guild: Guild;
  onClose: () => void;
}

export default function GuildDetail({ guild, onClose }: GuildDetailProps) {
  const handleBossClick = (boss: BossProgress) => {
    if (boss.firstKillReportCode && boss.firstKillFightId) {
      const url = getKillLogUrl(boss.firstKillReportCode, boss.firstKillFightId);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const renderBossRow = (boss: BossProgress) => {
    const isDefeated = boss.kills > 0;
    const hasKillLog = boss.firstKillReportCode && boss.firstKillFightId;
    const isClickable = isDefeated && hasKillLog;

    return (
      <tr
        key={boss.bossId}
        onClick={() => isClickable && handleBossClick(boss)}
        className={`border-b border-gray-800 ${isDefeated ? "bg-green-900/10" : ""} ${isClickable ? "cursor-pointer hover:bg-gray-800/50 transition-colors" : ""}`}
        title={isClickable ? "Click to view kill log on WarcraftLogs" : ""}
      >
        <td className="px-4 py-3 text-sm text-gray-400">{boss.killOrder || "-"}</td>
        <td className="px-4 py-3">
          <span className={isDefeated ? "text-green-400 font-semibold" : "text-white"}>
            {boss.bossName}
            {isClickable && <span className="ml-2 text-xs text-gray-500">🔗</span>}
          </span>
        </td>
        <td className="px-4 py-3 text-center text-sm">{isDefeated ? <span className="text-green-400">✓ {boss.kills}</span> : <span className="text-gray-500">-</span>}</td>
        <td className="px-4 py-3 text-center text-sm text-gray-300">{boss.pullCount || 0}</td>
        <td className="px-4 py-3 text-center text-sm text-gray-300">{boss.bestPercent < 100 ? formatPercent(boss.bestPercent) : "-"}</td>
        <td className="px-4 py-3 text-center text-sm text-gray-300">{boss.timeSpent > 0 ? formatTime(boss.timeSpent) : "-"}</td>
        <td className="px-4 py-3 text-center text-sm text-gray-400">{boss.firstKillTime ? new Date(boss.firstKillTime).toLocaleDateString("fi-FI") : "-"}</td>
      </tr>
    );
  };

  const renderProgressSection = (progress: RaidProgress) => {
    // Sort bosses: unkilled first, then killed bosses in reverse order (latest first)
    const sortedBosses = [...progress.bosses].sort((a, b) => {
      // Unkilled bosses (no kill order) should come first
      if (!a.killOrder && !b.killOrder) {
        // Both unkilled, sort by boss ID in reverse
        return b.bossId - a.bossId;
      }
      // If only a is unkilled, it comes first
      if (!a.killOrder) return -1;
      // If only b is unkilled, it comes first
      if (!b.killOrder) return -1;
      // Both have kill order, sort by that in reverse (highest first)
      return b.killOrder - a.killOrder;
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
            <tbody>{sortedBosses.map((boss) => renderBossRow(boss))}</tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center overflow-y-auto z-50 p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl max-w-5xl w-full my-8 border border-gray-700">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-lg">
          <div>
            <h2 className="text-2xl font-bold text-white">{guild.name}</h2>
            <p className="text-gray-400">
              {guild.realm} - {guild.region}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none px-3 py-1">
            ×
          </button>
        </div>

        <div className="px-6 py-6">
          {guild.progress.length > 0 ? (
            guild.progress
              .sort((a, b) => {
                // Sort by difficulty (mythic first)
                if (a.difficulty !== b.difficulty) {
                  return a.difficulty === "mythic" ? -1 : 1;
                }
                return 0;
              })
              .map((progress) => renderProgressSection(progress))
          ) : (
            <div className="text-center py-12 text-gray-500">No progress data available for this guild yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
