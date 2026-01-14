"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { PickemSummary, PickemDetails, PickemPrediction, SimpleGuild, LeaderboardEntry, GuildRanking } from "@/types";

// Guild autocomplete input component
function GuildAutocomplete({
  value,
  onChange,
  guilds,
  placeholder,
  disabled,
}: {
  value: { guildName: string; realm: string } | null;
  onChange: (guild: { guildName: string; realm: string } | null) => void;
  guilds: SimpleGuild[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useState(value ? `${value.guildName} - ${value.realm}` : "");
  const [isOpen, setIsOpen] = useState(false);
  const [filteredGuilds, setFilteredGuilds] = useState<SimpleGuild[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter guilds based on input
  useEffect(() => {
    if (!inputValue.trim()) {
      setFilteredGuilds([]);
      return;
    }

    const searchTerm = inputValue.toLowerCase();
    const filtered = guilds
      .filter((g) => g.name.toLowerCase().includes(searchTerm) || g.realm.toLowerCase().includes(searchTerm) || `${g.name} - ${g.realm}`.toLowerCase().includes(searchTerm))
      .slice(0, 10); // Limit results for performance

    setFilteredGuilds(filtered);
  }, [inputValue, guilds]);

  // Update input when value prop changes
  useEffect(() => {
    if (value) {
      setInputValue(`${value.guildName} - ${value.realm}`);
    } else {
      setInputValue("");
    }
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (guild: SimpleGuild) => {
    onChange({ guildName: guild.name, realm: guild.realm });
    setInputValue(`${guild.name} - ${guild.realm}`);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setIsOpen(true);
    // Clear selection if input changes
    if (value && e.target.value !== `${value.guildName} - ${value.realm}`) {
      onChange(null);
    }
  };

  const handleClear = () => {
    setInputValue("");
    onChange(null);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed pr-8"
        />
        {inputValue && !disabled && (
          <button type="button" onClick={handleClear} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
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

      {isOpen && filteredGuilds.length > 0 && !disabled && (
        <div ref={dropdownRef} className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredGuilds.map((guild, index) => (
            <button
              key={`${guild.name}-${guild.realm}-${index}`}
              type="button"
              onClick={() => handleSelect(guild)}
              className="w-full px-3 py-2 text-left text-white hover:bg-gray-700 focus:bg-gray-700 focus:outline-none"
            >
              <span className="font-medium">{guild.name}</span>
              <span className="text-gray-400 ml-2">- {guild.realm}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && inputValue && filteredGuilds.length === 0 && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg p-3 text-gray-400 text-sm">No guilds found</div>
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
      <h1 className="text-2xl md:text-3xl font-bold text-white mb-6">{t("title")}</h1>

      {/* Pickem Selector */}
      {pickems.length > 1 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">{t("selectPickem")}</label>
          <select
            value={selectedPickemId || ""}
            onChange={(e) => setSelectedPickemId(e.target.value)}
            className="w-full md:w-auto px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {pickems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {detailsLoading ? (
        <div className="flex justify-center items-center min-h-[300px]">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : pickemDetails ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Prediction Form */}
          <div className="space-y-6">
            {/* Status Banner */}
            <div className={`rounded-lg p-4 ${pickemDetails.isVotingOpen ? "bg-green-900/50 border border-green-700" : "bg-gray-800 border border-gray-700"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">{pickemDetails.name}</h2>
                  <p className="text-sm text-gray-400">
                    {pickemDetails.isVotingOpen ? getTimeRemaining(pickemDetails.votingEnd) : pickemDetails.hasEnded ? t("votingEnded") : t("votingNotStarted")}
                  </p>
                </div>
                {pickemDetails.isVotingOpen && <span className="px-3 py-1 bg-green-600 text-white text-sm font-medium rounded-full">{t("votingOpen")}</span>}
              </div>
            </div>

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

              <div className="space-y-3">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((position) => (
                  <div key={position} className="flex items-center gap-3">
                    <span className="w-8 h-8 flex items-center justify-center bg-gray-700 rounded-full text-white font-bold text-sm">{position}</span>
                    <div className="flex-1">
                      <GuildAutocomplete
                        value={
                          predictions[position - 1]
                            ? {
                                guildName: predictions[position - 1]!.guildName,
                                realm: predictions[position - 1]!.realm,
                              }
                            : null
                        }
                        onChange={(guild) => handlePredictionChange(position, guild)}
                        guilds={sortedGuilds}
                        placeholder={t("selectGuild")}
                        disabled={!user || !pickemDetails.isVotingOpen}
                      />
                    </div>
                  </div>
                ))}
              </div>

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

            {/* Scoring Info */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">{t("scoringSystem")}</h3>
              <div className="text-xs text-gray-400 space-y-1">
                <p>{t("scoringExact")}</p>
                <p>{t("scoringOff1")}</p>
                <p>{t("scoringOff2")}</p>
                <p>{t("scoringOff3")}</p>
                <p>{t("scoringOff4")}</p>
                <p>{t("scoringOff5")}</p>
              </div>
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
                      className={`p-3 rounded-lg ${
                        index === 0
                          ? "bg-yellow-900/30 border border-yellow-700/50"
                          : index === 1
                          ? "bg-gray-700/50 border border-gray-600/50"
                          : index === 2
                          ? "bg-orange-900/30 border border-orange-700/50"
                          : "bg-gray-700/30"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-gray-400 w-6">{index + 1}</span>
                        <img src={entry.avatarUrl} alt={entry.username} className="w-8 h-8 rounded-full" />
                        <div className="flex-1 min-w-0">
                          <span className="text-white font-medium truncate block">{entry.username}</span>
                        </div>
                        <span className="text-xl font-bold text-blue-400">{entry.totalPoints}</span>
                      </div>

                      {/* Show prediction details on expand (optional) */}
                      <details className="mt-2">
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">{t("showPredictions")}</summary>
                        <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                          {entry.predictions.map((pred) => (
                            <div key={`${pred.guildName}-${pred.predictedRank}`} className="flex items-center gap-1 text-gray-300">
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
