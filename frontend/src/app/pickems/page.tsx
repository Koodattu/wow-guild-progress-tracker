"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { PickemSummary, PickemDetails, PickemPrediction, SimpleGuild, LeaderboardEntry, GuildRanking } from "@/types";
import { Combobox } from "@headlessui/react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
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
    return guilds.find((g) => g.name === value.guildName && g.realm === value.realm) || null;
  }, [value, guilds]);

  return (
    <Combobox value={comboboxValue} onChange={handleChange} disabled={disabled}>
      <div className="relative w-full">
        <Combobox.Input
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed pr-8"
          displayValue={(guild: SimpleGuild | null) => (guild ? (guild.realm !== "RWF" ? `${guild.name} - ${guild.realm}` : guild.name) : "")}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => handleChange(null)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white z-10"
            aria-label="Clear selection"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
        <Combobox.Options
          anchor="bottom start"
          className="w-[--input-width] bg-gray-800 border border-gray-600 rounded-md shadow-xl max-h-60 overflow-auto empty:invisible [--anchor-gap:4px] z-50"
        >
          {filteredGuilds.length === 0 && query !== "" ? (
            <div className="px-3 py-2 text-gray-400 text-sm">No guilds found</div>
          ) : (
            filteredGuilds.map((guild) => (
              <Combobox.Option key={`${guild.name}-${guild.realm}`} value={guild} className="cursor-pointer">
                {({ focus, selected }) => (
                  <div className={`px-3 py-2 text-white ${focus ? "bg-gray-700" : ""} ${selected ? "font-semibold" : ""}`}>
                    <span className="font-medium">{guild.name}</span>
                    {guild.realm !== "RWF" && <span className="text-gray-400 ml-2">- {guild.realm}</span>}
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
  droppingIndex,
}: {
  data: SortableItemData;
  guilds: SimpleGuild[];
  disabled: boolean;
  excludeGuilds: { guildName: string; realm: string }[];
  onChange: (position: number, guild: { guildName: string; realm: string } | null) => void;
  droppingIndex: number | null;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: data.id,
    disabled: disabled || !data.prediction,
  });

  const isDropping = droppingIndex === data.position - 1;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    zIndex: isDragging || isDropping ? 1000 : undefined,
    position: isDragging || isDropping ? "relative" : undefined,
    willChange: "transform",
  };

  return (
    <div
      ref={setNodeRef}
      style={style as React.CSSProperties}
      className={`flex pr-2 items-stretch gap-2 bg-gray-800 rounded-lg border ${isDragging ? "" : "transition-all"} ${
        isDragging ? "border-blue-500 shadow-2xl bg-gray-750" : "border-gray-700 hover:border-gray-600"
      } ${!disabled && data.prediction ? "hover:bg-gray-750" : ""}`}
    >
      <div className="flex items-center pl-3 py-2">
        <span className="w-8 h-8 flex items-center justify-center bg-gray-700 rounded-full text-white font-bold text-sm shrink-0">{data.position}</span>
      </div>

      <div className="flex-1 py-2 min-w-0">
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
          placeholder="Search and select a guild..."
          disabled={disabled}
          excludeGuilds={excludeGuilds}
        />
      </div>

      {!disabled && data.prediction && (
        <div className="flex items-center">
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            className="text-gray-500 hover:text-white cursor-grab active:cursor-grabbing touch-none transition-colors rounded hover:bg-gray-700 w-12 h-8 flex items-center justify-center"
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
            </svg>
          </button>
        </div>
      )}
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
  const [rwfGuilds, setRwfGuilds] = useState<SimpleGuild[]>([]);
  const [predictions, setPredictions] = useState<(PickemPrediction | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showScoringInfo, setShowScoringInfo] = useState(false);
  const [droppingIndex, setDroppingIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Fetch pickems list and guilds on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [pickemsData, guildsData, rwfGuildsData] = await Promise.all([api.getPickems(), api.getPickemsGuilds(), api.getPickemsRwfGuilds()]);
        setPickems(pickemsData);
        setGuilds(guildsData);
        setRwfGuilds(rwfGuildsData);

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

        const guildCount = details.guildCount || 10;

        // Both RWF and regular pickems use the same prediction format
        if (details.userPredictions && details.userPredictions.length > 0) {
          const newPredictions: (PickemPrediction | null)[] = Array(guildCount).fill(null);
          details.userPredictions.forEach((p) => {
            if (p.position >= 1 && p.position <= guildCount) {
              newPredictions[p.position - 1] = p;
            }
          });
          setPredictions(newPredictions);
        } else {
          setPredictions(Array(guildCount).fill(null));
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

  // Handle prediction change (unified for both regular and RWF)
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

  // Handle drag end with dnd-kit
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPredictions((prev) => {
        const oldIndex = prev.findIndex((_, idx) => `prediction-${idx}` === active.id);
        const newIndex = prev.findIndex((_, idx) => `prediction-${idx}` === over.id);

        if (oldIndex === -1 || newIndex === -1) return prev;

        setDroppingIndex(newIndex);
        setTimeout(() => setDroppingIndex(null), 150);

        const newPredictions = arrayMove(prev, oldIndex, newIndex);

        return newPredictions.map((pred, idx) => {
          if (pred) {
            return { ...pred, position: idx + 1 };
          }
          return null;
        });
      });
      setSuccessMessage(null);
    }
  };

  // Submit predictions (unified for both regular and RWF)
  const handleSubmit = async () => {
    if (!selectedPickemId || !pickemDetails) return;

    const guildCount = pickemDetails.guildCount || 10;
    const filledPredictions = predictions.filter((p): p is PickemPrediction => p !== null);

    if (filledPredictions.length !== guildCount) {
      setError(t("fillAllPositions", { count: guildCount }));
      return;
    }

    // Check for duplicates
    const guildKeys = new Set<string>();
    for (const pred of filledPredictions) {
      const key = `${pred.guildName}-${pred.realm}`;
      if (guildKeys.has(key)) {
        setError(`Duplicate guild: ${pred.guildName}`);
        return;
      }
      guildKeys.add(key);
    }

    try {
      setSubmitting(true);
      setError(null);
      const result = await api.submitPickemPredictions(selectedPickemId, filledPredictions);
      setSuccessMessage(result.message);

      const details = await api.getPickemDetails(selectedPickemId);
      setPickemDetails(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit predictions");
    } finally {
      setSubmitting(false);
    }
  };

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

  // Use RWF guilds for RWF pickems, regular guilds otherwise
  const sortedGuilds = useMemo(() => {
    const selectedPickem = pickems.find((p) => p.id === selectedPickemId);
    const isRwf = selectedPickem?.type === "rwf";
    const guildList = isRwf ? rwfGuilds : guilds;
    return [...guildList].sort((a, b) => a.name.localeCompare(b.name));
  }, [guilds, rwfGuilds, pickems, selectedPickemId]);

  const getExcludedGuilds = useCallback(
    (currentPosition: number) => {
      return predictions.filter((p, idx) => p !== null && idx !== currentPosition - 1).map((p) => ({ guildName: p!.guildName, realm: p!.realm }));
    },
    [predictions],
  );

  // Get scoring config from the current pickem (or defaults)
  const scoringConfig = useMemo(() => {
    return pickemDetails?.scoringConfig ?? {
      exactMatch: 10,
      offByOne: 8,
      offByTwo: 6,
      offByThree: 4,
      offByFour: 2,
      offByFiveOrMore: 0,
    };
  }, [pickemDetails]);

  // Whether this is an unfinalized RWF pickem (scores should show as pending)
  const isUnfinalizedRwf = pickemDetails?.type === "rwf" && !pickemDetails?.finalized;

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
    <div className="max-w-6xl mx-auto px-4 py-4 pb-8">
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
            <div className="bg-gray-800 rounded-lg p-4 md:p-6 border border-gray-700">
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

              {/* Unified prediction UI: autocomplete + drag-and-drop for both regular and RWF */}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={Array.from({ length: pickemDetails.guildCount || 10 }, (_, i) => `prediction-${i}`)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {Array.from({ length: pickemDetails.guildCount || 10 }, (_, i) => {
                      const position = i + 1;
                      const itemData: SortableItemData = {
                        id: `prediction-${i}`,
                        position,
                        prediction: predictions[i],
                      };
                      return (
                        <SortablePredictionItem
                          key={`prediction-${i}`}
                          data={itemData}
                          guilds={sortedGuilds}
                          disabled={!user || !pickemDetails.isVotingOpen}
                          excludeGuilds={getExcludedGuilds(position)}
                          onChange={handlePredictionChange}
                          droppingIndex={droppingIndex}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
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

            {/* Scoring Info - uses dynamic values from pickem config */}
            <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
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
                  {scoringConfig.exactMatch > 0 && (
                    <p>
                      • <strong className="text-green-400">{scoringConfig.exactMatch} points:</strong> Exact position match
                    </p>
                  )}
                  {scoringConfig.offByOne > 0 && (
                    <p>
                      • <strong className="text-yellow-400">{scoringConfig.offByOne} points:</strong> Within ±1 position
                    </p>
                  )}
                  {scoringConfig.offByTwo > 0 && (
                    <p>
                      • <strong className="text-orange-400">{scoringConfig.offByTwo} points:</strong> Within ±2 positions
                    </p>
                  )}
                  {scoringConfig.offByThree > 0 && (
                    <p>
                      • <strong className="text-orange-500">{scoringConfig.offByThree} points:</strong> Within ±3 positions
                    </p>
                  )}
                  {scoringConfig.offByFour > 0 && (
                    <p>
                      • <strong className="text-red-400">{scoringConfig.offByFour} points:</strong> Within ±4 positions
                    </p>
                  )}
                  <p>
                    • <strong className="text-gray-500">{scoringConfig.offByFiveOrMore} points:</strong> More than 4 positions off or not in top {pickemDetails?.guildCount || 10}
                  </p>
                  {isUnfinalizedRwf && (
                    <p className="mt-2 text-purple-400 font-medium">
                      RWF scores are calculated when the race ends and admin finalizes the results.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Current Rankings & Leaderboard */}
          <div className="space-y-6">
            {/* Current Guild Rankings - Only show for regular pickems */}
            {pickemDetails.type !== "rwf" && (
              <div className="bg-gray-800 rounded-lg p-4 md:p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">{t("currentRankings")}</h3>
                <div className="overflow-x-auto -mx-4 md:mx-0">
                  <div className="inline-block min-w-full align-middle">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-700">
                          <th className="text-left py-2 px-2 md:px-3">#</th>
                          <th className="text-left py-2 px-2 md:px-3">{t("guild")}</th>
                          <th className="text-right py-2 px-2 md:px-3">{t("progress")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pickemDetails.guildRankings.slice(0, 15).map((guild) => (
                          <tr key={`${guild.name}-${guild.realm}`} className={`border-b border-gray-700/50 ${guild.isComplete ? "bg-green-900/20" : ""}`}>
                            <td className="py-2 px-2 md:px-3 text-gray-300 font-medium">{guild.rank}</td>
                            <td className="py-2 px-2 md:px-3">
                              <div className="min-w-0">
                                <span className="text-white font-medium block truncate">{guild.name}</span>
                                <span className="text-gray-400 text-xs block truncate">{guild.realm}</span>
                              </div>
                            </td>
                            <td className="py-2 px-2 md:px-3 text-right whitespace-nowrap">
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
              </div>
            )}

            {/* RWF Status Banner - show for RWF pickems */}
            {pickemDetails.type === "rwf" && (
              <div className={`rounded-lg p-4 border ${pickemDetails.finalized ? "bg-emerald-900/20 border-emerald-700/50" : "bg-purple-900/20 border-purple-700/50"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${pickemDetails.finalized ? "bg-emerald-400" : "bg-purple-400 animate-pulse"}`} />
                  <div>
                    <h4 className={`font-semibold ${pickemDetails.finalized ? "text-emerald-300" : "text-purple-300"}`}>
                      {pickemDetails.finalized ? "Race Finished — Results Finalized" : "Race in Progress"}
                    </h4>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {pickemDetails.finalized
                        ? "Final rankings have been set. Scores are calculated."
                        : "Scores will be calculated when the race ends and results are finalized by an admin."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Leaderboard */}
            <div className="bg-gray-800 rounded-lg p-4 md:p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">{t("leaderboard")}</h3>
              {pickemDetails.leaderboard.length === 0 ? (
                <p className="text-gray-400 text-sm">{t("noParticipants")}</p>
              ) : (
                <div className="space-y-3">
                  {pickemDetails.leaderboard.slice(0, 20).map((entry, index) => (
                    <div
                      key={entry.username}
                      className={`rounded-lg ${
                        isUnfinalizedRwf
                          ? "bg-gray-700/30"
                          : index === 0
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
                          <div className="flex items-center gap-2 md:gap-3">
                            <span className="text-base md:text-lg font-bold text-gray-400 w-5 md:w-6 shrink-0">
                              {isUnfinalizedRwf ? "—" : index + 1}
                            </span>
                            <img src={entry.avatarUrl} alt={entry.username} className="w-7 h-7 md:w-8 md:h-8 rounded-full shrink-0" />
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className="text-white font-medium truncate text-sm md:text-base">{entry.username}</span>
                              <span className="text-xs text-gray-500 group-open:text-blue-400 transition-colors hidden sm:inline">{t("showPredictions")}</span>
                            </div>
                            <span className={`text-lg md:text-xl font-bold shrink-0 ${isUnfinalizedRwf ? "text-gray-500" : "text-blue-400"}`}>
                              {isUnfinalizedRwf ? "—" : entry.totalPoints}
                            </span>
                          </div>
                        </summary>
                        <div className="px-3 pb-3 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs border-t border-gray-700/50 mt-2">
                          {entry.predictions.map((pred) => (
                            <div key={`${pred.guildName}-${pred.predictedRank}`} className="flex items-center gap-1 text-gray-300 py-1 min-w-0">
                              <span className="text-gray-500 shrink-0">#{pred.predictedRank}:</span>
                              <span className="truncate flex-1">{pred.guildName}</span>
                              {!isUnfinalizedRwf && <PointsBadge points={pred.points} />}
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
