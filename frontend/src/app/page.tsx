"use client";

import { useEffect, useState } from "react";
import { Guild, Event } from "@/types";
import { api } from "@/lib/api";
import GuildTable from "@/components/GuildTable";
import GuildDetail from "@/components/GuildDetail";
import EventsFeed from "@/components/EventsFeed";

export default function Home() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const [guildsData, eventsData] = await Promise.all([api.getGuilds(), api.getEvents(50)]);

      // Sort guilds by mythic progress
      const sortedGuilds = guildsData.sort((a, b) => {
        const aMythic = a.progress.find((p) => p.difficulty === "mythic");
        const bMythic = b.progress.find((p) => p.difficulty === "mythic");

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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshAllGuilds();
      // Wait a bit then refresh the view
      setTimeout(() => {
        fetchData();
        setRefreshing(false);
      }, 2000);
    } catch (err) {
      console.error("Error refreshing guilds:", err);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

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
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">WoW Guild Progress Tracker</h1>
              <p className="text-gray-400">Tracking World of Warcraft raid progression</p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              {refreshing ? "Refreshing..." : "Refresh All"}
            </button>
          </div>

          {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg">{error}</div>}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Guild List - Takes 2/3 on large screens */}
          <div className="lg:col-span-2">
            <div className="bg-gray-900 rounded-lg border border-gray-700 p-6">
              <h2 className="text-2xl font-bold mb-4">Guild Rankings</h2>
              <GuildTable guilds={guilds} onGuildClick={setSelectedGuild} />
            </div>
          </div>

          {/* Events Feed - Takes 1/3 on large screens */}
          <div className="lg:col-span-1">
            <EventsFeed events={events} />
          </div>
        </div>

        {/* Guild Detail Modal */}
        {selectedGuild && <GuildDetail guild={selectedGuild} onClose={() => setSelectedGuild(null)} />}
      </div>
    </main>
  );
}
