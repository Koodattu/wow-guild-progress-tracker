"use client";

import { GuildListItem, RaidProgressSummary } from "@/types";
import { formatTime, formatPercent, formatPhaseDisplay, getWorldRankColor, getLeaderboardRankColor, getRaiderIOGuildUrl } from "@/lib/utils";
import GuildCrest from "./GuildCrest";
import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";

interface GuildTableProps {
  guilds: GuildListItem[];
  onGuildClick: (guild: GuildListItem) => void;
  onRaidProgressClick: (guild: GuildListItem) => void;
  selectedRaidId: number | null;
}

export default function GuildTable({ guilds, onGuildClick, onRaidProgressClick, selectedRaidId }: GuildTableProps) {
  const t = useTranslations("guildTable");
  const [hoveredGuildInfoRow, setHoveredGuildInfoRow] = useState<string | null>(null);
  const [hoveredRaidProgressRow, setHoveredRaidProgressRow] = useState<string | null>(null);

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

  // Mobile card component for each guild
  const MobileGuildCard = ({ guild, index }: { guild: GuildListItem; index: number }) => {
    const mythicProgress = getLatestProgress(guild, "mythic");
    const heroicProgress = getLatestProgress(guild, "heroic");
    const mythicBestPull = getBestPullForProgress(mythicProgress);
    const mythicBestPullDisplay = getBestPullDisplayString(mythicProgress);
    const mythicPulls = getCurrentPullCount(mythicProgress);
    const guildRank = mythicProgress?.guildRank || heroicProgress?.guildRank || index + 1;
    const worldRank = mythicProgress?.worldRank || heroicProgress?.worldRank;
    const worldRankColor = mythicProgress?.worldRankColor || heroicProgress?.worldRankColor;
    const totalTime = (mythicProgress?.totalTimeSpent || 0) + (heroicProgress?.totalTimeSpent || 0);

    return (
      <div className={`bg-gray-800/50 rounded-lg mb-1.5 ${guild.isCurrentlyRaiding ? "border-l-2 border-l-green-500" : ""}`}>
        {/* Single row layout: Left tap zone (guild info) | Right tap zone (progress) */}
        <div className="flex items-center">
          {/* Left side: Rank + Guild info - navigates to guild page */}
          <div className="flex items-center gap-2 flex-1 min-w-0 p-2 cursor-pointer active:bg-gray-700/50 rounded-l-lg" onClick={() => onGuildClick(guild)}>
            {/* Rank section */}
            <div className="flex flex-col items-center shrink-0 w-8">
              <span className={`font-bold text-sm ${getLeaderboardRankColor(guildRank)}`}>#{guildRank}</span>
              {worldRank && <span className={`text-[10px] ${getWorldRankColor(worldRankColor)}`}>W{worldRank}</span>}
            </div>

            {/* Guild info */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <div className="w-7 h-7 shrink-0">
                <GuildCrest crest={guild.crest} faction={guild.faction} size={128} className="scale-[0.22] origin-top-left" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-semibold text-white text-xs truncate">{guild.name}</span>
                  {guild.isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0"></span>}
                  {guild.isCurrentlyRaiding && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0"></span>}
                </div>
                <div className="text-gray-500 text-[10px] truncate">
                  {guild.parent_guild ? `${guild.parent_guild} - ` : ""}
                  {guild.realm}
                </div>
              </div>
            </div>
          </div>

          {/* Right side: Progress - opens modal */}
          <div
            className="flex items-center gap-2 shrink-0 p-2 border-l border-gray-600 cursor-pointer active:bg-gray-700/50 rounded-r-lg"
            onClick={() => onRaidProgressClick(guild)}
          >
            <div className="text-center">
              <div className="text-orange-500 font-bold text-xs">{mythicProgress ? `${mythicProgress.bossesDefeated}/${mythicProgress.totalBosses}` : "-"}</div>
              <div className="text-[9px] text-gray-500">M</div>
            </div>
            <div className="text-center">
              <div className="text-purple-500 font-bold text-xs">{heroicProgress ? `${heroicProgress.bossesDefeated}/${heroicProgress.totalBosses}` : "-"}</div>
              <div className="text-[9px] text-gray-500">H</div>
            </div>
            <div className="text-center">
              <div className="text-gray-300 text-xs">{mythicPulls > 0 ? mythicPulls : "-"}</div>
              <div className="text-[9px] text-gray-500">{t("pulls")}</div>
            </div>
            <div className="text-center min-w-8">
              <div className="text-gray-300 text-xs">
                {mythicBestPullDisplay ? formatPhaseDisplay(mythicBestPullDisplay) : mythicBestPull > 0 ? formatPercent(mythicBestPull) : "-"}
              </div>
              <div className="text-[9px] text-gray-500">%</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile View - Card Layout */}
      <div className="md:hidden">
        {guilds.map((guild, index) => (
          <MobileGuildCard key={guild._id} guild={guild} index={index} />
        ))}
        {guilds.length === 0 && <div className="text-center py-12 text-gray-500">No guilds found. Add guilds to the config file and restart the server.</div>}
      </div>

      {/* Desktop View - Table Layout */}
      <div className="hidden md:block overflow-x-auto bg-gray-900 rounded-lg border border-gray-700">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/50">
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">{t("rank")}</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">{t("world")}</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">{t("guild")}</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">{t("schedule")}</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-orange-500 border-l-2 border-gray-700">{t("mythic")}</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-purple-500">{t("heroic")}</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">{t("pulls")}</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">{t("progress")}</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">{t("time")}</th>
            </tr>
          </thead>
          <tbody>
            {guilds.map((guild, index) => {
              const mythicProgress = getLatestProgress(guild, "mythic");
              const heroicProgress = getLatestProgress(guild, "heroic");
              const mythicBestPull = getBestPullForProgress(mythicProgress);
              const mythicBestPullDisplay = getBestPullDisplayString(mythicProgress);
              const mythicPulls = getCurrentPullCount(mythicProgress);

              // Get guild rank - prefer mythic, fall back to heroic, then use display order
              const guildRank = mythicProgress?.guildRank || heroicProgress?.guildRank || index + 1;

              // Get world rank - prefer mythic, fall back to heroic
              const worldRank = mythicProgress?.worldRank || heroicProgress?.worldRank;
              const worldRankColor = mythicProgress?.worldRankColor || heroicProgress?.worldRankColor;

              return (
                <tr key={guild._id} className={`border-b border-gray-800 ${guild.isCurrentlyRaiding ? "border-l-4 border-l-green-500" : ""}`}>
                  {/* First clickable area: Rank, World Rank, and Guild Name */}
                  <td
                    className={`px-4 py-3 text-center cursor-pointer transition-colors ${hoveredGuildInfoRow === guild._id ? "bg-gray-800/30" : ""}`}
                    onClick={() => onGuildClick(guild)}
                    onMouseEnter={() => setHoveredGuildInfoRow(guild._id)}
                    onMouseLeave={() => setHoveredGuildInfoRow(null)}
                  >
                    <span className={`font-semibold ${getLeaderboardRankColor(guildRank)}`}>{guildRank}</span>
                  </td>
                  <td
                    className={`px-4 py-3 cursor-pointer transition-colors ${hoveredGuildInfoRow === guild._id ? "bg-gray-800/30" : ""}`}
                    onClick={() => onGuildClick(guild)}
                    onMouseEnter={() => setHoveredGuildInfoRow(guild._id)}
                    onMouseLeave={() => setHoveredGuildInfoRow(null)}
                  >
                    {worldRank ? <span className={`font-semibold ${getWorldRankColor(worldRankColor)}`}>{worldRank}</span> : <span className="text-gray-500">-</span>}
                  </td>
                  <td
                    className={`px-4 py-3 cursor-pointer transition-colors ${hoveredGuildInfoRow === guild._id ? "bg-gray-800/30" : ""}`}
                    onClick={() => onGuildClick(guild)}
                    onMouseEnter={() => setHoveredGuildInfoRow(guild._id)}
                    onMouseLeave={() => setHoveredGuildInfoRow(null)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 shrink-0">
                        <GuildCrest crest={guild.crest} faction={guild.faction} size={128} className="scale-[0.33] origin-top-left" />
                      </div>
                      <span className="font-semibold text-white">
                        {guild.parent_guild ? (
                          <>
                            {guild.name}
                            <span className="text-gray-400 font-thin text-sm">
                              {" "}
                              ({guild.parent_guild}-{guild.realm}){" "}
                            </span>
                          </>
                        ) : (
                          <>
                            {guild.name}
                            <span className="text-gray-400 font-thin text-sm">-{guild.realm}</span>
                          </>
                        )}
                      </span>
                      {guild.warcraftlogsId && (
                        <a
                          href={`https://www.warcraftlogs.com/guild/id/${guild.warcraftlogsId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center w-5 h-5 hover:opacity-80 transition-opacity"
                          title={t("viewOnWarcraftLogs")}
                        >
                          <Image src="/wcl-logo.png" alt="WCL" width={20} height={20} className="w-full h-full object-contain" />
                        </a>
                      )}
                      <a
                        href={getRaiderIOGuildUrl(guild.region, guild.realm, guild.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center justify-center w-5 h-5 hover:opacity-80 transition-opacity"
                        title={t("viewOnRaiderIO")}
                      >
                        <Image src="/raiderio-logo.png" alt="Raider.IO" width={20} height={20} className="w-full h-full object-contain" />
                      </a>
                      {guild.isStreaming && (
                        <span className="text-xs px-2 py-0.5 rounded bg-purple-900/50 text-purple-300 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                          {t("live")}
                        </span>
                      )}
                      {guild.isCurrentlyRaiding && <span className="text-xs px-2 py-0.5 rounded bg-green-900/50 text-green-300 font-semibold">{t("raiding")}</span>}
                    </div>
                  </td>
                  <td
                    className={`px-4 py-3 text-center text-sm text-gray-300 cursor-pointer transition-colors ${hoveredGuildInfoRow === guild._id ? "bg-gray-800/30" : ""}`}
                    onClick={() => onGuildClick(guild)}
                    onMouseEnter={() => setHoveredGuildInfoRow(guild._id)}
                    onMouseLeave={() => setHoveredGuildInfoRow(null)}
                  >
                    {guild.scheduleDisplay ? `${guild.scheduleDisplay.totalDays}D x ${guild.scheduleDisplay.averageHours}h` : "-"}
                  </td>

                  {/* Second clickable area: Raid Progress columns */}
                  <td
                    className={`px-4 py-3 text-center cursor-pointer transition-colors border-l-2 border-gray-700 ${hoveredRaidProgressRow === guild._id ? "bg-gray-800/30" : ""}`}
                    onClick={() => onRaidProgressClick(guild)}
                    onMouseEnter={() => setHoveredRaidProgressRow(guild._id)}
                    onMouseLeave={() => setHoveredRaidProgressRow(null)}
                  >
                    <span className="text-orange-500 font-semibold">{mythicProgress ? `${mythicProgress.bossesDefeated}/${mythicProgress.totalBosses}` : "-"}</span>
                  </td>
                  <td
                    className={`px-4 py-3 text-center cursor-pointer transition-colors ${hoveredRaidProgressRow === guild._id ? "bg-gray-800/30" : ""}`}
                    onClick={() => onRaidProgressClick(guild)}
                    onMouseEnter={() => setHoveredRaidProgressRow(guild._id)}
                    onMouseLeave={() => setHoveredRaidProgressRow(null)}
                  >
                    <span className="text-purple-500 font-semibold">{heroicProgress ? `${heroicProgress.bossesDefeated}/${heroicProgress.totalBosses}` : "-"}</span>
                  </td>
                  <td
                    className={`px-4 py-3 text-center text-sm text-gray-300 cursor-pointer transition-colors ${hoveredRaidProgressRow === guild._id ? "bg-gray-800/30" : ""}`}
                    onClick={() => onRaidProgressClick(guild)}
                    onMouseEnter={() => setHoveredRaidProgressRow(guild._id)}
                    onMouseLeave={() => setHoveredRaidProgressRow(null)}
                  >
                    {mythicPulls > 0 ? mythicPulls : "-"}
                  </td>
                  <td
                    className={`px-4 py-3 text-center text-sm text-gray-300 cursor-pointer transition-colors ${hoveredRaidProgressRow === guild._id ? "bg-gray-800/30" : ""}`}
                    onClick={() => onRaidProgressClick(guild)}
                    onMouseEnter={() => setHoveredRaidProgressRow(guild._id)}
                    onMouseLeave={() => setHoveredRaidProgressRow(null)}
                  >
                    {mythicBestPullDisplay ? formatPhaseDisplay(mythicBestPullDisplay) : mythicBestPull > 0 ? formatPercent(mythicBestPull) : "-"}
                  </td>
                  <td
                    className={`px-4 py-3 text-center text-sm text-gray-300 cursor-pointer transition-colors ${hoveredRaidProgressRow === guild._id ? "bg-gray-800/30" : ""}`}
                    onClick={() => onRaidProgressClick(guild)}
                    onMouseEnter={() => setHoveredRaidProgressRow(guild._id)}
                    onMouseLeave={() => setHoveredRaidProgressRow(null)}
                  >
                    {mythicProgress ? formatTime(mythicProgress.totalTimeSpent) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {guilds.length === 0 && <div className="text-center py-12 text-gray-500">No guilds found. Add guilds to the config file and restart the server.</div>}
      </div>
    </>
  );
}
