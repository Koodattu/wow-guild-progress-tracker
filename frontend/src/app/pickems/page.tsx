"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { PickemSummary, PickemDetails, PickemPrediction, SimpleGuild, LeaderboardEntry, GuildRanking } from "@/types";
import { Combobox } from "@headlessui/react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Guild autocomplete using Headless UI Combobox
function GuildAutocomplete({
  value,
  onChange,
  guilds,
  placeholder,
  disabled,
  excludeGuilds = [],
}: {
  value: { guildName: string; realm: string } | null;
  onChange: (guild: { guildName: string; realm: string } | null) => void;
  guilds: SimpleGuild[];
  placeholder: string;
  disabled?: boolean;
  excludeGuilds?: { guildName: string; realm: string }[];
}) {
  const [query, setQuery] = useState("");

  const excludeSet = useMemo(() => new Set(excludeGuilds.map((g) => `${g.guildName}-${g.realm}`)), [excludeGuilds]);

  const filteredGuilds = useMemo(() => {
    if (query === "") {
      return guilds.filter((g) => !excludeSet.has(`${g.name}-${g.realm}`)).slice(0, 50);
    }

    const searchTerm = query.toLowerCase();
    return guilds
      .filter((g) => {
        const key = `${g.name}-${g.realm}`;
        const matches = g.name.toLowerCase().includes(searchTerm) || g.realm.toLowerCase().includes(searchTerm) || `${g.name} - ${g.realm}`.toLowerCase().includes(searchTerm);
        return matches && !excludeSet.has(key);
      })
      .slice(0, 50);
  }, [query, guilds, excludeSet]);

  const handleChange = (selectedGuild: SimpleGuild | null) => {
    if (selectedGuild) {
      onChange({ guildName: selectedGuild.name, realm: selectedGuild.realm });
      setQuery("");
    } else {
      onChange(null);
      setQuery("");
    }
  };

  const comboboxValue = useMemo(() => {
    if (!value) return null;
    // Convert back to SimpleGuild format for Combobox
    return guilds.find((g) => g.name === value.guildName && g.realm === value.realm) || null;
  }, [value, guilds]);

  return (
    <Combobox value={comboboxValue} onChange={handleChange} disabled={disabled}>
      <div className="relative">
        <div className="relative">
          <Combobox.Input
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed pr-8"
            displayValue={(guild: SimpleGuild | null) => (guild ? `${guild.name} - ${guild.realm}` : "")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
          />
          {value && !disabled && (
            <button type="button" onClick={() => handleChange(null)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white z-10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
        <Combobox.Options className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredGuilds.length === 0 && query !== "" ? (
            <div className="px-3 py-2 text-gray-400 text-sm">No guilds found</div>
          ) : (
            filteredGuilds.map((guild) => (
              <Combobox.Option key={`${guild.name}-${guild.realm}`} value={guild} className="cursor-pointer">
                {({ active, selected }) => (
                  <div className={`px-3 py-2 text-white ${active ? "bg-gray-700" : ""} ${selected ? "bg-gray-700" : ""}`}>
                    <span className="font-medium">{guild.name}</span>
                    <span className="text-gray-400 ml-2">- {guild.realm}</span>
                  </div>
                )}
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </div>
    </Combobox>
  );
}

// Sortable prediction item component
interface SortableItemData {
  id: string;
  position: number;
  prediction: PickemPrediction | null;
}

function SortablePredictionItem({
  data,
  guilds,
  disabled,
  excludeGuilds,
  onChange,
}: {
  data: SortableItemData;
  guilds: SimpleGuild[];
  disabled: boolean;
  excludeGuilds: { guildName: string; realm: string }[];
  onChange: (position: number, guild: { guildName: string; realm: string } | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: data.id,
    disabled: disabled || !data.prediction,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 flex items-center justify-center bg-gray-700 rounded-full text-white font-bold text-sm shrink-0">{data.position}</span>
        {!disabled && data.prediction && (
          <button type="button" {...attributes} {...listeners} className="text-gray-400 hover:text-white cursor-grab active:cursor-grabbing p-1 touch-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex-1">
        <GuildAutocomplete
          value={
            data.prediction
              ? {
                  guildName: data.prediction.guildName,
                  realm: data.prediction.realm,
                }
              : null
          }
          onChange={(guild) => onChange(data.position, guild)}
          guilds={guilds}
          placeholder="Select a guild"
          disabled={disabled}
          excludeGuilds={excludeGuilds}
        />
      </div>
    </div>
  );
}

// Drag overlay component for visual feedback
function PredictionDragOverlay({ prediction }: { prediction: PickemPrediction | null }) {
  if (!prediction) return null;

  return (
    <div className="bg-gray-700 border-2 border-blue-500 rounded-md px-3 py-2 shadow-lg">
      <span className="text-white font-medium">{prediction.guildName}</span>
      <span className="text-gray-400 ml-2">- {prediction.realm}</span>
    </div>
  );
}

// Custom Pickem Selector component
function PickemSelector({
  pickems,
  selectedId,
  onSelect,
  getTimeRemaining,
}: {
  pickems: PickemSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  getTimeRemaining: (endDate: string) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("pickemsPage");

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedPickem = pickems.find((p) => p.id === selectedId);

  const getStatusInfo = (pickem: PickemSummary) => {
    const now = new Date();
    const start = new Date(pickem.votingStart);
    const end = new Date(pickem.votingEnd);

    if (now < start) {
      return { status: t("notStarted"), color: "text-gray-400", bgColor: "bg-gray-700" };
    } else if (now > end) {
      return { status: t("ended"), color: "text-red-400", bgColor: "bg-red-900/30" };
    } else {
      return { status: getTimeRemaining(pickem.votingEnd), color: "text-green-400", bgColor: "bg-green-900/30" };
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label htmlFor="pickem-select" className="text-xs text-gray-400 mb-1 block">
        {t("selectPickem")}
      </label>
      <button
        id="pickem-select"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-800 text-white px-4 py-3 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-3 min-w-[350px] justify-between hover:bg-gray-750 transition-colors w-full"
      >
        {selectedPickem ? (
          <div className="flex flex-col items-start gap-1 flex-1">
            <span className="font-semibold">{selectedPickem.name}</span>
            <span className={`text-xs ${getStatusInfo(selectedPickem).color}`}>{getStatusInfo(selectedPickem).status}</span>
          </div>
        ) : (
          <span>{t("selectPickem")}</span>
        )}
        <svg className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-96 overflow-y-auto">
          {pickems.map((pickem) => {
            const statusInfo = getStatusInfo(pickem);
            return (
              <button
                key={pickem.id}
                onClick={() => {
                  onSelect(pickem.id);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center justify-between ${pickem.id === selectedId ? "bg-gray-700" : ""} ${
                  statusInfo.bgColor
                }`}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{pickem.name}</span>
                  <span className={`text-xs ${statusInfo.color}`}>{statusInfo.status}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Points display with color coding
function PointsBadge({ points }: { points: number }) {
  let bgColor = "bg-gray-600";
  if (points === 10) bgColor = "bg-green-600";
  else if (points >= 6) bgColor = "bg-yellow-600";
  else if (points >= 2) bgColor = "bg-orange-600";
  else if (points === 0) bgColor = "bg-red-600";

  return <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded ${bgColor} text-white`}>{points}</span>;
}

export default function PickemsPage() {
  const t = useTranslations("pickemsPage");
  const { user, isLoading: authLoading } = useAuth();

  const [pickems, setPickems] = useState<PickemSummary[]>([]);
  const [selectedPickemId, setSelectedPickemId] = useState<string | null>(null);
  const [pickemDetails, setPickemDetails] = useState<PickemDetails | null>(null);
  const [guilds, setGuilds] = useState<SimpleGuild[]>([]);
  const [predictions, setPredictions] = useState<(PickemPrediction | null)[]>(Array(10).fill(null));
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showScoringInfo, setShowScoringInfo] = useState(false);

  // Configure dnd-kit sensors for both mouse and keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px of movement required to start drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch pickems list and guilds on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [pickemsData, guildsData] = await Promise.all([api.getPickems(), api.getPickemsGuilds()]);
        setPickems(pickemsData);
        setGuilds(guildsData);

        // Auto-select first pickem if available
        if (pickemsData.length > 0) {
          setSelectedPickemId(pickemsData[0].id);
        }
      } catch (err) {
        setError("Failed to load pickems");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Fetch pickem details when selection changes
  useEffect(() => {
    if (!selectedPickemId) return;

    const fetchDetails = async () => {
      try {
        setDetailsLoading(true);
        const details = await api.getPickemDetails(selectedPickemId);
        setPickemDetails(details);

        // Initialize predictions from user's existing predictions
        if (details.userPredictions) {
          const newPredictions: (PickemPrediction | null)[] = Array(10).fill(null);
          details.userPredictions.forEach((p) => {
            if (p.position >= 1 && p.position <= 10) {
              newPredictions[p.position - 1] = p;
            }
          });
          setPredictions(newPredictions);
        } else {
          setPredictions(Array(10).fill(null));
        }
      } catch (err) {
        setError("Failed to load pickem details");
        console.error(err);
      } finally {
        setDetailsLoading(false);
      }
    };

    fetchDetails();
  }, [selectedPickemId]);

  // Handle prediction change
  const handlePredictionChange = useCallback((position: number, guild: { guildName: string; realm: string } | null) => {
    setPredictions((prev) => {
      const newPredictions = [...prev];
      if (guild) {
        newPredictions[position - 1] = {
          guildName: guild.guildName,
          realm: guild.realm,
          position,
        };
      } else {
        newPredictions[position - 1] = null;
      }
      return newPredictions;
    });
    setSuccessMessage(null);
  }, []);

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Handle drag end with dnd-kit
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPredictions((prev) => {
        const oldIndex = prev.findIndex((_, idx) => `prediction-${idx}` === active.id);
        const newIndex = prev.findIndex((_, idx) => `prediction-${idx}` === over.id);

        if (oldIndex === -1 || newIndex === -1) return prev;

        const newPredictions = arrayMove(prev, oldIndex, newIndex);

        // Update positions after reordering
        return newPredictions.map((pred, idx) => {
          if (pred) {
            return { ...pred, position: idx + 1 };
          }
          return null;
        });
      });
      setSuccessMessage(null);
    }

    setActiveId(null);
  };

  // Submit predictions
  const handleSubmit = async () => {
    if (!selectedPickemId) return;

    // Validate all positions are filled
    const filledPredictions = predictions.filter((p): p is PickemPrediction => p !== null);
    if (filledPredictions.length !== 10) {
      setError("Please fill all 10 positions");
      return;
    }

    // Check for duplicates
    const guildKeys = new Set<string>();
    for (const pred of filledPredictions) {
      const key = `${pred.guildName}-${pred.realm}`;
      if (guildKeys.has(key)) {
        setError(`Duplicate guild: ${pred.guildName} - ${pred.realm}`);
        return;
      }
      guildKeys.add(key);
    }

    try {
      setSubmitting(true);
      setError(null);
      const result = await api.submitPickemPredictions(selectedPickemId, filledPredictions);
      setSuccessMessage(result.message);

      // Refresh details to get updated leaderboard
      const details = await api.getPickemDetails(selectedPickemId);
      setPickemDetails(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit predictions");
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate time remaining
  const getTimeRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return "Voting ended";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  // Memoize sorted guilds for performance
  const sortedGuilds = useMemo(() => {
    return [...guilds].sort((a, b) => a.name.localeCompare(b.name));
  }, [guilds]);

  // Get list of already selected guilds to exclude from dropdowns
  const getExcludedGuilds = useCallback(
    (currentPosition: number) => {
      return predictions.filter((p, idx) => p !== null && idx !== currentPosition - 1).map((p) => ({ guildName: p!.guildName, realm: p!.realm }));
    },
    [predictions]
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (pickems.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-6">{t("title")}</h1>
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">{t("noPickems")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-4">
      {/* Pickem Selector */}
      <div className="mb-6">
        <PickemSelector pickems={pickems} selectedId={selectedPickemId} onSelect={setSelectedPickemId} getTimeRemaining={getTimeRemaining} />
      </div>

      {detailsLoading ? (
        <div className="flex justify-center items-center min-h-[300px]">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : pickemDetails ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Prediction Form */}
          <div className="space-y-6">
            {/* Prediction Form */}
            <div className="bg-gray-800 rounded-lg p-4 md:p-6">
              <h3 className="text-lg font-semibold text-white mb-4">{t("yourPredictions")}</h3>

              {!user && !authLoading && (
                <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-700 rounded-md">
                  <p className="text-yellow-300 text-sm">{t("loginToVote")}</p>
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-md">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              {successMessage && (
                <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded-md">
                  <p className="text-green-300 text-sm">{successMessage}</p>
                </div>
              )}

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={Array.from({ length: 10 }, (_, i) => `prediction-${i}`)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {Array.from({ length: 10 }, (_, i) => i).map((index) => {
                      const position = index + 1;
                      const itemData: SortableItemData = {
                        id: `prediction-${index}`,
                        position,
                        prediction: predictions[index],
                      };

                      return (
                        <SortablePredictionItem
                          key={`prediction-${index}`}
                          data={itemData}
                          guilds={sortedGuilds}
                          disabled={!user || !pickemDetails.isVotingOpen}
                          excludeGuilds={getExcludedGuilds(position)}
                          onChange={handlePredictionChange}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
                <DragOverlay>{activeId ? <PredictionDragOverlay prediction={predictions[parseInt(activeId.split("-")[1])]} /> : null}</DragOverlay>
              </DndContext>

              {user && pickemDetails.isVotingOpen && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="mt-6 w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      {t("submitting")}
                    </span>
                  ) : (
                    t("submitPredictions")
                  )}
                </button>
              )}
            </div>

            {/* Scoring Info - Collapsible */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowScoringInfo(!showScoringInfo)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-750 transition-colors"
              >
                <span className="text-sm font-semibold text-gray-300">{t("scoringSystem")}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${showScoringInfo ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showScoringInfo && (
                <div className="px-4 pb-4 text-xs text-gray-400 space-y-1.5 border-t border-gray-700 pt-3">
                  <p>
                    • <strong className="text-green-400">10 points:</strong> Exact position match
                  </p>
                  <p>
                    • <strong className="text-yellow-400">6 points:</strong> Within ±1 position
                  </p>
                  <p>
                    • <strong className="text-orange-400">4 points:</strong> Within ±2 positions
                  </p>
                  <p>
                    • <strong className="text-orange-500">3 points:</strong> Within ±3 positions
                  </p>
                  <p>
                    • <strong className="text-red-400">2 points:</strong> Within ±4 positions
                  </p>
                  <p>
                    • <strong className="text-red-500">1 point:</strong> Within ±5 positions
                  </p>
                  <p>
                    • <strong className="text-gray-500">0 points:</strong> More than 5 positions off or not in top 10
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Current Rankings & Leaderboard */}
          <div className="space-y-6">
            {/* Current Guild Rankings */}
            <div className="bg-gray-800 rounded-lg p-4 md:p-6">
              <h3 className="text-lg font-semibold text-white mb-4">{t("currentRankings")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">{t("guild")}</th>
                      <th className="text-right py-2 px-2">{t("progress")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickemDetails.guildRankings.slice(0, 15).map((guild) => (
                      <tr key={`${guild.name}-${guild.realm}`} className={`border-b border-gray-700/50 ${guild.isComplete ? "bg-green-900/20" : ""}`}>
                        <td className="py-2 px-2 text-gray-300 font-medium">{guild.rank}</td>
                        <td className="py-2 px-2">
                          <div>
                            <span className="text-white font-medium">{guild.name}</span>
                            <span className="text-gray-400 text-xs ml-2">{guild.realm}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className={`${guild.isComplete ? "text-green-400" : "text-gray-300"}`}>
                            {guild.bossesKilled}/{guild.totalBosses}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-gray-800 rounded-lg p-4 md:p-6">
              <h3 className="text-lg font-semibold text-white mb-4">{t("leaderboard")}</h3>
              {pickemDetails.leaderboard.length === 0 ? (
                <p className="text-gray-400 text-sm">{t("noParticipants")}</p>
              ) : (
                <div className="space-y-3">
                  {pickemDetails.leaderboard.slice(0, 20).map((entry, index) => (
                    <div
                      key={entry.username}
                      className={`rounded-lg ${
                        index === 0
                          ? "bg-yellow-900/30 border border-yellow-700/50"
                          : index === 1
                          ? "bg-gray-700/50 border border-gray-600/50"
                          : index === 2
                          ? "bg-orange-900/30 border border-orange-700/50"
                          : "bg-gray-700/30"
                      }`}
                    >
                      <details className="group">
                        <summary className="p-3 cursor-pointer list-none hover:bg-gray-700/20 rounded-lg transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-bold text-gray-400 w-6">{index + 1}</span>
                            <img src={entry.avatarUrl} alt={entry.username} className="w-8 h-8 rounded-full" />
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className="text-white font-medium truncate">{entry.username}</span>
                              <span className="text-xs text-gray-500 group-open:text-blue-400 transition-colors">{t("showPredictions")}</span>
                            </div>
                            <span className="text-xl font-bold text-blue-400">{entry.totalPoints}</span>
                          </div>
                        </summary>
                        <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-1 text-xs border-t border-gray-700/50 mt-2">
                          {entry.predictions.map((pred) => (
                            <div key={`${pred.guildName}-${pred.predictedRank}`} className="flex items-center gap-1 text-gray-300 py-1">
                              <span className="text-gray-500">#{pred.predictedRank}:</span>
                              <span className="truncate">{pred.guildName}</span>
                              <PointsBadge points={pred.points} />
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
