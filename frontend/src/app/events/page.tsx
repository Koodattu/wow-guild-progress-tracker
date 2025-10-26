"use client";

import { useEffect, useState, useCallback } from "react";
import { EventsResponse } from "@/types";
import { api } from "@/lib/api";
import { formatEventMessage, getTimeAgo } from "@/lib/utils";

export default function EventsPage() {
  const [eventsData, setEventsData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const eventsPerPage = 50;

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
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-8">{error}</div>}

        <div className="bg-gray-900 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-white">Latest Events</h1>
            {eventsData && (
              <div className="text-sm text-gray-400">
                Showing {(currentPage - 1) * eventsPerPage + 1}-{Math.min(currentPage * eventsPerPage, eventsData.pagination.totalCount)} of {eventsData.pagination.totalCount}{" "}
                events
              </div>
            )}
          </div>

          {eventsData && eventsData.events.length > 0 ? (
            <>
              <div className="space-y-3">
                {eventsData.events.map((event) => (
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

              {/* Pagination Controls */}
              {eventsData.pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8 pt-6 border-t border-gray-700">
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
                    {Array.from({ length: eventsData.pagination.totalPages }, (_, i) => i + 1)
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
                    {currentPage < eventsData.pagination.totalPages - 2 && (
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
                    disabled={currentPage === eventsData.pagination.totalPages}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === eventsData.pagination.totalPages ? "bg-gray-800 text-gray-600 cursor-not-allowed" : "bg-gray-800 text-white hover:bg-gray-700"
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
              <p>No events yet. Events will appear as guilds make progress!</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
