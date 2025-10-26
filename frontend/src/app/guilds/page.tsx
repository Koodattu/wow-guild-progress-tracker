"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { GuildListItem } from "@/types";
import { api } from "@/lib/api";

export default function GuildsPage() {
  const [guilds, setGuilds] = useState<GuildListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchGuilds = async () => {
      try {
        setError(null);
        const data = await api.getAllGuilds();
        setGuilds(data);
      } catch (err) {
        console.error("Error fetching guilds:", err);
        setError("Failed to load guilds. Make sure the backend server is running.");
      } finally {
        setLoading(false);
      }
    };

    fetchGuilds();
  }, []);

  // Filter and group guilds by first letter
  const groupedGuilds = useMemo(() => {
    const filtered = guilds.filter((guild) => guild.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const grouped: Record<string, GuildListItem[]> = {};

    filtered.forEach((guild) => {
      const firstLetter = guild.name.charAt(0).toUpperCase();
      if (!grouped[firstLetter]) {
        grouped[firstLetter] = [];
      }
      grouped[firstLetter].push(guild);
    });

    // Sort guilds within each letter group alphabetically
    Object.keys(grouped).forEach((letter) => {
      grouped[letter].sort((a, b) => a.name.localeCompare(b.name));
    });

    return grouped;
  }, [guilds, searchQuery]);

  // Get sorted letters
  const sortedLetters = useMemo(() => {
    return Object.keys(groupedGuilds).sort();
  }, [groupedGuilds]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⚔️</div>
          <div className="text-white text-xl">Loading guilds...</div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">All Guilds</h1>
          <p className="text-gray-400 mb-6">Browse all guilds tracked in the system</p>

          {/* Search box */}
          <input
            type="text"
            placeholder="Search guilds..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-8">{error}</div>}

        {guilds.length === 0 && !loading && !error && <div className="text-center py-12 text-gray-500">No guilds found in the system.</div>}

        {sortedLetters.length === 0 && searchQuery && <div className="text-center py-12 text-gray-500">No guilds found matching &quot;{searchQuery}&quot;</div>}

        {/* Guild list grouped by letter */}
        <div className="space-y-8">
          {sortedLetters.map((letter) => (
            <div key={letter} className="bg-gray-900 rounded-lg border border-gray-700 p-6">
              <h2 className="text-3xl font-bold text-blue-400 mb-4 border-b border-gray-700 pb-2">{letter}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {groupedGuilds[letter].map((guild) => (
                  <Link
                    key={guild._id}
                    href={`/guilds/${guild._id}`}
                    className="block px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors border border-gray-700 hover:border-gray-600"
                  >
                    <div className="font-semibold text-white">{guild.name}</div>
                    <div className="text-sm text-gray-400">
                      {guild.realm} - {guild.region.toUpperCase()}
                    </div>
                    {guild.faction && <div className="text-xs text-gray-500 mt-1">{guild.faction}</div>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
