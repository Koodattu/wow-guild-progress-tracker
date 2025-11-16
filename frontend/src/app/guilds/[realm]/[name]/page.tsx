"use client";

import { use, useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";
import { GuildSummary, Guild, RaidProgressSummary, RaidInfo, Boss } from "@/types";
import { api } from "@/lib/api";
import { formatTime, formatPercent, getIconUrl, formatPhaseDisplay, getWorldRankColor, getLeaderboardRankColor, getRaiderIOGuildUrl } from "@/lib/utils";
import RaidDetailModal from "@/components/RaidDetailModal";
import GuildCrest from "@/components/GuildCrest";

interface PageProps {
  params: Promise<{ realm: string; name: string }>;
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
  const [showAllRaids, setShowAllRaids] = useState(false);

  // Hover state for clickable areas
  const [hoveredRaidInfoRow, setHoveredRaidInfoRow] = useState<number | null>(null);
  const [hoveredRaidProgressRow, setHoveredRaidProgressRow] = useState<number | null>(null);

  // Decode URL parameters
  const realm = decodeURIComponent(resolvedParams.realm);
  const name = decodeURIComponent(resolvedParams.name);

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
        const [summaryData, raidsData] = await Promise.all([api.getGuildSummaryByRealmName(realm, name), api.getRaids()]);

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
  }, [realm, name, searchParams]);

  // Handle raid click - fetch full progress for that raid
  const handleRaidClick = useCallback(
    async (raidId: number) => {
      if (!guildSummary) return;

      try {
        setError(null);
        // Fetch boss progress for this specific raid and bosses list
        const [bossProgress, bosses] = await Promise.all([api.getGuildBossProgressByRealmName(realm, name, raidId), api.getBosses(raidId)]);

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
    [guildSummary, realm, name, updateURL]
  );

  // Handle raid info click - navigate to main page with raid selected
  const handleRaidInfoClick = useCallback(
    (raidId: number) => {
      router.push(`/?raidid=${raidId}`);
    },
    [router]
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

    // Include raids based on showAllRaids toggle
    const hasProgress = mythicProgress || heroicProgress;
    if (showAllRaids || hasProgress) {
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
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Guild Header */}
        <div className={`mb-4 flex items-start justify-between ${guildSummary.isCurrentlyRaiding ? "border-l-4 border-l-green-500 pl-4" : ""}`}>
          <div>
            <div className="flex items-center gap-3 mb-3">
              <GuildCrest crest={guildSummary.crest} faction={guildSummary.faction} size={128} className="shrink-0" drawFactionCircle={true} />
              <div className="flex items-center gap-2">
                <h1 className="text-5xl font-bold text-white">
                  {guildSummary.parent_guild ? (
                    <>
                      {guildSummary.name}
                      <span className="text-gray-400 font-normal">
                        {" "}
                        ({guildSummary.parent_guild}-{guildSummary.realm})
                      </span>
                    </>
                  ) : (
                    <>
                      {guildSummary.name}
                      <span className="text-gray-400 font-normal">-{guildSummary.realm}</span>
                    </>
                  )}
                </h1>
                {guildSummary.warcraftlogsId && (
                  <a
                    href={`https://www.warcraftlogs.com/guild/id/${guildSummary.warcraftlogsId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-8 h-8 hover:opacity-80 transition-opacity"
                    title="View on Warcraft Logs"
                  >
                    <Image src="/wcl-logo.png" alt="WCL" width={32} height={32} className="w-full h-full object-contain" />
                  </a>
                )}
                <a
                  href={getRaiderIOGuildUrl(guildSummary.region, guildSummary.realm, guildSummary.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-8 h-8 hover:opacity-80 transition-opacity"
                  title="View on Raider.IO"
                >
                  <Image src="/raiderio-logo.png" alt="Raider.IO" width={32} height={32} className="w-full h-full object-contain" />
                </a>
              </div>
              {guildSummary.isCurrentlyRaiding && <span className="text-sm px-3 py-1 rounded font-semibold bg-green-900/50 text-green-300">Raiding</span>}
            </div>
            {/* Raid Schedule Display */}
            {guildSummary.raidSchedule && guildSummary.raidSchedule.days && guildSummary.raidSchedule.days.length > 0 && (
              <div className="mt-3 text-sm text-gray-300">
                <div className="flex flex-wrap gap-2">
                  {[...guildSummary.raidSchedule.days]
                    .sort((a, b) => {
                      const weekOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
                      return weekOrder.indexOf(a.day) - weekOrder.indexOf(b.day);
                    })
                    .map((day, index) => {
                      const formatHour = (hour: number): string => {
                        const h = Math.floor(hour);
                        const m = (hour % 1) * 60;
                        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
                      };
                      return (
                        <span key={index} className="px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700">
                          {day.day} {formatHour(day.startHour)}-{formatHour(day.endHour)}
                        </span>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
          {guildSummary.lastFetched && (
            <div className="text-right text-sm text-gray-400 self-end">
              <div className="text-gray-500">Last Updated: {new Date(guildSummary.lastFetched).toLocaleString("fi-FI")}</div>
            </div>
          )}
        </div>

        {/* Progress Table */}
        {guildSummary.progress.length > 0 ? (
          <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-800/50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                      <div className="flex items-center gap-3">
                        <span>Raid</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowAllRaids(!showAllRaids)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showAllRaids ? "bg-blue-600" : "bg-gray-700"}`}
                            role="switch"
                            aria-checked={showAllRaids}
                          >
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${showAllRaids ? "translate-x-5" : "translate-x-1"}`} />
                          </button>
                          <span className="text-xs text-gray-400 font-normal whitespace-nowrap">Show All</span>
                        </div>
                      </div>
                    </th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-gray-300">Rank</th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-gray-300">World</th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-orange-500">Mythic</th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-purple-500">Heroic</th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-gray-300">Time</th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-gray-300">Pulls</th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-gray-300">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedExpansions.map(([expansion, raidEntries]) => {
                    const expansionIconPath = expansion.toLowerCase().replace(/\s+/g, "-");

                    return (
                      <Fragment key={`expansion-${expansion}`}>
                        {/* Expansion Separator Row */}
                        <tr className="bg-gray-800/70 border-b border-gray-700">
                          <td colSpan={8} className="px-4 py-2">
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
                          const bestProgress = mythicProgress?.bestPullPhase?.displayString
                            ? formatPhaseDisplay(mythicProgress.bestPullPhase.displayString)
                            : mythicProgress && mythicProgress.bestPullPercent < 100
                            ? formatPercent(mythicProgress.bestPullPercent)
                            : "-";

                          // Get guild rank - prefer mythic, fall back to heroic
                          const guildRank = mythicProgress?.guildRank || heroicProgress?.guildRank;

                          // Get world rank - prefer mythic, fall back to heroic
                          const worldRank = mythicProgress?.worldRank || heroicProgress?.worldRank;
                          const worldRankColor = mythicProgress?.worldRankColor || heroicProgress?.worldRankColor;

                          // Check if this raid has any progress
                          const hasProgress = mythicProgress || heroicProgress;

                          return (
                            <tr key={raid.id} className="border-b border-gray-800">
                              {/* First clickable area: Raid Name, Rank, World Rank */}
                              <td
                                className={`px-4 py-3 cursor-pointer transition-colors ${hoveredRaidInfoRow === raid.id ? "bg-gray-800/30" : ""} ${
                                  !hasProgress ? "opacity-40" : ""
                                }`}
                                onClick={() => handleRaidInfoClick(raid.id)}
                                onMouseEnter={() => setHoveredRaidInfoRow(raid.id)}
                                onMouseLeave={() => setHoveredRaidInfoRow(null)}
                              >
                                <div className="flex items-center gap-3">
                                  {iconUrl && <Image src={iconUrl} alt="Raid icon" width={24} height={24} className="rounded" />}
                                  <span className="font-semibold text-white">{raid.name}</span>
                                </div>
                              </td>
                              <td
                                className={`px-4 py-3 text-center cursor-pointer transition-colors ${hoveredRaidInfoRow === raid.id ? "bg-gray-800/30" : ""} ${
                                  !hasProgress ? "opacity-40" : ""
                                }`}
                                onClick={() => handleRaidInfoClick(raid.id)}
                                onMouseEnter={() => setHoveredRaidInfoRow(raid.id)}
                                onMouseLeave={() => setHoveredRaidInfoRow(null)}
                              >
                                {guildRank ? <span className={`font-semibold ${getLeaderboardRankColor(guildRank)}`}>{guildRank}</span> : <span className="text-gray-500">-</span>}
                              </td>
                              <td
                                className={`px-4 py-3 text-center cursor-pointer transition-colors ${hoveredRaidInfoRow === raid.id ? "bg-gray-800/30" : ""} ${
                                  !hasProgress ? "opacity-40" : ""
                                }`}
                                onClick={() => handleRaidInfoClick(raid.id)}
                                onMouseEnter={() => setHoveredRaidInfoRow(raid.id)}
                                onMouseLeave={() => setHoveredRaidInfoRow(null)}
                              >
                                {worldRank ? <span className={`font-semibold ${getWorldRankColor(worldRankColor)}`}>{worldRank}</span> : <span className="text-gray-500">-</span>}
                              </td>

                              {/* Second clickable area: Raid Progress columns */}
                              <td
                                className={`px-4 py-3 text-center transition-colors ${hoveredRaidProgressRow === raid.id ? "bg-gray-800/30" : ""} ${
                                  hasProgress ? "cursor-pointer" : "opacity-40 cursor-not-allowed"
                                }`}
                                onClick={() => hasProgress && handleRaidClick(raid.id)}
                                onMouseEnter={() => hasProgress && setHoveredRaidProgressRow(raid.id)}
                                onMouseLeave={() => setHoveredRaidProgressRow(null)}
                              >
                                <span className="text-orange-500 font-semibold">{mythicProgress ? `${mythicProgress.bossesDefeated}/${mythicProgress.totalBosses}` : "-"}</span>
                              </td>
                              <td
                                className={`px-4 py-3 text-center transition-colors ${hoveredRaidProgressRow === raid.id ? "bg-gray-800/30" : ""} ${
                                  hasProgress ? "cursor-pointer" : "opacity-40 cursor-not-allowed"
                                }`}
                                onClick={() => hasProgress && handleRaidClick(raid.id)}
                                onMouseEnter={() => hasProgress && setHoveredRaidProgressRow(raid.id)}
                                onMouseLeave={() => setHoveredRaidProgressRow(null)}
                              >
                                <span className="text-purple-500 font-semibold">{heroicProgress ? `${heroicProgress.bossesDefeated}/${heroicProgress.totalBosses}` : "-"}</span>
                              </td>
                              <td
                                className={`px-4 py-3 text-center text-sm text-gray-300 transition-colors ${hoveredRaidProgressRow === raid.id ? "bg-gray-800/30" : ""} ${
                                  hasProgress ? "cursor-pointer" : "opacity-40 cursor-not-allowed"
                                }`}
                                onClick={() => hasProgress && handleRaidClick(raid.id)}
                                onMouseEnter={() => hasProgress && setHoveredRaidProgressRow(raid.id)}
                                onMouseLeave={() => setHoveredRaidProgressRow(null)}
                              >
                                {totalTime > 0 ? formatTime(totalTime) : "-"}
                              </td>
                              <td
                                className={`px-4 py-3 text-center text-sm text-gray-300 transition-colors ${hoveredRaidProgressRow === raid.id ? "bg-gray-800/30" : ""} ${
                                  hasProgress ? "cursor-pointer" : "opacity-40 cursor-not-allowed"
                                }`}
                                onClick={() => hasProgress && handleRaidClick(raid.id)}
                                onMouseEnter={() => hasProgress && setHoveredRaidProgressRow(raid.id)}
                                onMouseLeave={() => setHoveredRaidProgressRow(null)}
                              >
                                {currentBossPulls > 0 ? currentBossPulls : "-"}
                              </td>
                              <td
                                className={`px-4 py-3 text-center text-sm text-gray-300 transition-colors ${hoveredRaidProgressRow === raid.id ? "bg-gray-800/30" : ""} ${
                                  hasProgress ? "cursor-pointer" : "opacity-40 cursor-not-allowed"
                                }`}
                                onClick={() => hasProgress && handleRaidClick(raid.id)}
                                onMouseEnter={() => hasProgress && setHoveredRaidProgressRow(raid.id)}
                                onMouseLeave={() => setHoveredRaidProgressRow(null)}
                              >
                                {bestProgress}
                              </td>
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
          <RaidDetailModal guild={selectedGuildDetail} onClose={handleCloseModal} selectedRaidId={selectedRaidId} raids={raids} bosses={bossesForSelectedRaid} />
        )}
      </div>
    </main>
  );
}
