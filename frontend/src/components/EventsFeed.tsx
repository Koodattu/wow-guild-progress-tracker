"use client";

import { Event } from "@/types";
import { formatEventMessage, getTimeAgo } from "@/lib/utils";

interface EventsFeedProps {
  events: Event[];
}

export default function EventsFeed({ events }: EventsFeedProps) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Latest Events</h2>

      {events.length > 0 ? (
        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event._id}
              className="border-l-4 border-gray-600 bg-gray-800/50 px-4 py-3 hover:bg-gray-800/70 transition-colors"
              style={{
                borderLeftColor: event.difficulty === "mythic" ? "#f97316" : "#a855f7",
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-white text-sm">{formatEventMessage(event)}</p>
                  <p className="text-gray-500 text-xs mt-1">{event.raidName}</p>
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">{getTimeAgo(event.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">No events yet. Events will appear as guilds make progress!</div>
      )}
    </div>
  );
}
