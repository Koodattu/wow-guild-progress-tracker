"use client";

import { Event } from "@/types";
import { getTimeAgo } from "@/lib/utils";
import EventMessage from "@/components/EventMessage";

interface EventCardProps {
  event: Event;
  className?: string;
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
    <div className={`border-l-4 bg-gray-800/50 px-3 md:px-4 py-3 md:py-4 rounded hover:bg-gray-800/70 transition-colors ${className}`} style={{ borderLeftColor: borderColor }}>
      <div className="flex flex-col h-full justify-between gap-2 md:gap-3">
        <div>
          <div className="flex items-start justify-between mb-1.5 md:mb-2">
            <div className={`${difficultyColor} text-xs font-semibold uppercase`}>{event.difficulty}</div>
            <div className={`${eventTypeColor} text-xs font-semibold uppercase`}>{eventTypeText}</div>
          </div>
          <div className="text-white text-xs md:text-sm leading-relaxed">
            <EventMessage event={event} />
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 truncate">{event.raidName}</span>
          <span className="text-gray-500 whitespace-nowrap ml-2">{getTimeAgo(event.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
