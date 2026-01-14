"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { GuildListItem, Event, Guild, Boss, HomePageData } from "@/types";
import { api } from "@/lib/api";
import { getIconUrl } from "@/lib/utils";
import GuildTable from "@/components/GuildTable";
import HorizontalEventsFeed from "@/components/HorizontalEventsFeed";
import RaidDetailModal from "@/components/RaidDetailModal";

function HomeContent() {
  const router = useRouter();

  const [homeData, setHomeData] = useState<HomePageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state for raid detail
  const [selectedGuildDetail, setSelectedGuildDetail] = useState<Guild | null>(null);
  const [bossesForSelectedRaid, setBossesForSelectedRaid] = useState<Boss[]>([]);

  // Fetch all data from single endpoint
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getHomeData();
      setHomeData(data);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to load data. Make sure the backend server is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      if (!homeData) return;

      try {
        setError(null);
        // Fetch boss progress for this specific raid and bosses list
        const [bossProgress, bosses] = await Promise.all([api.getGuildBossProgressByRealmName(guild.realm, guild.name, homeData.raid.id), api.getBosses(homeData.raid.id)]);

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
    [homeData]
  );

  // Handle closing raid detail modal
  const handleCloseModal = useCallback(() => {
    setSelectedGuildDetail(null);
    setBossesForSelectedRaid([]);
  }, []);

  // Auto-refresh with different intervals
  useEffect(() => {
    // Refresh home data every 1 minute
    const refreshInterval = setInterval(() => {
      api
        .getHomeData()
        .then(setHomeData)
        .catch((err) => {
          console.error("Error refreshing home data:", err);
        });
    }, 60000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, []);

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

  if (!homeData) {
    return null;
  }

  // Format dates (EU by default)
  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const startDate = formatDate(homeData.dates.starts?.eu);
  const endDate = formatDate(homeData.dates.ends?.eu);

  return (
    <main className="text-white min-h-screen">
      <div className="container mx-auto px-3 md:px-4 max-w-full md:max-w-[95%] lg:max-w-[85%] pb-8">
        {error && <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 rounded-lg mb-8">{error}</div>}

        {/* Horizontal Events Feed at the top */}
        <div className="mb-2">
          <HorizontalEventsFeed events={homeData.events} />
        </div>

        {/* Raid Header */}
        <div className="mb-4 p-2 md:p-3">
          {/* Expansion name and icon */}
          <div className="flex items-center gap-2 mb-1 md:mb-2">
            <span className="text-xs md:text-sm font-bold text-gray-400">{homeData.raid.expansion}</span>
            <Image
              src={`/expansions/${homeData.raid.expansion.toLowerCase().replace(/\s+/g, "-")}.png`}
              alt={`${homeData.raid.expansion} icon`}
              height={16}
              width={26}
              className="md:h-5 md:w-8"
            />
          </div>

          {/* Raid name, icon, and dates */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              {homeData.raid.iconUrl && <Image src={getIconUrl(homeData.raid.iconUrl) || ""} alt="Raid icon" width={32} height={32} className="rounded md:w-10 md:h-10 shrink-0" />}
              <h2 className="text-lg md:text-2xl font-bold truncate">{homeData.raid.name}</h2>
            </div>

            {/* Season dates */}
            <div className="text-right text-xs md:text-sm text-gray-400 shrink-0 hidden sm:block">
              <div>
                {startDate} - {endDate}
              </div>
            </div>
          </div>

          {/* Mobile dates - shown below on small screens */}
          <div className="sm:hidden text-xs text-gray-400 mt-1">
            {startDate} - {endDate}
          </div>
        </div>

        {/* Guild Leaderboard for current raid (no raid selector) */}
        <div>
          <GuildTable guilds={homeData.guilds} onGuildClick={handleGuildClick} onRaidProgressClick={handleRaidProgressClick} selectedRaidId={homeData.raid.id} />
        </div>

        {/* Raid Detail Modal */}
        {selectedGuildDetail && (
          <RaidDetailModal
            guild={selectedGuildDetail}
            onClose={handleCloseModal}
            selectedRaidId={homeData.raid.id}
            raids={[
              {
                id: homeData.raid.id,
                name: homeData.raid.name,
                slug: homeData.raid.slug,
                expansion: homeData.raid.expansion,
                iconUrl: homeData.raid.iconUrl,
              },
            ]}
            bosses={bossesForSelectedRaid}
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
