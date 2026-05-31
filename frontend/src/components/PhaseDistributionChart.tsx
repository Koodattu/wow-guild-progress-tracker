"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PhaseDistribution } from "@/types";

interface PhaseDistributionChartProps {
  phaseDistribution: PhaseDistribution[];
}

type PhaseChartEntry = Record<string, string | number> & PhaseDistribution & {
  percentage: number;
  color: string;
};

type PhaseTooltipPayload = {
  payload?: PhaseChartEntry;
};

type PhaseTooltipProps = {
  active?: boolean;
  payload?: PhaseTooltipPayload[];
};

const PHASE_COLORS = [
  "#60A5FA",
  "#34D399",
  "#F59E0B",
  "#EF4444",
  "#A78BFA",
  "#F472B6",
  "#14B8A6",
  "#FB923C",
  "#818CF8",
  "#EC4899",
];

function PhaseTooltip({ active, payload }: PhaseTooltipProps) {
  const phase = payload?.[0]?.payload;
  if (!active || !phase) return null;

  return (
    <div className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-white">{phase.phase}</div>
      <div className="mt-1 text-gray-400">
        <span className="text-gray-200">{phase.count}</span> pulls ({phase.percentage.toFixed(1)}%)
      </div>
    </div>
  );
}

export default function PhaseDistributionChart({ phaseDistribution }: PhaseDistributionChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!phaseDistribution || phaseDistribution.length <= 1) {
    return null;
  }

  const totalPulls = phaseDistribution.reduce((sum, item) => sum + item.count, 0);
  if (totalPulls <= 0) return null;

  const chartData: PhaseChartEntry[] = phaseDistribution.map((item, index) => ({
    ...item,
    percentage: (item.count / totalPulls) * 100,
    color: PHASE_COLORS[index % PHASE_COLORS.length],
  }));

  return (
    <div className="w-full px-1.5 pb-0.5 pt-0 [&_*:focus-visible]:outline-none [&_*:focus]:outline-none [&_.recharts-surface]:outline-none" onMouseDown={(event) => event.preventDefault()}>
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<PhaseTooltip />} />
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="phase"
              outerRadius="82%"
              paddingAngle={2}
              stroke="#111827"
              strokeWidth={1}
              isAnimationActive={false}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={entry.phase}
                  fill={entry.color}
                  opacity={activeIndex == null || activeIndex === index ? 0.95 : 0.45}
                  stroke={activeIndex === index ? "#F9FAFB" : "#111827"}
                  strokeWidth={activeIndex === index ? 2 : 1}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-x-1.5 gap-y-0.5 text-[10px] text-gray-300">
        {chartData.map((entry) => (
          <div key={entry.phase} className="flex min-w-0 items-center justify-start gap-1">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: entry.color }} />
            <span className="min-w-0 truncate">{entry.phase}</span>
            <span className="shrink-0 tabular-nums text-gray-500">{entry.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
