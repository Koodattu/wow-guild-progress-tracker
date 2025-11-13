"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { GuildListItem } from "@/types";
import { api } from "@/lib/api";
import { getGuildProfileUrl } from "@/lib/utils";

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
    const filtered = guilds.filter(
      (guild) =>
        guild.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        guild.parent_guild?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        guild.realm.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const grouped: Record<string, GuildListItem[]> = {};

    filtered.forEach((guild) => {
      // Use parent_guild for grouping if it exists, otherwise use guild name
      const nameForGrouping = guild.name; //guild.parent_guild || guild.name;
      const firstLetter = nameForGrouping.charAt(0).toUpperCase();
      if (!grouped[firstLetter]) {
        grouped[firstLetter] = [];
      }
      grouped[firstLetter].push(guild);
    });

    // Sort guilds within each letter group alphabetically
    Object.keys(grouped).forEach((letter) => {
      grouped[letter].sort((a, b) => {
        // Use parent_guild for sorting if it exists, otherwise use guild name
        const aName = a.parent_guild || a.name;
        const bName = b.parent_guild || b.name;
        return aName.localeCompare(bName);
      });
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
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="mb-8">
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
        <div className="space-y-6">
          {sortedLetters.map((letter) => (
            <div key={letter}>
              <h2 className="text-4xl font-bold text-blue-400 mb-3">{letter}</h2>
              <div className="space-y-1">
                {groupedGuilds[letter].map((guild) => (
                  <Link
                    key={guild._id}
                    href={getGuildProfileUrl(guild.realm, guild.name)}
                    className={`block text-gray-300 hover:text-white transition-colors ${guild.isCurrentlyRaiding ? "border-l-4 border-l-green-500 pl-4" : ""}`}
                  >
                    {guild.parent_guild ? (
                      <>
                        <span className="text-4xl font-semibold">{guild.name}</span>
                        <span className="text-4xl text-gray-400">
                          {" "}
                          ({guild.parent_guild}-{guild.realm})
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-4xl font-semibold">{guild.name}</span>
                        <span className="text-4xl text-gray-400">-{guild.realm}</span>
                      </>
                    )}
                    {guild.isCurrentlyRaiding && <span className="ml-3 text-sm px-3 py-1 rounded font-semibold bg-green-900/50 text-green-300 align-middle">Raiding</span>}
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
