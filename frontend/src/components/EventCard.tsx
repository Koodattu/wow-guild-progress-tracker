"use client";

import { Event } from "@/types";
import { formatPhaseDisplay, getTimeAgo } from "@/lib/utils";

interface EventCardProps {
  event: Event;
  className?: string;
}

// Format event message without difficulty
function formatEventMessageWithoutDifficulty(event: {
  type: string;
  guildName: string;
  bossName: string;
  data: { pullCount?: number; bestPercent?: number; progressDisplay?: string };
}): string {
  const { type, guildName, bossName, data } = event;

  if (type === "boss_kill") {
    const pulls = data.pullCount || 0;
    return `${guildName} defeated ${bossName} after ${pulls} pull${pulls !== 1 ? "s" : ""}!`;
  }

  if (type === "best_pull") {
    // Use progressDisplay if available (includes phase info), otherwise fall back to simple percent
    if (data.progressDisplay) {
      return `${guildName} reached ${formatPhaseDisplay(data.progressDisplay)} on ${bossName}!`;
    }
    const percent = data.bestPercent || 0;
    return `${guildName} reached ${percent.toFixed(1)}% on ${bossName}!`;
  }

  if (type === "hiatus") {
    return `${guildName} has not raided for 7 days.`;
  }

  if (type === "regress") {
    return `${guildName} had no progress during their raid.`;
  }

  if (type === "reproge") {
    const pulls = data.pullCount || 0;
    return `${guildName} re-killed ${bossName} after ${pulls} pull${pulls !== 1 ? "s" : ""}!`;
  }

  return `${guildName} - ${bossName}`;
}

// Get display text for event type
function getEventTypeDisplay(type: string): string {
  switch (type) {
    case "boss_kill":
      return "Kill";
    case "best_pull":
      return "Progress";
    case "hiatus":
      return "Hiatus";
    case "regress":
      return "Regress";
    case "reproge":
      return "Reproge";
    default:
      return type;
  }
}

// Get color for event type badge
function getEventTypeColor(type: string): string {
  switch (type) {
    case "boss_kill":
      return "text-green-400";
    case "best_pull":
      return "text-blue-400";
    case "hiatus":
      return "text-gray-400";
    case "regress":
      return "text-red-400";
    case "reproge":
      return "text-yellow-400";
    default:
      return "text-gray-400";
  }
}

export default function EventCard({ event, className = "" }: EventCardProps) {
  const difficultyColor = event.difficulty === "mythic" ? "text-orange-500" : "text-purple-500";
  const borderColor = event.difficulty === "mythic" ? "#f97316" : "#a855f7";
  const eventTypeColor = getEventTypeColor(event.type);
  const eventTypeText = getEventTypeDisplay(event.type);

  return (
    <div className={`border-l-4 bg-gray-800/50 px-4 py-4 rounded hover:bg-gray-800/70 transition-colors ${className}`} style={{ borderLeftColor: borderColor }}>
      <div className="flex flex-col h-full justify-between gap-3">
        <div>
          <div className="flex items-start justify-between mb-2">
            <div className={`${difficultyColor} text-xs font-semibold uppercase`}>{event.difficulty}</div>
            <div className={`${eventTypeColor} text-xs font-semibold uppercase`}>{eventTypeText}</div>
          </div>
          <p className="text-white text-sm leading-relaxed">{formatEventMessageWithoutDifficulty(event)}</p>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">{event.raidName}</span>
          <span className="text-gray-500 whitespace-nowrap ml-2">{getTimeAgo(event.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
