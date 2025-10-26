"use client";

import { use, useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";
import { GuildSummary, Guild, RaidProgressSummary, RaidInfo, Boss } from "@/types";
import { api } from "@/lib/api";
import { formatTime, formatPercent, getIconUrl } from "@/lib/utils";
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

  // Group progress by expansion and consolidate raid data
  const progressByExpansion = new Map<
    string,
    {
      raid: RaidInfo;
      mythicProgress: RaidProgressSummary | null;
      heroicProgress: RaidProgressSummary | null;
    }[]
  >();

  // First, get all unique raids
  const uniqueRaids = new Map<number, RaidInfo>();
  raids.forEach((raid) => {
    uniqueRaids.set(raid.id, raid);
  });

  // Group progress by expansion
  uniqueRaids.forEach((raid) => {
    const mythicProgress = guildSummary.progress.find((p) => p.raidId === raid.id && p.difficulty === "mythic") || null;
    const heroicProgress = guildSummary.progress.find((p) => p.raidId === raid.id && p.difficulty === "heroic") || null;

    // Only include raids where the guild has some progress
    if (mythicProgress || heroicProgress) {
      if (!progressByExpansion.has(raid.expansion)) {
        progressByExpansion.set(raid.expansion, []);
      }

      progressByExpansion.get(raid.expansion)!.push({
        raid,
        mythicProgress,
        heroicProgress,
      });
    }
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

        {/* Progress Table */}
        {guildSummary.progress.length > 0 ? (
          <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-800/50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Raid</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-orange-500">Mythic</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-purple-500">Heroic</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">Total Time</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">Current Boss Pulls</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">Best Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedExpansions.map(([expansion, raidEntries]) => {
                    const expansionIconPath = expansion.toLowerCase().replace(/\s+/g, "-");

                    return (
                      <Fragment key={`expansion-${expansion}`}>
                        {/* Expansion Separator Row */}
                        <tr className="bg-gray-800/70 border-b border-gray-700">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-300">{expansion}</span>
                              <Image src={`/expansions/${expansionIconPath}.png`} alt={`${expansion} icon`} height={20} width={32} />
                            </div>
                          </td>
                        </tr>

                        {/* Raid Rows */}
                        {raidEntries.map(({ raid, mythicProgress, heroicProgress }) => {
                          const iconUrl = getIconUrl(raid.iconUrl);
                          const totalTime = (mythicProgress?.totalTimeSpent || 0) + (heroicProgress?.totalTimeSpent || 0);
                          const currentBossPulls = mythicProgress?.currentBossPulls || 0;
                          const bestProgress =
                            mythicProgress?.bestPullPhase?.displayString ||
                            (mythicProgress && mythicProgress.bestPullPercent < 100 ? formatPercent(mythicProgress.bestPullPercent) : "-");

                          return (
                            <tr key={raid.id} onClick={() => handleRaidClick(raid.id)} className="border-b border-gray-800 hover:bg-gray-800/30 cursor-pointer transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {iconUrl && <Image src={iconUrl} alt="Raid icon" width={24} height={24} className="rounded" />}
                                  <span className="font-semibold text-white">{raid.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-orange-500 font-semibold">{mythicProgress ? `${mythicProgress.bossesDefeated}/${mythicProgress.totalBosses}` : "-"}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-purple-500 font-semibold">{heroicProgress ? `${heroicProgress.bossesDefeated}/${heroicProgress.totalBosses}` : "-"}</span>
                              </td>
                              <td className="px-4 py-3 text-center text-sm text-gray-300">{totalTime > 0 ? formatTime(totalTime) : "-"}</td>
                              <td className="px-4 py-3 text-center text-sm text-gray-300">{currentBossPulls > 0 ? currentBossPulls : "-"}</td>
                              <td className="px-4 py-3 text-center text-sm text-gray-300">{bestProgress}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
