"use client";

import { PhaseDistribution } from "@/types";

interface PhaseDistributionChartProps {
  phaseDistribution: PhaseDistribution[];
}

export default function PhaseDistributionChart({ phaseDistribution }: PhaseDistributionChartProps) {
  if (!phaseDistribution || phaseDistribution.length === 0) {
    return null;
  }

  // If only one phase, don't show the pie chart
  if (phaseDistribution.length === 1) {
    return null;
  }

  const totalPulls = phaseDistribution.reduce((sum, item) => sum + item.count, 0);

  // Define distinct colors for phases
  const colors = [
    "#60A5FA", // Blue
    "#34D399", // Green
    "#F59E0B", // Amber
    "#EF4444", // Red
    "#A78BFA", // Purple
    "#F472B6", // Pink
    "#14B8A6", // Teal
    "#FB923C", // Orange
    "#6366F1", // Indigo
    "#EC4899", // Hot pink
  ];

  // Calculate angles for each phase
  let currentAngle = -90; // Start at top (-90 degrees)
  const slices = phaseDistribution.map((item, index) => {
    const percentage = (item.count / totalPulls) * 100;
    const angle = (percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    return {
      ...item,
      percentage,
      startAngle,
      endAngle,
      color: colors[index % colors.length],
    };
  });

  // SVG pie chart dimensions (smaller size)
  const size = 135;
  const center = size / 2;
  const radius = 65;
  const labelRadius = radius * 0.6; // Position labels inside the slices

  // Convert polar coordinates to cartesian
  const polarToCartesian = (angle: number, r: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: center + r * Math.cos(rad),
      y: center + r * Math.sin(rad),
    };
  };

  // Create SVG path for pie slice
  const createPieSlice = (startAngle: number, endAngle: number, radius: number) => {
    const start = polarToCartesian(startAngle, radius);
    const end = polarToCartesian(endAngle, radius);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return `M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
  };

  return (
    <div className="w-full bg-gray-800/30 rounded p-2 flex items-center justify-center">
      {/* Pie Chart */}
      <svg width={size} height={size} className="shrink-0">
        {slices.map((slice, index) => (
          <g key={index}>
            <path d={createPieSlice(slice.startAngle, slice.endAngle, radius)} fill={slice.color} opacity={0.9}>
              <title>
                {slice.phase}: {slice.count} pulls ({slice.percentage.toFixed(1)}%)
              </title>
            </path>
            {/* Label with phase name inside the slice */}
            {slice.percentage >= 3 && (
              <text
                x={polarToCartesian((slice.startAngle + slice.endAngle) / 2, labelRadius).x}
                y={polarToCartesian((slice.startAngle + slice.endAngle) / 2, labelRadius).y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-xs fill-white font-bold pointer-events-none"
                style={{ textShadow: "0 0 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)" }}
              >
                {slice.phase}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
