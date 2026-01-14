import { Suspense } from "react";
import Image from "next/image";
import { HomePageData } from "@/types";
import { getIconUrl } from "@/lib/utils";
import GuildTableWrapper from "@/components/GuildTableWrapper";
import HorizontalEventsFeed from "@/components/HorizontalEventsFeed";

// Server-side data fetching with revalidation
async function getHomeData(): Promise<HomePageData> {
  const apiUrl = process.env.API_URL || "http://localhost:3001";

  const response = await fetch(`${apiUrl}/api/home`, {
    next: {
      revalidate: 180, // Revalidate every 3 minutes (aligns with backend cache)
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch home page data");
  }

  return response.json();
}

async function HomeContent() {
  const homeData = await getHomeData();

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

        {/* Guild Leaderboard for current raid */}
        <GuildTableWrapper guilds={homeData.guilds} selectedRaidId={homeData.raid.id} raidInfo={homeData.raid} />
      </div>
    </main>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">⚔️</div>
        <div className="text-white text-xl">Loading guild data...</div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <HomeContent />
    </Suspense>
  );
}
