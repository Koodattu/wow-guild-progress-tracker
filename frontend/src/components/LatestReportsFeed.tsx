"use client";

import Image from "next/image";
import { useMemo } from "react";
import type { GuildLatestReport, GuildLatestReportBossSummary, GuildLatestReportDifficulty, GuildLatestReportDifficultySummary } from "@/types";
import { formatTime, getIconUrl } from "@/lib/utils";
import { useSingleRowOverflow } from "@/lib/useSingleRowOverflow";
import { FaExternalLinkAlt } from "react-icons/fa";

interface LatestReportsFeedProps {
  reports: GuildLatestReport[];
}

function getReportDateTimeParts(report: GuildLatestReport): { startDate: string; startTime: string; endDate?: string; endTime?: string } {
  const start = new Date(report.startTime);
  const startDate = start.toLocaleDateString("fi-FI", {
    day: "2-digit",
    month: "2-digit",
  });
  const startTime = start.toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!report.endTime) {
    return { startDate, startTime };
  }

  const end = new Date(report.endTime);
  const endDate = end.toLocaleDateString("fi-FI", {
    day: "2-digit",
    month: "2-digit",
  });
  const endTime = end.toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (startDate === endDate) {
    return { startDate, startTime: `${startTime}-${endTime}` };
  }

  return { startDate, startTime, endDate, endTime };
}

function getDifficultyShortLabel(difficulty: GuildLatestReportDifficulty): string {
  switch (difficulty) {
    case "mythic":
      return "M";
    case "heroic":
      return "H";
    case "normal":
      return "N";
    case "lfr":
      return "L";
    default:
      return "?";
  }
}

function getDifficultyTextColor(difficulty: GuildLatestReportDifficulty): string {
  switch (difficulty) {
    case "mythic":
      return "text-orange-500";
    case "heroic":
      return "text-purple-500";
    case "normal":
      return "text-blue-400";
    case "lfr":
      return "text-green-400";
    default:
      return "text-gray-400";
  }
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatReportStats(report: GuildLatestReport): string {
  const duration = report.durationSeconds ? formatTime(report.durationSeconds) : report.isOngoing ? "Live" : "-";
  return `${report.fightCount} pulls / ${report.kills} kills / ${report.wipes} wipes / ${duration}`;
}

function formatDifficultyTitle(difficulty: GuildLatestReportDifficultySummary): string {
  return `${difficulty.difficulty}: ${pluralize(difficulty.pulls, "pull")}, ${pluralize(difficulty.kills, "kill")}, ${pluralize(difficulty.wipes, "wipe")}`;
}

function formatBossTitle(boss: GuildLatestReportBossSummary): string {
  const difficultyText = boss.difficulties.map(formatDifficultyTitle).join("; ");
  return `${boss.name}: ${pluralize(boss.pulls, "pull")}, ${pluralize(boss.kills, "kill")}, ${pluralize(boss.wipes, "wipe")}${difficultyText ? ` (${difficultyText})` : ""}`;
}

function getBossKey(reportCode: string, boss: GuildLatestReportBossSummary, index: number): string {
  const difficultySignature = boss.difficulties.map((difficulty) => `${difficulty.difficultyId}:${difficulty.pulls}:${difficulty.kills}:${difficulty.wipes}`).join(",");
  return [reportCode, boss.encounterID, index, boss.pulls, boss.kills, boss.wipes, difficultySignature].join("-");
}

function BossIcon({ boss }: { boss: GuildLatestReportBossSummary }) {
  const iconUrl = getIconUrl(boss.iconUrl);

  if (!iconUrl) {
    return <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-800 text-[10px] font-semibold text-gray-400">{boss.name.charAt(0)}</div>;
  }

  return <Image src={iconUrl} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded object-cover" />;
}

function BossDifficultyCounts({ difficulty }: { difficulty: GuildLatestReportDifficultySummary }) {
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap leading-none">
      <span className={`font-bold ${getDifficultyTextColor(difficulty.difficulty)}`}>{getDifficultyShortLabel(difficulty.difficulty)}</span>
      {difficulty.kills > 0 && <span className="font-semibold text-green-400">{difficulty.kills}</span>}
      <span className="font-semibold text-red-300">{difficulty.wipes}</span>
    </span>
  );
}

function BossChip({ boss, itemRef }: { boss: GuildLatestReportBossSummary; itemRef?: (node: HTMLDivElement | null) => void }) {
  const visibleDifficulties = boss.difficulties.slice(0, 2);

  return (
    <div ref={itemRef} title={formatBossTitle(boss)} className="flex shrink-0 items-center gap-1 rounded bg-gray-900/55 px-1.5 py-1">
      <BossIcon boss={boss} />
      <div className="flex min-w-0 flex-col gap-0.5 text-[10px]">
        {visibleDifficulties.length > 0 ? (
          visibleDifficulties.map((difficulty) => <BossDifficultyCounts key={`${boss.encounterID}-${difficulty.difficultyId}`} difficulty={difficulty} />)
        ) : (
          <span className="leading-none">
            {boss.kills > 0 && <span className="font-semibold text-green-400">{boss.kills}</span>}
            <span className="ml-0.5 font-semibold text-red-300">{boss.wipes}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function ReportBossList({ report }: { report: GuildLatestReport }) {
  const bossKeys = useMemo(() => report.bosses.map((boss, index) => getBossKey(report.code, boss, index)), [report.bosses, report.code]);
  const overflowCounts = useMemo(() => Array.from({ length: report.bosses.length }, (_, index) => index + 1), [report.bosses.length]);
  const { containerRef, visibleCount, registerItem, registerOverflowIndicator } = useSingleRowOverflow({ itemKeys: bossKeys, resetKey: report.code });

  if (report.bosses.length === 0) {
    return null;
  }

  const visibleBosses = report.bosses.slice(0, visibleCount);
  const hiddenBossCount = Math.max(0, report.bosses.length - visibleBosses.length);

  return (
    <div ref={containerRef} className="relative mt-2 flex min-w-0 flex-nowrap gap-1.5 overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] top-0 flex">
        {overflowCounts.map((count) => (
          <div key={count} ref={registerOverflowIndicator(count)} className="flex shrink-0 items-center justify-center rounded bg-gray-900/40 px-1.5 py-1 text-[10px] font-semibold text-gray-500">
            +{count}
          </div>
        ))}
      </div>

      {visibleBosses.map((boss, index) => (
        <BossChip key={bossKeys[index]} boss={boss} itemRef={registerItem(bossKeys[index])} />
      ))}
      {hiddenBossCount > 0 && <div className="flex shrink-0 items-center justify-center rounded bg-gray-900/40 px-1.5 py-1 text-[10px] font-semibold text-gray-500">+{hiddenBossCount}</div>}
    </div>
  );
}

function ReportDateTime({ report }: { report: GuildLatestReport }) {
  const { startDate, startTime, endDate, endTime } = getReportDateTimeParts(report);

  return (
    <div className="shrink-0 text-sm leading-tight text-gray-200">
      <span className="font-semibold text-white">{startDate}</span>
      <span> {startTime}</span>
      {endDate && endTime && (
        <>
          <span> - </span>
          <span className="font-semibold text-white">{endDate}</span>
          <span> {endTime}</span>
        </>
      )}
    </div>
  );
}

export default function LatestReportsFeed({ reports }: LatestReportsFeedProps) {
  if (reports.length === 0) {
    return null;
  }

  return (
    <section className="mb-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {reports.map((report) => {
          const raidIconUrl = getIconUrl(report.raidIconUrl);

          return (
            <a
              key={report.code}
              href={report.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded border border-gray-700/70 bg-gray-800/45 p-2.5 transition-colors hover:border-gray-600 hover:bg-gray-800/70"
              title={`Open ${report.raidName} report on Warcraft Logs`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {raidIconUrl && <Image src={raidIconUrl} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded object-cover" />}
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <ReportDateTime report={report} />
                      <div className="min-w-0 truncate text-[11px] text-gray-500">{formatReportStats(report)}</div>
                      {report.isOngoing && <span className="shrink-0 rounded bg-green-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-green-300">Live</span>}
                    </div>
                    <div className="truncate text-xs text-gray-400">{report.raidName}</div>
                  </div>
                </div>
                <FaExternalLinkAlt className="mt-0.5 h-3 w-3 shrink-0 text-gray-500 transition-colors group-hover:text-blue-400" aria-hidden="true" />
              </div>

              <ReportBossList report={report} />
            </a>
          );
        })}
      </div>
    </section>
  );
}
