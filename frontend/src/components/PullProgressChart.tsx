"use client";

import { PullHistoryEntry } from "@/types";

interface PullProgressChartProps {
  pullHistory: PullHistoryEntry[];
}

export default function PullProgressChart({ pullHistory }: PullProgressChartProps) {
  if (!pullHistory || pullHistory.length === 0) {
    return null;
  }

  // Use a wide aspect ratio viewBox for full width usage
  const viewBoxWidth = 1000;
  const viewBoxHeight = 100;
  const padding = { top: 15, right: 15, bottom: 20, left: 35 };
  const chartWidth = viewBoxWidth - padding.left - padding.right;
  const chartHeight = viewBoxHeight - padding.top - padding.bottom;

  const maxPulls = pullHistory.length;

  const getX = (pullNumber: number) => {
    if (maxPulls === 1) return padding.left + chartWidth / 2;
    return padding.left + ((pullNumber - 1) / (maxPulls - 1)) * chartWidth;
  };

  const getY = (fightPercentage: number) => {
    // 100% at top, 0% at bottom (normal orientation)
    // fightPercentage 100 = top of chart, fightPercentage 0 = bottom of chart
    return padding.top + ((100 - fightPercentage) / 100) * chartHeight;
  };

  // Build path
  const pathData = pullHistory
    .map((pull, index) => {
      const x = getX(pull.pullNumber);
      const y = getY(pull.fightPercentage);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  // Find kill point if exists
  const killPoint = pullHistory.find((p) => p.isKill);

  // Calculate point radius based on number of pulls (smaller for more pulls)
  const pointRadius = Math.max(1.5, Math.min(3, 80 / maxPulls));
  const killPointRadius = pointRadius * 1.8;

  // Generate dynamic X-axis tick marks
  const getXAxisTicks = (): number[] => {
    if (maxPulls <= 5) {
      // Show all pulls for small counts
      return Array.from({ length: maxPulls }, (_, i) => i + 1);
    } else if (maxPulls <= 20) {
      // Show every 5th pull
      const ticks = [1];
      for (let i = 5; i <= maxPulls; i += 5) {
        ticks.push(i);
      }
      if (ticks[ticks.length - 1] !== maxPulls) ticks.push(maxPulls);
      return ticks;
    } else if (maxPulls <= 50) {
      // Show every 10th pull
      const ticks = [1];
      for (let i = 10; i <= maxPulls; i += 10) {
        ticks.push(i);
      }
      if (ticks[ticks.length - 1] !== maxPulls) ticks.push(maxPulls);
      return ticks;
    } else if (maxPulls <= 100) {
      // Show every 20th pull
      const ticks = [1];
      for (let i = 20; i <= maxPulls; i += 20) {
        ticks.push(i);
      }
      if (ticks[ticks.length - 1] !== maxPulls) ticks.push(maxPulls);
      return ticks;
    } else {
      // Show every 50th pull for large counts
      const ticks = [1];
      for (let i = 50; i <= maxPulls; i += 50) {
        ticks.push(i);
      }
      if (ticks[ticks.length - 1] !== maxPulls) ticks.push(maxPulls);
      return ticks;
    }
  };

  const xAxisTicks = getXAxisTicks();

  return (
    <div className="w-full bg-gray-800/30 rounded">
      <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {[0, 50, 100].map((percent) => (
          <line
            key={percent}
            x1={padding.left}
            y1={getY(percent)}
            x2={padding.left + chartWidth}
            y2={getY(percent)}
            stroke="#374151"
            strokeWidth="0.5"
            strokeDasharray={percent === 0 ? "none" : "3,3"}
            opacity={0.5}
          />
        ))}

        {/* Y-axis labels - 100% at top, 0% at bottom */}
        <text x={padding.left - 5} y={getY(100)} fontSize="9" fill="#6B7280" textAnchor="end" dominantBaseline="middle">
          100%
        </text>
        <text x={padding.left - 5} y={getY(50)} fontSize="9" fill="#6B7280" textAnchor="end" dominantBaseline="middle">
          50%
        </text>
        <text x={padding.left - 5} y={getY(0)} fontSize="9" fill="#6B7280" textAnchor="end" dominantBaseline="middle">
          0%
        </text>

        {/* X-axis labels - dynamic ticks */}
        {xAxisTicks.map((pullNum) => (
          <text key={pullNum} x={getX(pullNum)} y={viewBoxHeight - 5} fontSize="8" fill="#6B7280" textAnchor="middle">
            {pullNum}
          </text>
        ))}

        {/* Progress line */}
        <path d={pathData} fill="none" stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points - only show if not too many */}
        {maxPulls <= 80 &&
          pullHistory.map((pull) => (
            <circle
              key={pull.pullNumber}
              cx={getX(pull.pullNumber)}
              cy={getY(pull.fightPercentage)}
              r={pull.isKill ? killPointRadius : pointRadius}
              fill={pull.isKill ? "#22C55E" : "#60A5FA"}
            >
              <title>
                Pull {pull.pullNumber}: {pull.fightPercentage.toFixed(1)}%{pull.phase ? ` (${pull.phase})` : ""}
                {pull.isKill ? " - KILL!" : ""}
              </title>
            </circle>
          ))}
      </svg>
    </div>
  );
}
