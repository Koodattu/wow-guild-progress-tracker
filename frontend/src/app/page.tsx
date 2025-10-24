"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Guild, Event, Raid } from "@/types";
import { api } from "@/lib/api";
import GuildTable from "@/components/GuildTable";
import GuildDetail from "@/components/GuildDetail";
import EventsFeed from "@/components/EventsFeed";
import RaidSelector from "@/components/RaidSelector";

export default function Home() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [raids, setRaids] = useState<Raid[]>([]);
  const [selectedRaidId, setSelectedRaidId] = useState<number | null>(null);
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const [guildsData, eventsData, raidsData] = await Promise.all([api.getGuilds(), api.getEvents(50), api.getRaids()]);

      // Set raids and select the first one by default (most recent raid)
      setRaids(raidsData);
      if (raidsData.length > 0 && selectedRaidId === null) {
        setSelectedRaidId(raidsData[0].id);
      }

      // Filter and sort guilds by mythic progress for the selected raid
      const currentRaidId = selectedRaidId || (raidsData.length > 0 ? raidsData[0].id : null);

      // Filter out guilds with no progress for the selected raid
      const filteredGuilds = currentRaidId ? guildsData.filter((guild) => guild.progress.some((p) => p.raidId === currentRaidId)) : guildsData;

      // Sort by mythic progress
      const sortedGuilds = filteredGuilds.sort((a, b) => {
        if (!currentRaidId) return 0;

        const aMythic = a.progress.find((p) => p.difficulty === "mythic" && p.raidId === currentRaidId);
        const bMythic = b.progress.find((p) => p.difficulty === "mythic" && p.raidId === currentRaidId);

        if (!aMythic && !bMythic) return 0;
        if (!aMythic) return 1;
        if (!bMythic) return -1;

        return bMythic.bossesDefeated - aMythic.bossesDefeated;
      });

      setGuilds(sortedGuilds);
      setEvents(eventsData);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to load data. Make sure the backend server is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchData();
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRaidId]);

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
              <div className="flex items-center gap-3 mb-4">
                {/* Show selected raid icon */}
                {(() => {
                  const selectedRaid = raids.find((r) => r.id === selectedRaidId);
                  return selectedRaid?.iconUrl && <Image src={selectedRaid.iconUrl} alt="Raid icon" width={40} height={40} className="rounded" />;
                })()}
                <h2 className="text-2xl font-bold">{raids.find((r) => r.id === selectedRaidId)?.name}</h2>
              </div>
              <GuildTable guilds={guilds} onGuildClick={setSelectedGuild} selectedRaidId={selectedRaidId} />
            </div>
          </div>

          {/* Events Feed - Takes 1/3 on large screens */}
          <div className="lg:col-span-1">
            <EventsFeed events={events} />
          </div>
        </div>

        {/* Guild Detail Modal */}
        {selectedGuild && <GuildDetail guild={selectedGuild} onClose={() => setSelectedGuild(null)} selectedRaidId={selectedRaidId} />}
      </div>
    </main>
  );
}
