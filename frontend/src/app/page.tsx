"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { GuildListItem, Guild, Boss } from "@/types";
import { api } from "@/lib/api";
import { useRaids, useEvents, useGuilds, useRaidDates } from "@/lib/queries";
import GuildTable from "@/components/GuildTable";
import IntegratedRaidSelector from "@/components/IntegratedRaidSelector";
import HorizontalEventsFeed from "@/components/HorizontalEventsFeed";
import RaidDetailModal from "@/components/RaidDetailModal";

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [selectedRaidId, setSelectedRaidId] = useState<number | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Modal state for raid detail
  const [selectedGuildDetail, setSelectedGuildDetail] = useState<Guild | null>(null);
  const [bossesForSelectedRaid, setBossesForSelectedRaid] = useState<Boss[]>([]);

  // Track whether we've initialized selectedRaidId from URL/data
  const hasInitializedRaid = useRef(false);

  // ─── React Query hooks ──────────────────────────────────────────────────────
  const { data: raids = [], isLoading: raidsLoading, error: raidsError } = useRaids();
  const { data: events = [], error: eventsError } = useEvents(5);
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

      try {
        setModalError(null);
        const [bossProgress, bosses] = await Promise.all([api.getGuildBossProgressByRealmName(guild.realm, guild.name, selectedRaidId), api.getBosses(selectedRaidId)]);

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
        setModalError("Failed to load raid details.");
      }
    },
    [selectedRaidId],
  );

  // Handle closing raid detail modal
  const handleCloseModal = useCallback(() => {
    setSelectedGuildDetail(null);
    setBossesForSelectedRaid([]);
    setModalError(null);
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
      <div className="container mx-auto px-3 md:px-4 max-w-full md:max-w-[95%] lg:max-w-[85%] pb-8">
        {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 rounded-lg mb-8">{error}</div>}

        {/* Events Feed at the top */}
        {events.length > 0 && (
          <div className="mb-2">
            <HorizontalEventsFeed events={events} />
          </div>
        )}

        {/* Integrated Raid Selector + Guild Leaderboard */}
        <div>
          {raids.length > 0 && <IntegratedRaidSelector raids={raids} selectedRaidId={selectedRaidId} onRaidSelect={handleRaidSelect} raidDates={raidDates ?? null} />}
          <GuildTable guilds={guilds} onGuildClick={handleGuildClick} onRaidProgressClick={handleRaidProgressClick} selectedRaidId={selectedRaidId} />
        </div>

        {/* Raid Detail Modal */}
        {selectedGuildDetail && selectedRaidId && (
          <RaidDetailModal guild={selectedGuildDetail} onClose={handleCloseModal} selectedRaidId={selectedRaidId} raids={raids} bosses={bossesForSelectedRaid} />
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
