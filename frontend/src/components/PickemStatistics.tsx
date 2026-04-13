"use client";

import { useState, useMemo } from "react";
import { LeaderboardEntry, PickemType } from "@/types";

interface PickemStatisticsProps {
  leaderboard: LeaderboardEntry[];
  guildCount: number;
  type: PickemType;
}

const COLORS = [
  "#60A5FA",
  "#34D399",
  "#F59E0B",
  "#EF4444",
  "#A78BFA",
  "#F472B6",
  "#14B8A6",
  "#FB923C",
  "#6366F1",
  "#EC4899",
  "#84CC16",
  "#06B6D4",
  "#E879F9",
  "#FBBF24",
  "#4ADE80",
];

interface CombinationEntry {
  key: string;
  guilds: string[];
  count: number;
  percentage: number;
}

interface PositionDistribution {
  position: number;
  entries: { guild: string; count: number; percentage: number }[];
}

interface PieSlice {
  label: string;
  count: number;
  percentage: number;
  startAngle: number;
  endAngle: number;
  color: string;
}

function buildCombinations(leaderboard: LeaderboardEntry[], guildCount: number): CombinationEntry[] {
  const comboCounts = new Map<string, { guilds: string[]; count: number }>();

  for (const entry of leaderboard) {
    const sorted = [...entry.predictions].sort((a, b) => a.predictedRank - b.predictedRank);
    const guilds = sorted.slice(0, guildCount).map((p) => p.guildName);
    const key = guilds.join("|||");

    const existing = comboCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      comboCounts.set(key, { guilds, count: 1 });
    }
  }

  const total = leaderboard.length;
  return Array.from(comboCounts.values())
    .map((c) => ({
      key: c.guilds.join("|||"),
      guilds: c.guilds,
      count: c.count,
      percentage: (c.count / total) * 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

function buildPositionDistributions(leaderboard: LeaderboardEntry[], guildCount: number): PositionDistribution[] {
  const total = leaderboard.length;
  const distributions: PositionDistribution[] = [];

  for (let pos = 1; pos <= guildCount; pos++) {
    const guildCounts = new Map<string, number>();

    for (const entry of leaderboard) {
      const pred = entry.predictions.find((p) => p.predictedRank === pos);
      if (pred) {
        guildCounts.set(pred.guildName, (guildCounts.get(pred.guildName) || 0) + 1);
      }
    }

    const entries = Array.from(guildCounts.entries())
      .map(([guild, count]) => ({
        guild,
        count,
        percentage: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count);

    distributions.push({ position: pos, entries });
  }

  return distributions;
}

const OTHERS_COLOR = "#6B7280";

function buildGuildColorMap(leaderboard: LeaderboardEntry[]): Map<string, string> {
  const guildTotalPicks = new Map<string, number>();
  for (const entry of leaderboard) {
    for (const pred of entry.predictions) {
      guildTotalPicks.set(pred.guildName, (guildTotalPicks.get(pred.guildName) || 0) + 1);
    }
  }

  const sorted = Array.from(guildTotalPicks.entries()).sort((a, b) => b[1] - a[1]);
  const colorMap = new Map<string, string>();
  sorted.forEach(([guild], i) => {
    colorMap.set(guild, COLORS[i % COLORS.length]);
  });
  return colorMap;
}

function buildPieSlices(
  entries: { guild: string; count: number; percentage: number }[],
  colorMap: Map<string, string>
): PieSlice[] {
  const mainEntries: { label: string; count: number; percentage: number }[] = [];
  let othersCount = 0;
  let othersPercentage = 0;

  for (const e of entries) {
    if (e.percentage < 3) {
      othersCount += e.count;
      othersPercentage += e.percentage;
    } else {
      mainEntries.push({ label: e.guild, count: e.count, percentage: e.percentage });
    }
  }

  if (othersCount > 0) {
    mainEntries.push({ label: "Others", count: othersCount, percentage: othersPercentage });
  }

  let currentAngle = -90;
  return mainEntries.map((item) => {
    const angle = (item.percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    return {
      ...item,
      startAngle,
      endAngle,
      color: colorMap.get(item.label) || OTHERS_COLOR,
    };
  });
}

const PIE_SIZE = 120;
const PIE_CENTER = PIE_SIZE / 2;
const PIE_RADIUS = 55;

function polarToCartesian(angle: number, r: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    x: PIE_CENTER + r * Math.cos(rad),
    y: PIE_CENTER + r * Math.sin(rad),
  };
}

function createPieSlice(startAngle: number, endAngle: number, r: number) {
  const start = polarToCartesian(startAngle, r);
  const end = polarToCartesian(endAngle, r);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${PIE_CENTER} ${PIE_CENTER} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function PositionPieChart({ distribution, colorMap }: { distribution: PositionDistribution; colorMap: Map<string, string> }) {
  const slices = useMemo(() => buildPieSlices(distribution.entries, colorMap), [distribution.entries, colorMap]);
  const legendEntries = useMemo(() => distribution.entries.slice(0, 5), [distribution.entries]);

  const isSingleSlice = slices.length === 1 && slices[0].percentage >= 99.9;

  return (
    <div className="bg-gray-700/40 rounded-lg p-3 flex flex-col items-center gap-2">
      <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">#{distribution.position} Pick</span>

      <svg width={PIE_SIZE} height={PIE_SIZE} className="shrink-0">
        {isSingleSlice ? (
          <circle cx={PIE_CENTER} cy={PIE_CENTER} r={PIE_RADIUS} fill={slices[0].color} opacity={0.9}>
            <title>
              {slices[0].label}: {slices[0].count} ({slices[0].percentage.toFixed(1)}%)
            </title>
          </circle>
        ) : (
          slices.map((slice, i) => (
            <path key={i} d={createPieSlice(slice.startAngle, slice.endAngle, PIE_RADIUS)} fill={slice.color} opacity={0.9}>
              <title>
                {slice.label}: {slice.count} ({slice.percentage.toFixed(1)}%)
              </title>
            </path>
          ))
        )}
      </svg>

      <div className="w-full space-y-1">
        {legendEntries.map((entry) => (
          <div key={entry.guild} className="flex items-center gap-1.5 text-xs text-gray-300">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorMap.get(entry.guild) || OTHERS_COLOR }} />
            <span className="truncate flex-1 min-w-0">{entry.guild}</span>
            <span className="text-gray-500 shrink-0">{entry.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PickemStatistics({ leaderboard, guildCount, type }: PickemStatisticsProps) {
  const [expanded, setExpanded] = useState(false);

  const guildColorMap = useMemo(() => buildGuildColorMap(leaderboard), [leaderboard]);

  const combinations = useMemo(() => buildCombinations(leaderboard, guildCount), [leaderboard, guildCount]);

  const positionDistributions = useMemo(() => buildPositionDistributions(leaderboard, guildCount), [leaderboard, guildCount]);

  if (leaderboard.length < 2) {
    return null;
  }

  const gridCols = type === "rwf" ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5";

  return (
    <div>
      <button type="button" onClick={() => setExpanded((prev) => !prev)} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors px-2 py-1">
        <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        📊 Prediction Statistics
        <span className="text-xs text-gray-500">({leaderboard.length} participants)</span>
      </button>

      {expanded && (
        <div className="mt-2 bg-gray-800/50 rounded-lg p-5 border border-gray-700">
          {combinations.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Most Popular Combinations</h4>
              <div className="flex flex-col sm:flex-row gap-3">
                {combinations.map((combo, index) => (
                  <div key={combo.key} className="flex-1 bg-gray-700/40 rounded-lg p-3 border border-gray-600/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-white">#{index + 1}</span>
                      <span className="text-xs text-gray-400">
                        {combo.count} user{combo.count !== 1 ? "s" : ""} ({combo.percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="space-y-1">
                      {combo.guilds.map((guild, pos) => (
                        <div key={pos} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500 w-4 text-right shrink-0">{pos + 1}.</span>
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: guildColorMap.get(guild) || OTHERS_COLOR }} />
                          <span className="text-gray-200 truncate">{guild}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Pick Distribution by Position</h4>
            <div className={`grid gap-3 ${gridCols}`}>
              {positionDistributions.map((dist) => (
                <PositionPieChart key={dist.position} distribution={dist} colorMap={guildColorMap} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
