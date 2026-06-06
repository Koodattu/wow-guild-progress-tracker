"use client";

import { useEffect, useMemo, useState } from "react";
import EventCard from "@/components/EventCard";
import { useTranslations } from "next-intl";
import { useEventsPaginated, useGuildList } from "@/lib/queries";
import { DIFFICULTIES, EVENT_TYPES, useEventFilterPreferences } from "@/lib/useEventFilters";

export default function EventsPage() {
  const t = useTranslations("eventsPage");
  const [currentPage, setCurrentPage] = useState(1);
  const eventsPerPage = 50;
  const {
    selectedEventTypes,
    selectedDifficulties,
    selectedGuild,
    filters,
    setEventTypes,
    setDifficulties,
    setSelectedGuild,
  } = useEventFilterPreferences();
  const selectedEventTypeSet = useMemo(() => new Set(selectedEventTypes), [selectedEventTypes]);
  const selectedDifficultySet = useMemo(() => new Set(selectedDifficulties), [selectedDifficulties]);

  const { data: eventsData, isLoading, error } = useEventsPaginated(currentPage, eventsPerPage, filters);
  const { data: guildList } = useGuildList();

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedEventTypes, selectedDifficulties, selectedGuild]);

  const handlePageChange = (newPage: number) => {
    if (eventsData && newPage >= 1 && newPage <= eventsData.pagination.totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const toggleEventType = (type: string) => {
    const newSet = new Set(selectedEventTypeSet);
    if (newSet.has(type)) {
      newSet.delete(type);
    } else {
      newSet.add(type);
    }
    setEventTypes(newSet.size === 0 ? [...EVENT_TYPES] : Array.from(newSet));
  };

  const toggleDifficulty = (difficulty: string) => {
    const newSet = new Set(selectedDifficultySet);
    if (newSet.has(difficulty)) {
      newSet.delete(difficulty);
    } else {
      newSet.add(difficulty);
    }
    setDifficulties(newSet.size === 0 ? [...DIFFICULTIES] : Array.from(newSet));
  };

  const getEventTypeLabel = (type: string): string => {
    switch (type) {
      case "boss_kill":
        return t("bossKill");
      case "best_pull":
        return t("bestPull");
      case "hiatus":
        return t("hiatus");
      case "regress":
        return t("regress");
      case "reproge":
        return t("reproge");
      default:
        return type;
    }
  };

  // Build sorted unique guild names for the dropdown
  const guildNames = useMemo(() => {
    if (!guildList) return [];
    const names = guildList.map((g) => g.name);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [guildList]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⚔️</div>
          <div className="text-white text-xl">{t("loading")}</div>
        </div>
      </div>
    );
  }

  const events = eventsData?.events ?? [];
  const pagination = eventsData?.pagination;

  return (
    <main className="min-h-screen text-white">
      <div className="container mx-auto px-3 md:px-4 max-w-full md:max-w-5xl">
        {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-8 text-sm md:text-base">{error.message}</div>}

        {/* Filters */}
        <div className="mb-4 md:mb-6">
          <div className="flex flex-col md:flex-row md:flex-wrap gap-4 md:gap-x-8 md:gap-y-4">
            {/* Event Type Filter */}
            <div className="flex-1 min-w-0 md:min-w-[300px]">
              <h3 className="text-xs md:text-sm font-semibold text-gray-300 mb-2">{t("eventTypes")}</h3>
              <div className="flex flex-wrap gap-2 md:gap-3">
                {EVENT_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-1.5 md:gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedEventTypeSet.has(type)}
                      onChange={() => toggleEventType(type)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-950 cursor-pointer"
                    />
                    <span className="text-xs md:text-sm text-gray-300 group-hover:text-white transition-colors">{getEventTypeLabel(type)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Difficulty Filter */}
            <div className="flex-1 min-w-0 md:min-w-[200px]">
              <h3 className="text-xs md:text-sm font-semibold text-gray-300 mb-2">{t("difficulties")}</h3>
              <div className="flex flex-wrap gap-2 md:gap-3">
                {DIFFICULTIES.map((difficulty) => (
                  <label key={difficulty} className="flex items-center gap-1.5 md:gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedDifficultySet.has(difficulty)}
                      onChange={() => toggleDifficulty(difficulty)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-950 cursor-pointer"
                    />
                    <span className="text-xs md:text-sm text-gray-300 group-hover:text-white transition-colors capitalize">
                      {difficulty === "mythic" ? t("mythic") : t("heroic")}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Guild Filter */}
            <div className="flex-1 min-w-0 md:min-w-[200px]">
              <h3 className="text-xs md:text-sm font-semibold text-gray-300 mb-2">{t("guild")}</h3>
              <select
                value={selectedGuild}
                onChange={(e) => setSelectedGuild(e.target.value)}
                className="w-full md:w-auto px-3 py-1.5 rounded-lg text-xs md:text-sm bg-gray-800 text-white border border-gray-600 focus:ring-blue-600 focus:border-blue-600 cursor-pointer"
              >
                <option value="">{t("allGuilds")}</option>
                {guildNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Event count */}
        <div className="flex justify-end mb-3 md:mb-4">
          {pagination && (
            <div className="text-xs md:text-sm text-gray-400">
              {t("showingEvents", {
                start: pagination.totalCount === 0 ? 0 : (currentPage - 1) * eventsPerPage + 1,
                end: Math.min(currentPage * eventsPerPage, pagination.totalCount),
                total: pagination.totalCount,
              })}
            </div>
          )}
        </div>

        {events.length > 0 ? (
          <>
            <div className="space-y-3 md:space-y-4">
              {events.map((event) => (
                <EventCard key={event._id} event={event} />
              ))}
            </div>

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 md:gap-2 mt-6 md:mt-8 flex-wrap">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                    currentPage === 1 ? "bg-gray-800 text-gray-600 cursor-not-allowed" : "bg-gray-800 text-white hover:bg-gray-700"
                  }`}
                >
                  {t("previous")}
                </button>

                <div className="flex items-center gap-1 md:gap-2">
                  {/* First page */}
                  {currentPage > 3 && (
                    <>
                      <button
                        onClick={() => handlePageChange(1)}
                        className="px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium bg-gray-800 text-white hover:bg-gray-700 transition-colors"
                      >
                        1
                      </button>
                      {currentPage > 4 && <span className="text-gray-500 text-xs md:text-sm">...</span>}
                    </>
                  )}

                  {/* Pages around current */}
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter((page) => {
                      return page === currentPage || page === currentPage - 1 || page === currentPage + 1 || page === currentPage - 2 || page === currentPage + 2;
                    })
                    .map((page) => (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                          page === currentPage ? "bg-blue-600 text-white" : "bg-gray-800 text-white hover:bg-gray-700"
                        }`}
                      >
                        {page}
                      </button>
                    ))}

                  {/* Last page */}
                  {currentPage < pagination.totalPages - 2 && (
                    <>
                      {currentPage < pagination.totalPages - 3 && <span className="text-gray-500 text-xs md:text-sm">...</span>}
                      <button
                        onClick={() => handlePageChange(pagination.totalPages)}
                        className="px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium bg-gray-800 text-white hover:bg-gray-700 transition-colors"
                      >
                        {pagination.totalPages}
                      </button>
                    </>
                  )}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === pagination.totalPages}
                  className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                    currentPage === pagination.totalPages ? "bg-gray-800 text-gray-600 cursor-not-allowed" : "bg-gray-800 text-white hover:bg-gray-700"
                  }`}
                >
                  {t("next")}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-4">📊</div>
            <p>{t("noEvents")}</p>
          </div>
        )}
      </div>
    </main>
  );
}
