"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GuildListItem, Guild, Boss, RaidInfo } from "@/types";
import { api } from "@/lib/api";
import GuildTable from "./GuildTable";
import RaidDetailModal from "./RaidDetailModal";

interface GuildTableWrapperProps {
  guilds: GuildListItem[];
  selectedRaidId: number;
  raidInfo: RaidInfo;
}

export default function GuildTableWrapper({ guilds, selectedRaidId, raidInfo }: GuildTableWrapperProps) {
  const router = useRouter();
  const [selectedGuildDetail, setSelectedGuildDetail] = useState<Guild | null>(null);
  const [bossesForSelectedRaid, setBossesForSelectedRaid] = useState<Boss[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Handle guild click - navigate to guild profile page
  const handleGuildClick = useCallback(
    (guild: GuildListItem) => {
      const encodedRealm = encodeURIComponent(guild.realm);
      const encodedName = encodeURIComponent(guild.name);
      router.push(`/guilds/${encodedRealm}/${encodedName}`);
    },
    [router]
  );

  // Handle raid progress click - open raid detail modal
  const handleRaidProgressClick = useCallback(
    async (guild: GuildListItem) => {
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

  return (
    <>
      {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-2 rounded-lg mb-4">{error}</div>}

      <GuildTable guilds={guilds} onGuildClick={handleGuildClick} onRaidProgressClick={handleRaidProgressClick} selectedRaidId={selectedRaidId} />

      {selectedGuildDetail && (
        <RaidDetailModal guild={selectedGuildDetail} onClose={handleCloseModal} selectedRaidId={selectedRaidId} raids={[raidInfo]} bosses={bossesForSelectedRaid} />
      )}
    </>
  );
}
