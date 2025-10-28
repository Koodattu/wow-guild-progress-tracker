"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { GuildListItem, Event, RaidInfo, RaidDates } from "@/types";
import { api } from "@/lib/api";
import GuildTable from "@/components/GuildTable";
import HorizontalEventsFeed from "@/components/HorizontalEventsFeed";
import IntegratedRaidSelector from "@/components/IntegratedRaidSelector";

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [guilds, setGuilds] = useState<GuildListItem[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [raids, setRaids] = useState<RaidInfo[]>([]);
  const [raidDates, setRaidDates] = useState<RaidDates | null>(null);
  const [selectedRaidId, setSelectedRaidId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Initial data fetch - only raids and events
  const fetchInitialData = useCallback(async () => {
    try {
      setError(null);
      const [raidsData, eventsData] = await Promise.all([api.getRaids(), api.getEvents(5)]);

      setRaids(raidsData);
      setEvents(eventsData);

      // Check URL parameters
      const raidIdParam = searchParams.get("raidid");

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
          updateURL(raidToSelect);
        }
      }
    } catch (err) {
      console.error("Error fetching initial data:", err);
      setError("Failed to load data. Make sure the backend server is running.");
    } finally {
      setLoading(false);
    }
  }, [searchParams, updateURL]);

  // Fetch raid-specific data (dates and guilds) when raid is selected
  const fetchRaidData = useCallback(async (raidId: number) => {
    try {
      setError(null);
      const [datesData, guildsData] = await Promise.all([api.getRaidDates(raidId), api.getGuilds(raidId)]);

      setRaidDates(datesData);

      // Sort guilds by backend-calculated guild rank (lower is better)
      const sortedGuilds = guildsData.sort((a, b) => {
        const aMythic = a.progress.find((p) => p.difficulty === "mythic" && p.raidId === raidId);
        const bMythic = b.progress.find((p) => p.difficulty === "mythic" && p.raidId === raidId);
        const aHeroic = a.progress.find((p) => p.difficulty === "heroic" && p.raidId === raidId);
        const bHeroic = b.progress.find((p) => p.difficulty === "heroic" && p.raidId === raidId);

        // Get the effective progress (mythic if exists, otherwise heroic)
        const aProgress = aMythic || aHeroic;
        const bProgress = bMythic || bHeroic;

        // Guilds without progress go to the end
        if (!aProgress && !bProgress) return 0;
        if (!aProgress) return 1;
        if (!bProgress) return -1;

        // Use backend-calculated guildRank (lower is better)
        const aRank = aProgress.guildRank ?? 999;
        const bRank = bProgress.guildRank ?? 999;

        return aRank - bRank;
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

  // Handle guild click - navigate to guild profile page
  const handleGuildClick = useCallback(
    async (guild: GuildListItem) => {
      // Navigate to guild profile page without raid ID
      router.push(`/guilds/${guild._id}`);
    },
    [router]
  );

  // Auto-refresh with different intervals
  useEffect(() => {
    // Refresh events every 1 minute
    const eventsInterval = setInterval(() => {
      api.getEvents(5).then(setEvents);
    }, 60000);

    // Refresh guilds every 5 minutes
    const guildsInterval = setInterval(() => {
      if (selectedRaidId !== null) {
        fetchRaidData(selectedRaidId);
      }
    }, 300000);

    return () => {
      clearInterval(eventsInterval);
      clearInterval(guildsInterval);
    };
  }, [selectedRaidId, fetchRaidData]);

  // Handle raid selection change
  const handleRaidSelect = useCallback(
    (raidId: number) => {
      setSelectedRaidId(raidId);
      updateURL(raidId);
    },
    [updateURL]
  );

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
      <div className="container mx-auto px-4 max-w-[85%]">
        {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 rounded-lg mb-8">{error}</div>}

        {/* Horizontal Events Feed at the top */}
        <div className="mb-2">
          <HorizontalEventsFeed events={events} />
        </div>

        {/* Guild Leaderboard in the middle */}
        <div>
          {/* Integrated Raid Selector - replaces both the dropdown and the header */}
          {raids.length > 0 && <IntegratedRaidSelector raids={raids} selectedRaidId={selectedRaidId} onRaidSelect={handleRaidSelect} raidDates={raidDates} />}
          <GuildTable guilds={guilds} onGuildClick={handleGuildClick} selectedRaidId={selectedRaidId} />
        </div>
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
