"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { GuildListItem, Guild, Event, RaidInfo, Boss, RaidDates } from "@/types";
import { api } from "@/lib/api";
import GuildTable from "@/components/GuildTable";
import GuildDetail from "@/components/GuildDetail";
import EventsFeed from "@/components/EventsFeed";
import IntegratedRaidSelector from "@/components/IntegratedRaidSelector";

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isClosingModalRef = useRef(false);

  const [guilds, setGuilds] = useState<GuildListItem[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [raids, setRaids] = useState<RaidInfo[]>([]);
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [raidDates, setRaidDates] = useState<RaidDates | null>(null);
  const [selectedRaidId, setSelectedRaidId] = useState<number | null>(null);
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Helper function to update URL with query parameters
  const updateURL = useCallback(
    (raidId: number | null, guildId: string | null) => {
      const params = new URLSearchParams();
      if (raidId) params.set("raidid", raidId.toString());
      if (guildId) params.set("guildid", guildId);

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [pathname, router]
  );

  // Initial data fetch - only raids and events
  const fetchInitialData = useCallback(async () => {
    try {
      setError(null);
      const [raidsData, eventsData] = await Promise.all([api.getRaids(), api.getEvents(5)]);

      setRaids(raidsData);
      setEvents(eventsData);

      // Check URL parameters
      const raidIdParam = searchParams.get("raidid");
      const guildIdParam = searchParams.get("guildid");

      let raidToSelect: number | null = null;

      // Try to use raid ID from URL first
      if (raidIdParam) {
        const raidId = parseInt(raidIdParam, 10);
        if (!isNaN(raidId) && raidsData.some((r) => r.id === raidId)) {
          raidToSelect = raidId;
        }
      }

      // If no valid raid ID in URL, select the first raid by default
      if (!raidToSelect && raidsData.length > 0) {
        raidToSelect = raidsData[0].id;
      }

      if (raidToSelect) {
        setSelectedRaidId(raidToSelect);
        // Update URL if raid was auto-selected (not from URL param)
        if (!raidIdParam) {
          updateURL(raidToSelect, null);
        }
      }

      setInitialLoadComplete(true);

      // If there's a guild ID in URL, we'll handle it after raid data loads
      if (guildIdParam && raidToSelect) {
        // We'll trigger guild selection after guilds are loaded
        // This is handled in a separate effect below
      }
    } catch (err) {
      console.error("Error fetching initial data:", err);
      setError("Failed to load data. Make sure the backend server is running.");
    } finally {
      setLoading(false);
    }
  }, [searchParams, updateURL]);

  // Fetch raid-specific data (bosses, dates, and guilds) when raid is selected
  const fetchRaidData = useCallback(async (raidId: number) => {
    try {
      setError(null);
      const [bossesData, datesData, guildsData] = await Promise.all([api.getBosses(raidId), api.getRaidDates(raidId), api.getGuilds(raidId)]);

      setBosses(bossesData);
      setRaidDates(datesData);

      // Sort guilds by proper ranking criteria
      const sortedGuilds = guildsData.sort((a, b) => {
        const aMythic = a.progress.find((p) => p.difficulty === "mythic" && p.raidId === raidId);
        const bMythic = b.progress.find((p) => p.difficulty === "mythic" && p.raidId === raidId);
        const aHeroic = a.progress.find((p) => p.difficulty === "heroic" && p.raidId === raidId);
        const bHeroic = b.progress.find((p) => p.difficulty === "heroic" && p.raidId === raidId);

        // Get the effective progress (mythic if exists, otherwise heroic)
        const aProgress = aMythic || aHeroic;
        const bProgress = bMythic || bHeroic;

        // If neither guild has any progress, they're equal
        if (!aProgress && !bProgress) return 0;
        if (!aProgress) return 1;
        if (!bProgress) return -1;

        // Rule 2: Even one mythic boss kill is better than any number of heroic boss kills
        const aIsMythic = !!aMythic && aMythic.bossesDefeated > 0;
        const bIsMythic = !!bMythic && bMythic.bossesDefeated > 0;

        if (aIsMythic && !bIsMythic) return -1;
        if (!aIsMythic && bIsMythic) return 1;

        // Rule 1: Most boss kills first (within the same difficulty tier)
        const aBossesKilled = aProgress.bossesDefeated;
        const bBossesKilled = bProgress.bossesDefeated;

        if (aBossesKilled !== bBossesKilled) {
          return bBossesKilled - aBossesKilled;
        }

        // Rule 3: If same amount of boss kills, who killed the latest boss first is ranked higher
        if (aBossesKilled > 0 && bBossesKilled > 0) {
          const aLastKill = aProgress.lastKillTime ? new Date(aProgress.lastKillTime).getTime() : 0;
          const bLastKill = bProgress.lastKillTime ? new Date(bProgress.lastKillTime).getTime() : 0;

          if (aLastKill !== bLastKill) {
            // Earlier kill time = better rank (lower number)
            return aLastKill - bLastKill;
          }
        }

        // Rule 4: If same boss kills and progressing, best pull progress wins
        // fightCompletion goes from 100 (start) to 0 (end/kill), so LOWER is better
        const aFightCompletion = aProgress.bestPullPhase?.fightCompletion ?? 100;
        const bFightCompletion = bProgress.bestPullPhase?.fightCompletion ?? 100;

        if (aFightCompletion !== bFightCompletion) {
          return aFightCompletion - bFightCompletion; // Lower is better
        }

        // If still tied, use bestPullPercent as tiebreaker (lower is better)
        if (aProgress.bestPullPercent !== bProgress.bestPullPercent) {
          return aProgress.bestPullPercent - bProgress.bestPullPercent;
        }

        // Final tiebreaker: alphabetically by guild name
        return a.name.localeCompare(b.name);
      });

      setGuilds(sortedGuilds);
    } catch (err) {
      console.error("Error fetching raid data:", err);
      setError("Failed to load raid data.");
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Fetch raid-specific data when raid selection changes
  useEffect(() => {
    if (selectedRaidId !== null) {
      fetchRaidData(selectedRaidId);
    }
  }, [selectedRaidId, fetchRaidData]);

  // Handle guild click - fetch boss progress and merge with existing guild info
  const handleGuildClick = useCallback(
    async (guild: GuildListItem) => {
      if (!selectedRaidId) return;

      try {
        // Fetch only the boss progress (not the entire guild data again)
        const bossProgress = await api.getGuildBossProgress(guild._id, selectedRaidId);

        // Merge the guild info we already have with the detailed boss progress
        const detailedGuild: Guild = {
          _id: guild._id,
          name: guild.name,
          realm: guild.realm,
          region: guild.region,
          faction: guild.faction,
          isCurrentlyRaiding: guild.isCurrentlyRaiding,
          lastFetched: guild.lastFetched,
          progress: bossProgress, // Use the full progress with bosses array
        };

        setSelectedGuild(detailedGuild);
        // Update URL with guild ID
        updateURL(selectedRaidId, guild._id);
      } catch (err) {
        console.error("Error fetching guild boss progress:", err);
        setError("Failed to load guild details.");
      }
    },
    [selectedRaidId, updateURL]
  );

  // Handle guild selection from URL parameter after guilds are loaded
  useEffect(() => {
    if (!initialLoadComplete || guilds.length === 0 || !selectedRaidId) return;

    const guildIdParam = searchParams.get("guildid");

    // Only open guild if there's a guildid in URL AND we don't have a guild selected
    // AND we're not in the process of closing the modal
    if (guildIdParam && !selectedGuild && !isClosingModalRef.current) {
      // Find the guild in the loaded guilds list
      const guildToOpen = guilds.find((g) => g._id === guildIdParam);
      if (guildToOpen) {
        handleGuildClick(guildToOpen);
      }
    }

    // Reset the closing flag after the effect runs
    if (isClosingModalRef.current) {
      isClosingModalRef.current = false;
    }
  }, [guilds, initialLoadComplete, selectedRaidId, selectedGuild, searchParams, handleGuildClick]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedRaidId !== null) {
        fetchRaidData(selectedRaidId);
        api.getEvents(5).then(setEvents);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedRaidId, fetchRaidData]);

  // Handle raid selection change
  const handleRaidSelect = useCallback(
    (raidId: number) => {
      setSelectedRaidId(raidId);
      setSelectedGuild(null); // Close guild modal when switching raids
      updateURL(raidId, null);
    },
    [updateURL]
  );

  // Handle closing guild modal
  const handleCloseGuildModal = useCallback(() => {
    isClosingModalRef.current = true; // Set flag to prevent reopening
    setSelectedGuild(null);
    // Remove guild ID from URL but keep raid ID
    updateURL(selectedRaidId, null);
  }, [selectedRaidId, updateURL]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⚔️</div>
          <div className="text-white text-xl">Loading guild data...</div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 py-8 max-w-[75%]">
        {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-8">{error}</div>}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Guild List - Takes 2/3 on large screens */}
          <div className="lg:col-span-2">
            <div className="bg-gray-900 rounded-lg border border-gray-700 p-6">
              {/* Integrated Raid Selector - replaces both the dropdown and the header */}
              {raids.length > 0 && <IntegratedRaidSelector raids={raids} selectedRaidId={selectedRaidId} onRaidSelect={handleRaidSelect} raidDates={raidDates} />}
              <GuildTable guilds={guilds} onGuildClick={handleGuildClick} selectedRaidId={selectedRaidId} />
            </div>
          </div>

          {/* Events Feed - Takes 1/3 on large screens */}
          <div className="lg:col-span-1">
            <EventsFeed events={events} maxDisplay={5} />
          </div>
        </div>

        {/* Guild Detail Modal */}
        {selectedGuild && <GuildDetail guild={selectedGuild} onClose={handleCloseGuildModal} selectedRaidId={selectedRaidId} raids={raids} bosses={bosses} />}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">⚔️</div>
            <div className="text-white text-xl">Loading guild data...</div>
          </div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
