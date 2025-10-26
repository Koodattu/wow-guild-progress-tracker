"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { GuildListItem, Guild, Event, RaidInfo, Boss, RaidDates } from "@/types";
import { api } from "@/lib/api";
import { getIconUrl } from "@/lib/utils";
import GuildTable from "@/components/GuildTable";
import GuildDetail from "@/components/GuildDetail";
import EventsFeed from "@/components/EventsFeed";
import RaidSelector from "@/components/RaidSelector";

export default function Home() {
  const [guilds, setGuilds] = useState<GuildListItem[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [raids, setRaids] = useState<RaidInfo[]>([]);
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [raidDates, setRaidDates] = useState<RaidDates | null>(null);
  const [selectedRaidId, setSelectedRaidId] = useState<number | null>(null);
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial data fetch - only raids and events
  const fetchInitialData = useCallback(async () => {
    try {
      setError(null);
      const [raidsData, eventsData] = await Promise.all([api.getRaids(), api.getEvents(50)]);

      setRaids(raidsData);
      setEvents(eventsData);

      // Select the first raid by default (most recent raid)
      if (raidsData.length > 0 && selectedRaidId === null) {
        setSelectedRaidId(raidsData[0].id);
      }
    } catch (err) {
      console.error("Error fetching initial data:", err);
      setError("Failed to load data. Make sure the backend server is running.");
    } finally {
      setLoading(false);
    }
  }, [selectedRaidId]);

  // Fetch raid-specific data (bosses, dates, and guilds) when raid is selected
  const fetchRaidData = useCallback(async (raidId: number) => {
    try {
      setError(null);
      const [bossesData, datesData, guildsData] = await Promise.all([api.getBosses(raidId), api.getRaidDates(raidId), api.getGuilds(raidId)]);

      setBosses(bossesData);
      setRaidDates(datesData);

      // Sort guilds by mythic progress
      const sortedGuilds = guildsData.sort((a, b) => {
        const aMythic = a.progress.find((p) => p.difficulty === "mythic" && p.raidId === raidId);
        const bMythic = b.progress.find((p) => p.difficulty === "mythic" && p.raidId === raidId);

        if (!aMythic && !bMythic) return 0;
        if (!aMythic) return 1;
        if (!bMythic) return -1;

        return bMythic.bossesDefeated - aMythic.bossesDefeated;
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

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedRaidId !== null) {
        fetchRaidData(selectedRaidId);
        api.getEvents(50).then(setEvents);
      }
    }, 30000);

    return () => clearInterval(interval);
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
      } catch (err) {
        console.error("Error fetching guild boss progress:", err);
        setError("Failed to load guild details.");
      }
    },
    [selectedRaidId]
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
      <div className="container mx-auto px-4 py-8 max-w-[75%]">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">WoW Guild Progress Tracker</h1>
              <p className="text-gray-400">Tracking World of Warcraft raid progression</p>
            </div>
            <div className="flex gap-4 items-center">
              {/* Raid Selector */}
              {raids.length > 0 && <RaidSelector raids={raids} selectedRaidId={selectedRaidId} onRaidSelect={setSelectedRaidId} />}
            </div>
          </div>

          {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg">{error}</div>}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Guild List - Takes 2/3 on large screens */}
          <div className="lg:col-span-2">
            <div className="bg-gray-900 rounded-lg border border-gray-700 p-6">
              {(() => {
                const selectedRaid = raids.find((r) => r.id === selectedRaidId);
                if (!selectedRaid) return null;

                const iconUrl = getIconUrl(selectedRaid.iconUrl);
                const expansionIconPath = selectedRaid.expansion.toLowerCase().replace(/\s+/g, "-");

                // Format dates (EU by default)
                const formatDate = (dateString?: string) => {
                  if (!dateString) return "N/A";
                  return new Date(dateString).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  });
                };

                const startDate = formatDate(raidDates?.starts?.eu);
                const endDate = formatDate(raidDates?.ends?.eu);

                return (
                  <div className="mb-4">
                    {/* Expansion name and icon */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-bold text-gray-400">{selectedRaid.expansion}</span>
                      <Image src={`/expansions/${expansionIconPath}.png`} alt={`${selectedRaid.expansion} icon`} height={20} width={32} />
                    </div>

                    {/* Raid name, icon, and dates */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {iconUrl && <Image src={iconUrl} alt="Raid icon" width={40} height={40} className="rounded" />}
                        <h2 className="text-2xl font-bold">{selectedRaid.name}</h2>
                      </div>

                      {/* Season dates */}
                      <div className="text-right text-sm text-gray-400">
                        <div>
                          {startDate} - {endDate}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <GuildTable guilds={guilds} onGuildClick={handleGuildClick} selectedRaidId={selectedRaidId} />
            </div>
          </div>

          {/* Events Feed - Takes 1/3 on large screens */}
          <div className="lg:col-span-1">
            <EventsFeed events={events} />
          </div>
        </div>

        {/* Guild Detail Modal */}
        {selectedGuild && <GuildDetail guild={selectedGuild} onClose={() => setSelectedGuild(null)} selectedRaidId={selectedRaidId} raids={raids} bosses={bosses} />}
      </div>
    </main>
  );
}
