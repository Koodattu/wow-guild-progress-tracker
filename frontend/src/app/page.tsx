"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { GuildListItem, Guild, Boss } from "@/types";
import { api } from "@/lib/api";
import { useRaids, useEventsPaginated, useGuilds, useRaidDates } from "@/lib/queries";
import { useEventFiltersFromCookies } from "@/lib/useEventFilters";
import GuildTable from "@/components/GuildTable";
import IntegratedRaidSelector from "@/components/IntegratedRaidSelector";
import HorizontalEventsFeed from "@/components/HorizontalEventsFeed";
import FeaturedStreamers from "@/components/FeaturedStreamers";
import RaidDetailModal from "@/components/RaidDetailModal";

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [selectedRaidId, setSelectedRaidId] = useState<number | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Modal state for raid detail
  const [selectedGuildDetail, setSelectedGuildDetail] = useState<Guild | null>(null);
  const [bossesForSelectedRaid, setBossesForSelectedRaid] = useState<Boss[]>([]);

  // Track whether we've initialized selectedRaidId from URL/data
  const hasInitializedRaid = useRef(false);

  // ─── React Query hooks ──────────────────────────────────────────────────────
  const { data: raids = [], isLoading: raidsLoading, error: raidsError } = useRaids();
  const eventFilters = useEventFiltersFromCookies();
  const { data: eventsData, error: eventsError } = useEventsPaginated(1, 5, eventFilters);
  const events = eventsData?.events ?? [];
  const { data: guilds = [], error: guildsError } = useGuilds(selectedRaidId ?? undefined);
  const { data: raidDates, error: raidDatesError } = useRaidDates(selectedRaidId);

  // Combined loading/error state
  const loading = raidsLoading;
  const queryError = raidsError || eventsError || guildsError || raidDatesError;
  const error = queryError ? "Failed to load data. Make sure the backend server is running." : modalError;

  // ─── Initialize selectedRaidId from URL params or first raid ────────────────
  useEffect(() => {
    if (hasInitializedRaid.current || raids.length === 0) return;
    hasInitializedRaid.current = true;

    const raidIdParam = searchParams.get("raidid");
    let raidToSelect: number | null = null;

    if (raidIdParam) {
      const raidId = parseInt(raidIdParam, 10);
      if (!isNaN(raidId) && raids.some((r) => r.id === raidId)) {
        raidToSelect = raidId;
      }
    }

    if (!raidToSelect) {
      raidToSelect = raids[0].id;
    }

    setSelectedRaidId(raidToSelect);

    // Update URL if raid was auto-selected (not from URL param)
    if (!raidIdParam) {
      const params = new URLSearchParams();
      params.set("raidid", raidToSelect.toString());
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [raids, searchParams, pathname, router]);

  // Helper function to update URL with query parameters
  const updateURL = useCallback(
    (raidId: number | null) => {
      const params = new URLSearchParams();
      if (raidId) params.set("raidid", raidId.toString());

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [pathname, router],
  );

  // Handle guild click - navigate to guild profile page
  const handleGuildClick = useCallback(
    (guild: GuildListItem) => {
      const encodedRealm = encodeURIComponent(guild.realm);
      const encodedName = encodeURIComponent(guild.name);
      router.push(`/guilds/${encodedRealm}/${encodedName}`);
    },
    [router],
  );

  // Handle raid progress click - open raid detail modal
  const handleRaidProgressClick = useCallback(
    async (guild: GuildListItem) => {
      if (!selectedRaidId) return;

      // Open modal immediately with empty progress
      const placeholderGuild: Guild = {
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
        progress: [],
      };

      setModalError(null);
      setSelectedGuildDetail(placeholderGuild);
      setModalLoading(true);

      try {
        const [bossProgressResponse, bosses] = await Promise.all([api.getGuildBossProgressByRealmName(guild.realm, guild.name, selectedRaidId), api.getBosses(selectedRaidId)]);

        setSelectedGuildDetail({
          ...placeholderGuild,
          progress: bossProgressResponse.progress,
          worldRankHistory: bossProgressResponse.worldRankHistory,
        });
        setBossesForSelectedRaid(bosses);
      } catch (err) {
        console.error("Error fetching raid details:", err);
        setModalError("Failed to load raid details.");
      } finally {
        setModalLoading(false);
      }
    },
    [selectedRaidId],
  );

  // Handle closing raid detail modal
  const handleCloseModal = useCallback(() => {
    setSelectedGuildDetail(null);
    setBossesForSelectedRaid([]);
    setModalError(null);
    setModalLoading(false);
  }, []);

  // Handle raid selection change
  const handleRaidSelect = useCallback(
    (raidId: number) => {
      setSelectedRaidId(raidId);
      updateURL(raidId);
    },
    [updateURL],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⚔️</div>
          <div className="text-white text-xl">Loading guild data...</div>
        </div>
      </div>
    );
  }

  return (
    <main className="text-white min-h-screen">
      {/* Events Feed - full width */}
      {events.length > 0 && (
        <div className="px-3 md:px-4 mb-2">
          <HorizontalEventsFeed events={events} />
        </div>
      )}

      {/* Featured Live Streamers */}
      <FeaturedStreamers />

      <div className="container mx-auto px-3 md:px-4 max-w-full md:max-w-[95%] lg:max-w-[85%] pb-8">
        {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 rounded-lg mb-8">{error}</div>}

        {/* Integrated Raid Selector + Guild Leaderboard */}
        <div>
          {raids.length > 0 && <IntegratedRaidSelector raids={raids} selectedRaidId={selectedRaidId} onRaidSelect={handleRaidSelect} raidDates={raidDates ?? null} />}
          <GuildTable guilds={guilds} onGuildClick={handleGuildClick} onRaidProgressClick={handleRaidProgressClick} selectedRaidId={selectedRaidId} />
        </div>

        {/* Raid Detail Modal */}
        {selectedGuildDetail && selectedRaidId && (
          <RaidDetailModal
            guild={selectedGuildDetail}
            onClose={handleCloseModal}
            selectedRaidId={selectedRaidId}
            raids={raids}
            bosses={bossesForSelectedRaid}
            loading={modalLoading}
          />
        )}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
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
