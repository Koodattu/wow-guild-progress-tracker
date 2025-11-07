"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { GuildSchedule, RaidScheduleDay } from "@/types";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Generate a color from guild ID (darker tones for better readability)
const getGuildColor = (guildId: string): string => {
  // Hash the guild ID to get a consistent color
  let hash = 0;
  for (let i = 0; i < guildId.length; i++) {
    hash = guildId.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate HSL color with darker tone (reduced saturation and lightness)
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 55%, 40%)`; // Reduced from 70%, 50% to 55%, 40%
};

export default function TimetablePage() {
  const [schedules, setSchedules] = useState<GuildSchedule[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        setLoading(true);
        const data = await api.getGuildSchedules();
        setSchedules(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load schedules");
      } finally {
        setLoading(false);
      }
    };

    fetchSchedules();
  }, []);

  // Format hour for display (e.g., 18.5 -> "18:30", 19 -> "19:00")
  const formatHour = (hour: number): string => {
    const h = Math.floor(hour);
    const m = (hour % 1) * 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  // Get all raid events to display on the timetable
  const getRaidEvents = () => {
    const filteredSchedules = selectedGuild === "all" ? schedules : schedules.filter((s) => s._id === selectedGuild);

    const events: Array<{
      guild: GuildSchedule;
      day: RaidScheduleDay;
    }> = [];

    filteredSchedules.forEach((guild) => {
      guild.raidSchedule.days.forEach((day) => {
        events.push({ guild, day });
      });
    });

    return events;
  };

  // Get the earliest and latest hours to determine the time range
  const getTimeRange = () => {
    const events = getRaidEvents();
    if (events.length === 0) return { start: 0, end: 24 };

    let earliest = 24;
    let latest = 0;

    events.forEach(({ day }) => {
      if (day.startHour < earliest) earliest = Math.floor(day.startHour);
      if (day.endHour > latest) latest = Math.ceil(day.endHour);
    });

    // Add some padding
    earliest = Math.max(0, earliest - 1);
    latest = Math.min(24, latest + 1);

    return { start: earliest, end: latest };
  };

  // Get events for a specific day
  const getEventsForDay = (dayName: string) => {
    return getRaidEvents().filter(({ day }) => day.day === dayName);
  };

  // Calculate layout for events side by side (no overlap)
  const calculateEventLayout = (events: Array<{ guild: GuildSchedule; day: RaidScheduleDay }>) => {
    if (events.length === 0) return [];

    // Sort events by start time
    const sorted = [...events].sort((a, b) => a.day.startHour - b.day.startHour);

    // Track occupied columns and their end times
    const columns: Array<{ endHour: number; events: typeof sorted }> = [];

    // Assign each event to a column
    sorted.forEach((event) => {
      // Find first column where this event can fit (no overlap)
      let columnIndex = columns.findIndex((col) => col.endHour <= event.day.startHour);

      if (columnIndex === -1) {
        // Need a new column
        columnIndex = columns.length;
        columns.push({ endHour: event.day.endHour, events: [event] });
      } else {
        // Use existing column
        columns[columnIndex].endHour = Math.max(columns[columnIndex].endHour, event.day.endHour);
        columns[columnIndex].events.push(event);
      }
    });

    // Calculate positions for each event
    const layouts = sorted.map((event) => {
      const columnIndex = columns.findIndex((col) => col.events.includes(event));
      const totalColumns = columns.length;
      const widthPercent = 100 / totalColumns;
      const leftPercent = columnIndex * widthPercent;

      return {
        event,
        left: leftPercent,
        width: widthPercent,
      };
    });

    return layouts;
  };

  if (loading) {
    return (
      <div className="w-full px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-gray-400">Loading raid schedules...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full px-4 py-8">
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-400">Error: {error}</p>
        </div>
      </div>
    );
  }

  const timeRange = getTimeRange();
  const displayHours: number[] = [];
  for (let h = timeRange.start; h <= timeRange.end; h++) {
    displayHours.push(h);
  }

  return (
    <div className="w-full px-4 py-8" style={{ maxWidth: "85vw", margin: "0 auto" }}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-4">Raid Timetable</h1>

        {/* Guild Filter */}
        <div className="flex items-center gap-4">
          <label htmlFor="guild-filter" className="text-gray-400">
            Filter by Guild:
          </label>
          <select
            id="guild-filter"
            value={selectedGuild}
            onChange={(e) => setSelectedGuild(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Guilds</option>
            {schedules.map((guild) => (
              <option key={guild._id} value={guild._id}>
                {guild.name} - {guild.realm}
                {guild.parent_guild ? ` (${guild.parent_guild})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Timetable */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-auto">
        <div className="min-w-[800px]">
          <div className="grid" style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}>
            {/* Header Row */}
            <div className="bg-gray-900 border-b border-gray-700 p-4 sticky top-0 z-10"></div>
            {WEEKDAYS.map((day) => (
              <div key={day} className="bg-gray-900 border-b border-l border-gray-700 p-4 text-center font-semibold text-white sticky top-0 z-10">
                {day}
              </div>
            ))}

            {/* Time slots - just the grid structure */}
            {displayHours.map((hour) => (
              <div key={hour} className="contents">
                {/* Time label */}
                <div className="border-b border-gray-700 p-2 text-right text-sm text-gray-400 bg-gray-800">{formatHour(hour)}</div>

                {/* Day columns - empty cells for grid */}
                {WEEKDAYS.map((day) => (
                  <div key={`${day}-${hour}`} className="border-b border-l border-gray-700 min-h-[60px] bg-gray-850"></div>
                ))}
              </div>
            ))}
          </div>

          {/* Event overlays - positioned absolutely over the grid */}
          <div className="relative" style={{ marginTop: `-${displayHours.length * 60}px`, height: `${displayHours.length * 60}px`, pointerEvents: "none" }}>
            <div className="grid" style={{ gridTemplateColumns: "80px repeat(7, 1fr)", height: "100%" }}>
              {/* Empty time label column */}
              <div></div>

              {/* Event columns for each day */}
              {WEEKDAYS.map((day) => {
                const dayEvents = getEventsForDay(day);
                const layouts = calculateEventLayout(dayEvents);
                const timeRange = getTimeRange();

                return (
                  <div key={day} className="relative" style={{ pointerEvents: "auto" }}>
                    {layouts.map(({ event, left, width }, idx) => {
                      const { guild, day: daySchedule } = event;
                      const eventStart = daySchedule.startHour;
                      const eventEnd = daySchedule.endHour;

                      // Calculate position relative to the time range
                      const topOffset = ((eventStart - timeRange.start) / (timeRange.end - timeRange.start)) * 100;
                      const heightPercent = ((eventEnd - eventStart) / (timeRange.end - timeRange.start)) * 100;
                      const color = getGuildColor(guild._id);

                      return (
                        <div
                          key={`${guild._id}-${idx}`}
                          className="absolute border border-opacity-50 rounded px-2 py-1 text-xs text-white overflow-hidden hover:z-20 transition-all cursor-pointer shadow-lg"
                          style={{
                            left: `${left}%`,
                            width: `${width - 1}%`,
                            top: `${topOffset}%`,
                            height: `${heightPercent}%`,
                            backgroundColor: color,
                            borderColor: color,
                            opacity: 0.9,
                          }}
                          title={`${guild.name} - ${guild.realm}${guild.parent_guild ? ` (${guild.parent_guild})` : ""}\n${formatHour(daySchedule.startHour)} - ${formatHour(
                            daySchedule.endHour
                          )}`}
                        >
                          <div className="font-semibold truncate text-white drop-shadow">{guild.name}</div>
                          {guild.parent_guild && <div className="text-[10px] text-white/80 truncate drop-shadow">({guild.parent_guild})</div>}
                          <div className="text-[10px] text-white/90 drop-shadow">
                            {formatHour(daySchedule.startHour)} - {formatHour(daySchedule.endHour)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend/Info */}
      {schedules.length === 0 && (
        <div className="mt-6 text-center text-gray-400">
          <p>No raid schedules available. Guilds need to have raid data from the current tier.</p>
        </div>
      )}

      {schedules.length > 0 && (
        <div className="mt-6 text-sm text-gray-400">
          <p>Showing raid schedules for {selectedGuild === "all" ? `${schedules.length} guilds` : "selected guild"}. Each guild has a unique color.</p>
        </div>
      )}
    </div>
  );
}
