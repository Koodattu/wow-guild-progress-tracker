"use client";

import { Event } from "@/types";
import { getDifficultyColor, getTimeAgo } from "@/lib/utils";
import EventMessage, { WatchButton } from "@/components/EventMessage";

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

// Get text color for event type badge
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

function getEventTypeBorderColor(type: string): string {
  switch (type) {
    case "boss_kill":
      return "#4ade80";
    case "best_pull":
      return "#60a5fa";
    case "hiatus":
      return "#9ca3af";
    case "regress":
      return "#f87171";
    case "reproge":
      return "#facc15";
    default:
      return "#9ca3af";
  }
}

export default function EventCard({ event, className = "" }: EventCardProps) {
  const showDifficulty = event.type !== "hiatus";
  const difficultyColor = getDifficultyColor(event.difficulty);
  const eventTypeColor = getEventTypeColor(event.type);
  const eventTypeBorderColor = getEventTypeBorderColor(event.type);
  const eventTypeText = getEventTypeDisplay(event.type);

  return (
    <div
      className={`border-l-4 bg-gray-800/50 px-3 md:px-4 py-2.5 md:py-3 rounded hover:bg-gray-800/70 transition-colors ${className}`}
      style={{ borderLeftColor: eventTypeBorderColor }}
    >
      <div className="flex h-full flex-col gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`${eventTypeColor} font-semibold uppercase`}>{eventTypeText}</span>
            <span className="min-w-0 truncate text-gray-500">{getTimeAgo(event.timestamp)}</span>
          </div>
          <div className="justify-self-center">
            <WatchButton event={event} />
          </div>
          <div className="justify-self-end">{showDifficulty && <span className={`${difficultyColor} font-semibold uppercase`}>{event.difficulty}</span>}</div>
        </div>
        <div className="text-white text-xs md:text-sm leading-relaxed">
          <EventMessage event={event} />
        </div>
      </div>
    </div>
  );
}
