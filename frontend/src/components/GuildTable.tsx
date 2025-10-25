"use client";

import { GuildListItem, RaidProgressSummary } from "@/types";
import { formatTime, formatPercent, formatPhaseDisplay } from "@/lib/utils";

interface GuildTableProps {
  guilds: GuildListItem[];
  onGuildClick: (guild: GuildListItem) => void;
  selectedRaidId: number | null;
}

export default function GuildTable({ guilds, onGuildClick, selectedRaidId }: GuildTableProps) {
  const getLatestProgress = (guild: GuildListItem, difficulty: "mythic" | "heroic"): RaidProgressSummary | null => {
    if (!selectedRaidId) return null;
    return guild.progress.find((p) => p.difficulty === difficulty && p.raidId === selectedRaidId) || null;
  };

  const getBestPullForProgress = (progress: RaidProgressSummary | null): number => {
    if (!progress) return 0;
    return progress.bestPullPercent || 0;
  };

  const getBestPullDisplayString = (progress: RaidProgressSummary | null): string => {
    if (!progress) return "";
    return progress.bestPullPhase?.displayString || "";
  };

  const getCurrentPullCount = (progress: RaidProgressSummary | null): number => {
    if (!progress) return 0;
    return progress.currentBossPulls || 0;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-700 bg-gray-800/50">
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Rank</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Guild</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Realm</th>
            <th className="px-4 py-3 text-center text-sm font-semibold text-orange-500">Mythic</th>
            <th className="px-4 py-3 text-center text-sm font-semibold text-purple-500">Heroic</th>
            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">Current Boss Pulls</th>
            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">Best Pull %</th>
            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">Time Spent</th>
          </tr>
        </thead>
        <tbody>
          {guilds.map((guild, index) => {
            const mythicProgress = getLatestProgress(guild, "mythic");
            const heroicProgress = getLatestProgress(guild, "heroic");
            const mythicBestPull = getBestPullForProgress(mythicProgress);
            const mythicBestPullDisplay = getBestPullDisplayString(mythicProgress);
            const mythicPulls = getCurrentPullCount(mythicProgress);

            return (
              <tr key={guild._id} onClick={() => onGuildClick(guild)} className="border-b border-gray-800 hover:bg-gray-800/30 cursor-pointer transition-colors">
                <td className="px-4 py-3 text-sm text-gray-400">{index + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{guild.name}</span>
                    {guild.faction && (
                      <span className={`text-xs px-2 py-0.5 rounded ${guild.faction === "Alliance" ? "bg-blue-900/50 text-blue-300" : "bg-red-900/50 text-red-300"}`}>
                        {guild.faction}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">{guild.realm}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-orange-500 font-semibold">{mythicProgress ? `${mythicProgress.bossesDefeated}/${mythicProgress.totalBosses}` : "-"}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-purple-500 font-semibold">{heroicProgress ? `${heroicProgress.bossesDefeated}/${heroicProgress.totalBosses}` : "-"}</span>
                </td>
                <td className="px-4 py-3 text-center text-sm text-gray-300">{mythicPulls > 0 ? mythicPulls : "-"}</td>
                <td className="px-4 py-3 text-center text-sm text-gray-300">
                  {mythicBestPullDisplay ? formatPhaseDisplay(mythicBestPullDisplay) : mythicBestPull > 0 ? formatPercent(mythicBestPull) : "-"}
                </td>
                <td className="px-4 py-3 text-center text-sm text-gray-300">{mythicProgress ? formatTime(mythicProgress.totalTimeSpent) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {guilds.length === 0 && <div className="text-center py-12 text-gray-500">No guilds found. Add guilds to the config file and restart the server.</div>}
    </div>
  );
}
