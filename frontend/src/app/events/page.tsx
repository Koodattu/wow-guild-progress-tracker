"use client";

import { useEffect, useState, useCallback } from "react";
import { EventsResponse } from "@/types";
import { api } from "@/lib/api";
import EventCard from "@/components/EventCard";
import Cookies from "js-cookie";

const EVENT_TYPES = ["boss_kill", "best_pull", "hiatus", "regress", "reproge"] as const;
const DIFFICULTIES = ["mythic", "heroic"] as const;

export default function EventsPage() {
  const [eventsData, setEventsData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const eventsPerPage = 50;

  // Initialize filters from cookies or defaults
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(() => {
    const saved = Cookies.get("event-types-filter");
    return saved ? new Set(JSON.parse(saved)) : new Set(EVENT_TYPES);
  });

  const [selectedDifficulties, setSelectedDifficulties] = useState<Set<string>>(() => {
    const saved = Cookies.get("event-difficulties-filter");
    return saved ? new Set(JSON.parse(saved)) : new Set(DIFFICULTIES);
  });

  // Save filters to cookies whenever they change
  useEffect(() => {
    Cookies.set("event-types-filter", JSON.stringify(Array.from(selectedEventTypes)), { expires: 365 });
  }, [selectedEventTypes]);

  useEffect(() => {
    Cookies.set("event-difficulties-filter", JSON.stringify(Array.from(selectedDifficulties)), { expires: 365 });
  }, [selectedDifficulties]);

  // Filter events based on selected types and difficulties
  const filteredEvents = eventsData?.events.filter((event) => selectedEventTypes.has(event.type) && selectedDifficulties.has(event.difficulty));

  const fetchEvents = useCallback(async (page: number) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getEventsPaginated(page, eventsPerPage);
      setEventsData(data);
    } catch (err) {
      console.error("Error fetching events:", err);
      setError("Failed to load events. Make sure the backend server is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents(currentPage);
  }, [currentPage, fetchEvents]);

  // Auto-refresh every 30 seconds (only on first page)
  useEffect(() => {
    if (currentPage === 1) {
      const interval = setInterval(() => {
        fetchEvents(1);
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [currentPage, fetchEvents]);

  const handlePageChange = (newPage: number) => {
    if (eventsData && newPage >= 1 && newPage <= eventsData.pagination.totalPages) {
      setCurrentPage(newPage);
      // Scroll to top of page
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const toggleEventType = (type: string) => {
    setSelectedEventTypes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  const toggleDifficulty = (difficulty: string) => {
    setSelectedDifficulties((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(difficulty)) {
        newSet.delete(difficulty);
      } else {
        newSet.add(difficulty);
      }
      return newSet;
    });
  };

  const getEventTypeLabel = (type: string): string => {
    switch (type) {
      case "boss_kill":
        return "Boss Kill";
      case "best_pull":
        return "Progress";
      case "hiatus":
        return "Hiatus";
      case "regress":
        return "Regress";
      case "reproge":
        return "Re-kill";
      default:
        return type;
    }
  };

  if (loading && !eventsData) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⚔️</div>
          <div className="text-white text-xl">Loading events...</div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 max-w-5xl">
        {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-8">{error}</div>}

        {/* Filters */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            {/* Event Type Filter */}
            <div className="flex-1 min-w-[300px]">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Event Type</h3>
              <div className="flex flex-wrap gap-3">
                {EVENT_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedEventTypes.has(type)}
                      onChange={() => toggleEventType(type)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-950 cursor-pointer"
                    />
                    <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{getEventTypeLabel(type)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Difficulty Filter */}
            <div className="flex-1 min-w-[200px]">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Difficulty</h3>
              <div className="flex flex-wrap gap-3">
                {DIFFICULTIES.map((difficulty) => (
                  <label key={difficulty} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedDifficulties.has(difficulty)}
                      onChange={() => toggleDifficulty(difficulty)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-950 cursor-pointer"
                    />
                    <span className="text-sm text-gray-300 group-hover:text-white transition-colors capitalize">{difficulty}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Event count */}
        <div className="flex justify-end mb-4">
          {eventsData && (
            <div className="text-sm text-gray-400">
              Showing {filteredEvents?.length || 0} of {eventsData.pagination.totalCount} events
            </div>
          )}
        </div>

        {filteredEvents && filteredEvents.length > 0 ? (
          <>
            <div className="space-y-4">
              {filteredEvents.map((event) => (
                <EventCard key={event._id} event={event} />
              ))}
            </div>

            {/* Pagination Controls */}
            {eventsData && eventsData.pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === 1 ? "bg-gray-800 text-gray-600 cursor-not-allowed" : "bg-gray-800 text-white hover:bg-gray-700"
                  }`}
                >
                  Previous
                </button>

                <div className="flex items-center gap-2">
                  {/* First page */}
                  {currentPage > 3 && (
                    <>
                      <button onClick={() => handlePageChange(1)} className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-800 text-white hover:bg-gray-700 transition-colors">
                        1
                      </button>
                      {currentPage > 4 && <span className="text-gray-500">...</span>}
                    </>
                  )}

                  {/* Pages around current */}
                  {eventsData &&
                    Array.from({ length: eventsData.pagination.totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        return page === currentPage || page === currentPage - 1 || page === currentPage + 1 || page === currentPage - 2 || page === currentPage + 2;
                      })
                      .map((page) => (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            page === currentPage ? "bg-blue-600 text-white" : "bg-gray-800 text-white hover:bg-gray-700"
                          }`}
                        >
                          {page}
                        </button>
                      ))}

                  {/* Last page */}
                  {eventsData && currentPage < eventsData.pagination.totalPages - 2 && (
                    <>
                      {currentPage < eventsData.pagination.totalPages - 3 && <span className="text-gray-500">...</span>}
                      <button
                        onClick={() => handlePageChange(eventsData.pagination.totalPages)}
                        className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-800 text-white hover:bg-gray-700 transition-colors"
                      >
                        {eventsData.pagination.totalPages}
                      </button>
                    </>
                  )}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={eventsData ? currentPage === eventsData.pagination.totalPages : true}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    eventsData && currentPage === eventsData.pagination.totalPages ? "bg-gray-800 text-gray-600 cursor-not-allowed" : "bg-gray-800 text-white hover:bg-gray-700"
                  }`}
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-4">📊</div>
            <p>No events match the selected filters.</p>
          </div>
        )}
      </div>
    </main>
  );
}
