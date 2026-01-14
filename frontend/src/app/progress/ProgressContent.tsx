"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { GuildListItem, Event, RaidInfo, RaidDates, Guild, Boss } from "@/types";
import { api } from "@/lib/api";
import GuildTable from "@/components/GuildTable";
import IntegratedRaidSelector from "@/components/IntegratedRaidSelector";
import RaidDetailModal from "@/components/RaidDetailModal";

export default function ProgressContent() {
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

  // Modal state
  const [selectedGuildDetail, setSelectedGuildDetail] = useState<Guild | null>(null);
  const [bossesForSelectedRaid, setBossesForSelectedRaid] = useState<Boss[]>([]);

  // Update URL with query parameters
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

  // Initial data fetch - raids and events
  const fetchInitialData = useCallback(async () => {
    try {
      setError(null);
      const [raidsData, eventsData] = await Promise.all([api.getRaids(), api.getEvents(5)]);

      setRaids(raidsData);
      setEvents(eventsData);

      const raidIdParam = searchParams.get("raidid");
      let raidToSelect: number | null = null;

      if (raidIdParam) {
        const raidId = parseInt(raidIdParam, 10);
        if (!isNaN(raidId) && raidsData.some((r) => r.id === raidId)) {
          raidToSelect = raidId;
        }
      }

      if (!raidToSelect && raidsData.length > 0) {
        raidToSelect = raidsData[0].id;
      }

      if (raidToSelect) {
        setSelectedRaidId(raidToSelect);
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

  // Fetch raid-specific data
  const fetchRaidData = useCallback(async (raidId: number) => {
    try {
      setError(null);
      const [datesData, guildsData] = await Promise.all([api.getRaidDates(raidId), api.getGuilds(raidId)]);

      setRaidDates(datesData);
      setGuilds(guildsData);
    } catch (err) {
      console.error("Error fetching raid data:", err);
      setError("Failed to load raid data.");
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    if (selectedRaidId !== null) {
      fetchRaidData(selectedRaidId);
    }
  }, [selectedRaidId, fetchRaidData]);

  const handleGuildClick = useCallback(
    (guild: GuildListItem) => {
      const encodedRealm = encodeURIComponent(guild.realm);
      const encodedName = encodeURIComponent(guild.name);
      router.push(`/guilds/${encodedRealm}/${encodedName}`);
    },
    [router]
  );

  const handleRaidProgressClick = useCallback(
    async (guild: GuildListItem) => {
      if (!selectedRaidId) return;

      try {
        setError(null);
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
        setError("Failed to load raid details.");
      }
    },
    [selectedRaidId]
  );

  const handleCloseModal = useCallback(() => {
    setSelectedGuildDetail(null);
    setBossesForSelectedRaid([]);
  }, []);

  const handleRaidSelect = useCallback(
    (raidId: number) => {
      setSelectedRaidId(raidId);
      updateURL(raidId);
    },
    [updateURL]
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
        {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-2 rounded-lg mb-4">{error}</div>}

        <div>
          {raids.length > 0 && <IntegratedRaidSelector raids={raids} selectedRaidId={selectedRaidId} onRaidSelect={handleRaidSelect} raidDates={raidDates} />}
          <GuildTable guilds={guilds} onGuildClick={handleGuildClick} onRaidProgressClick={handleRaidProgressClick} selectedRaidId={selectedRaidId} />
        </div>

        {selectedGuildDetail && selectedRaidId && (
          <RaidDetailModal guild={selectedGuildDetail} onClose={handleCloseModal} selectedRaidId={selectedRaidId} raids={raids} bosses={bossesForSelectedRaid} />
        )}
      </div>
    </main>
  );
}
