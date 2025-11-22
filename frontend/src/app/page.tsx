"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { GuildListItem, Event, RaidInfo, RaidDates, Guild, Boss } from "@/types";
import { api } from "@/lib/api";
import GuildTable from "@/components/GuildTable";
import HorizontalEventsFeed from "@/components/HorizontalEventsFeed";
import IntegratedRaidSelector from "@/components/IntegratedRaidSelector";
import RaidDetailModal from "@/components/RaidDetailModal";

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

  // Modal state for raid detail
  const [selectedGuildDetail, setSelectedGuildDetail] = useState<Guild | null>(null);
  const [bossesForSelectedRaid, setBossesForSelectedRaid] = useState<Boss[]>([]);

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
      // Navigate to guild profile page using realm/name format
      const encodedRealm = encodeURIComponent(guild.realm);
      const encodedName = encodeURIComponent(guild.name);
      router.push(`/guilds/${encodedRealm}/${encodedName}`);
    },
    [router]
  );

  // Handle raid progress click - open raid detail modal
  const handleRaidProgressClick = useCallback(
    async (guild: GuildListItem) => {
      if (!selectedRaidId) return;

      try {
        setError(null);
        // Fetch boss progress for this specific raid and bosses list
        const [bossProgress, bosses] = await Promise.all([api.getGuildBossProgressByRealmName(guild.realm, guild.name, selectedRaidId), api.getBosses(selectedRaidId)]);

        // Create a detailed guild object for the modal
        const detailedGuild: Guild = {
          _id: guild._id,
          name: guild.name,
          realm: guild.realm,
          region: guild.region,
          faction: guild.faction,
          warcraftlogsId: guild.warcraftlogsId,
          crest: guild.crest,
          parent_guild: guild.parent_guild,
          isCurrentlyRaiding: guild.isCurrentlyRaiding,
          lastFetched: guild.lastFetched,
          progress: bossProgress,
        };

        setSelectedGuildDetail(detailedGuild);
        setBossesForSelectedRaid(bosses);
      } catch (err) {
        console.error("Error fetching raid details:", err);
        setError("Failed to load raid details.");
      }
    },
    [selectedRaidId]
  );

  // Handle closing raid detail modal
  const handleCloseModal = useCallback(() => {
    setSelectedGuildDetail(null);
    setBossesForSelectedRaid([]);
  }, []);

  // Auto-refresh with different intervals
  useEffect(() => {
    // Refresh events every 1 minute
    const eventsInterval = setInterval(() => {
      api
        .getEvents(5)
        .then(setEvents)
        .catch((err) => {
          console.error("Error refreshing events:", err);
        });
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
    <main className="bg-gray-950 text-white">
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
          <GuildTable guilds={guilds} onGuildClick={handleGuildClick} onRaidProgressClick={handleRaidProgressClick} selectedRaidId={selectedRaidId} />
        </div>

        {/* Raid Detail Modal */}
        {selectedGuildDetail && selectedRaidId && (
          <RaidDetailModal guild={selectedGuildDetail} onClose={handleCloseModal} selectedRaidId={selectedRaidId} raids={raids} bosses={bossesForSelectedRaid} />
        )}

        {/* Footer */}
        <footer className="mt-20 mb-4 pt-8 border-t border-gray-800">
          <div className="flex items-center justify-center gap-6 text-sm text-gray-500 mb-4">
            <a
              href="https://github.com/Koodattu/wow-guild-progress-tracker"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-300 transition-colors flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </a>
            <a href="https://discord.gg/BgQDncamHZ" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Discord
            </a>
            <a href="https://www.twitch.tv/vaarattu" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
              </svg>
              Twitch
            </a>
          </div>
          <div className="text-center">
            <p className="text-gray-400">
              Made with ❤️ by{" "}
              <a href="https://www.twitch.tv/vaarattu" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors">
                Vaarattu
              </a>
              . Send feedback.
            </p>
          </div>
        </footer>
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
