"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";
import { GuildSummary, Guild, RaidProgressSummary, RaidInfo, Boss } from "@/types";
import { api } from "@/lib/api";
import { formatTime, formatPercent, getDifficultyColor, getIconUrl } from "@/lib/utils";
import GuildDetail from "@/components/GuildDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function GuildProfilePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isClosingModalRef = useRef(false);

  const [guildSummary, setGuildSummary] = useState<GuildSummary | null>(null);
  const [selectedGuildDetail, setSelectedGuildDetail] = useState<Guild | null>(null);
  const [raids, setRaids] = useState<RaidInfo[]>([]);
  const [selectedRaidId, setSelectedRaidId] = useState<number | null>(null);
  const [bossesForSelectedRaid, setBossesForSelectedRaid] = useState<Boss[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Helper function to update URL with query parameters
  const updateURL = useCallback(
    (raidId: number | null) => {
      const params = new URLSearchParams();
      if (raidId) params.set("raidid", raidId.toString());

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [pathname, router]
  );

  // Initial data fetch - guild summary and raids
  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        const [summaryData, raidsData] = await Promise.all([api.getGuildSummary(resolvedParams.id), api.getRaids()]);

        setGuildSummary(summaryData);
        setRaids(raidsData);

        // Check URL for raid ID parameter
        const raidIdParam = searchParams.get("raidid");
        if (raidIdParam) {
          const raidId = parseInt(raidIdParam, 10);
          if (!isNaN(raidId)) {
            setSelectedRaidId(raidId);
          }
        }

        setInitialLoadComplete(true);
      } catch (err) {
        console.error("Error fetching guild profile:", err);
        setError("Failed to load guild profile. Make sure the backend server is running.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [resolvedParams.id, searchParams]);

  // Handle raid click - fetch full progress for that raid
  const handleRaidClick = useCallback(
    async (raidId: number) => {
      if (!guildSummary) return;

      try {
        setError(null);
        // Fetch boss progress for this specific raid and bosses list
        const [bossProgress, bosses] = await Promise.all([api.getGuildBossProgress(guildSummary._id, raidId), api.getBosses(raidId)]);

        // Create a detailed guild object for the modal
        const detailedGuild: Guild = {
          _id: guildSummary._id,
          name: guildSummary.name,
          realm: guildSummary.realm,
          region: guildSummary.region,
          faction: guildSummary.faction,
          isCurrentlyRaiding: guildSummary.isCurrentlyRaiding,
          lastFetched: guildSummary.lastFetched,
          progress: bossProgress,
        };

        setSelectedGuildDetail(detailedGuild);
        setBossesForSelectedRaid(bosses);
        setSelectedRaidId(raidId);
        updateURL(raidId);
      } catch (err) {
        console.error("Error fetching raid details:", err);
        setError("Failed to load raid details.");
      }
    },
    [guildSummary, updateURL]
  );

  // Handle raid selection from URL parameter after initial load
  useEffect(() => {
    if (!initialLoadComplete || !guildSummary || !selectedRaidId || selectedGuildDetail) return;

    // Only open raid detail if there's a raidid in URL AND we don't have details loaded
    // AND we're not in the process of closing the modal
    if (!isClosingModalRef.current) {
      handleRaidClick(selectedRaidId);
    }

    // Reset the closing flag after the effect runs
    if (isClosingModalRef.current) {
      isClosingModalRef.current = false;
    }
  }, [initialLoadComplete, guildSummary, selectedRaidId, selectedGuildDetail, handleRaidClick]);

  // Handle closing raid detail modal
  const handleCloseModal = useCallback(() => {
    isClosingModalRef.current = true;
    setSelectedGuildDetail(null);
    setSelectedRaidId(null);
    setBossesForSelectedRaid([]);
    updateURL(null);
  }, [updateURL]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⚔️</div>
          <div className="text-white text-xl">Loading guild profile...</div>
        </div>
      </div>
    );
  }

  if (error || !guildSummary) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">{error || "Guild not found"}</div>
          <button onClick={() => router.push("/guilds")} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
            Back to Guilds
          </button>
        </div>
      </div>
    );
  }

  // Group progress by expansion
  const progressByExpansion = new Map<string, { raid: RaidInfo; progress: RaidProgressSummary[] }[]>();

  guildSummary.progress.forEach((progress) => {
    const raid = raids.find((r) => r.id === progress.raidId);
    if (!raid) return;

    if (!progressByExpansion.has(raid.expansion)) {
      progressByExpansion.set(raid.expansion, []);
    }

    const expansionRaids = progressByExpansion.get(raid.expansion)!;
    let raidEntry = expansionRaids.find((entry) => entry.raid.id === raid.id);

    if (!raidEntry) {
      raidEntry = { raid, progress: [] };
      expansionRaids.push(raidEntry);
    }

    raidEntry.progress.push(progress);
  });

  // Sort expansions by newest first (based on raid IDs)
  const sortedExpansions = Array.from(progressByExpansion.entries()).sort((a, b) => {
    const aMaxRaidId = Math.max(...a[1].map((entry) => entry.raid.id));
    const bMaxRaidId = Math.max(...b[1].map((entry) => entry.raid.id));
    return bMaxRaidId - aMaxRaidId;
  });

  // Sort raids within each expansion (newest first)
  sortedExpansions.forEach(([, raids]) => {
    raids.sort((a, b) => b.raid.id - a.raid.id);
  });

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Guild Header */}
        <div className="mb-8 bg-gray-900 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">{guildSummary.name}</h1>
              <p className="text-gray-400 text-lg">
                {guildSummary.realm} - {guildSummary.region.toUpperCase()}
              </p>
              {guildSummary.faction && <p className="text-gray-500 mt-1">{guildSummary.faction}</p>}
            </div>
            <button onClick={() => router.push("/guilds")} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors border border-gray-700">
              Back to Guilds
            </button>
          </div>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-gray-400">Currently Raiding: </span>
              <span className={guildSummary.isCurrentlyRaiding ? "text-green-400 font-semibold" : "text-gray-500"}>{guildSummary.isCurrentlyRaiding ? "Yes" : "No"}</span>
            </div>
            {guildSummary.lastFetched && (
              <div>
                <span className="text-gray-400">Last Updated: </span>
                <span className="text-white">{new Date(guildSummary.lastFetched).toLocaleString("fi-FI")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress by Expansion */}
        {guildSummary.progress.length > 0 ? (
          <div className="space-y-8">
            {sortedExpansions.map(([expansion, raidEntries]) => {
              const expansionIconPath = expansion.toLowerCase().replace(/\s+/g, "-");

              return (
                <div key={expansion} className="bg-gray-900 rounded-lg border border-gray-700 p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Image src={`/expansions/${expansionIconPath}.png`} alt={`${expansion} icon`} height={24} width={38} />
                    <h2 className="text-2xl font-bold text-gray-300">{expansion}</h2>
                  </div>

                  <div className="space-y-6">
                    {raidEntries.map(({ raid, progress: raidProgress }) => {
                      const iconUrl = getIconUrl(raid.iconUrl);

                      // Sort progress by difficulty (mythic first)
                      const sortedProgress = [...raidProgress].sort((a, b) => {
                        if (a.difficulty !== b.difficulty) {
                          return a.difficulty === "mythic" ? -1 : 1;
                        }
                        return 0;
                      });

                      return (
                        <div key={raid.id} className="border-l-4 border-gray-700 pl-4">
                          <div className="flex items-center gap-3 mb-3">
                            {iconUrl && <Image src={iconUrl} alt="Raid icon" width={32} height={32} className="rounded" />}
                            <h3 className="text-xl font-bold text-white">{raid.name}</h3>
                          </div>

                          <div className="space-y-2">
                            {sortedProgress.map((diffProgress) => {
                              const hasProgress = diffProgress.bossesDefeated > 0 || diffProgress.currentBossPulls > 0;
                              if (!hasProgress) return null;

                              return (
                                <button
                                  key={`${raid.id}-${diffProgress.difficulty}`}
                                  onClick={() => handleRaidClick(raid.id)}
                                  className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg p-4 transition-colors border border-gray-700 hover:border-gray-600"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className={`font-semibold ${getDifficultyColor(diffProgress.difficulty)}`}>
                                      {diffProgress.difficulty.charAt(0).toUpperCase() + diffProgress.difficulty.slice(1)}
                                    </span>
                                    <span className="text-sm text-gray-500">Click to view details →</span>
                                  </div>

                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                      <div className="text-gray-400 mb-1">Progress</div>
                                      <div className="text-white font-semibold">
                                        {diffProgress.bossesDefeated}/{diffProgress.totalBosses}
                                      </div>
                                    </div>

                                    <div>
                                      <div className="text-gray-400 mb-1">Total Time</div>
                                      <div className="text-white font-semibold">{formatTime(diffProgress.totalTimeSpent)}</div>
                                    </div>

                                    <div>
                                      <div className="text-gray-400 mb-1">Current Boss Pulls</div>
                                      <div className="text-white font-semibold">{diffProgress.currentBossPulls || "-"}</div>
                                    </div>

                                    <div>
                                      <div className="text-gray-400 mb-1">Best Progress</div>
                                      <div className="text-white font-semibold">
                                        {diffProgress.bestPullPhase?.displayString || (diffProgress.bestPullPercent < 100 ? formatPercent(diffProgress.bestPullPercent) : "-")}
                                      </div>
                                    </div>
                                  </div>

                                  {diffProgress.lastKillTime && (
                                    <div className="mt-2 text-xs text-gray-500">Last kill: {new Date(diffProgress.lastKillTime).toLocaleString("fi-FI")}</div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 bg-gray-900 rounded-lg border border-gray-700">No progress data available for this guild yet.</div>
        )}

        {/* Raid Detail Modal */}
        {selectedGuildDetail && selectedRaidId && (
          <GuildDetail guild={selectedGuildDetail} onClose={handleCloseModal} selectedRaidId={selectedRaidId} raids={raids} bosses={bossesForSelectedRaid} />
        )}
      </div>
    </main>
  );
}
