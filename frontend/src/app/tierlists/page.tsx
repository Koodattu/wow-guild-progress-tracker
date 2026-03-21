"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { GuildTierScore } from "@/types";
import { useTranslations } from "next-intl";
import GuildCrest from "@/components/GuildCrest";
import RaidSelector from "@/components/RaidSelector";
import { useRaids, useTierListRaids, useOverallTierList, useTierListForRaid } from "@/lib/queries";

// Crown tier is special - only the highest scoring guild gets it
// S and F tiers are harder to achieve (narrower score ranges)
// A through E are evenly distributed in between
const TIERS = ["Crown", "S", "A", "B", "C", "D", "E", "F"] as const;
type TierName = (typeof TIERS)[number];

const TIER_COLORS: Record<TierName, string> = {
  Crown: "bg-purple-400",
  S: "bg-red-400",
  A: "bg-orange-300",
  B: "bg-yellow-300",
  C: "bg-yellow-200",
  D: "bg-lime-300",
  E: "bg-green-300",
  F: "bg-cyan-300",
};

// Score thresholds for each tier (out of 1000)
// Crown: Only the #1 guild (handled separately)
// S: 900-1000 (harder to get - top 10%)
// F: 0-100 (harder to get - bottom 10%)
// A-E: Evenly split between 100-900 (160 points each)
const TIER_THRESHOLDS: Record<Exclude<TierName, "Crown">, { min: number; max: number }> = {
  S: { min: 900, max: 1000 },
  A: { min: 740, max: 899 },
  B: { min: 580, max: 739 },
  C: { min: 420, max: 579 },
  D: { min: 260, max: 419 },
  E: { min: 100, max: 259 },
  F: { min: 0, max: 99 },
};

// Get tier based on score (0-1000 scale)
function getTierByScore(score: number): Exclude<TierName, "Crown"> {
  if (score >= TIER_THRESHOLDS.S.min) return "S";
  if (score >= TIER_THRESHOLDS.A.min) return "A";
  if (score >= TIER_THRESHOLDS.B.min) return "B";
  if (score >= TIER_THRESHOLDS.C.min) return "C";
  if (score >= TIER_THRESHOLDS.D.min) return "D";
  if (score >= TIER_THRESHOLDS.E.min) return "E";
  return "F";
}

interface TierListDisplayProps {
  title: string;
  guilds: GuildTierScore[];
  scoreKey: "overallScore" | "speedScore" | "efficiencyScore";
  onGuildClick: (realm: string, name: string) => void;
}

function TierListDisplay({ title, guilds, scoreKey, onGuildClick }: TierListDisplayProps) {
  // Group guilds by their tier based on score thresholds
  const tierGroups: Record<TierName, GuildTierScore[]> = {
    Crown: [],
    S: [],
    A: [],
    B: [],
    C: [],
    D: [],
    E: [],
    F: [],
  };

  // Sort guilds by score descending to find the crown holder
  const sortedGuilds = [...guilds].sort((a, b) => b[scoreKey] - a[scoreKey]);

  sortedGuilds.forEach((guild, index) => {
    const score = guild[scoreKey];
    // First guild (highest score) gets Crown tier
    if (index === 0 && guilds.length > 0) {
      tierGroups.Crown.push(guild);
    } else {
      const tier = getTierByScore(score);
      tierGroups[tier].push(guild);
    }
  });

  // Guilds are already sorted within each tier by score (highest first)

  return (
    <div className="flex-1 min-w-0">
      <h3 className="text-base md:text-lg font-bold text-white mb-2 md:mb-3 text-center">{title}</h3>
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        {TIERS.map((tier) => {
          const tierGuilds = tierGroups[tier];
          return (
            <div key={tier} className="flex border-b border-gray-700 last:border-b-0">
              <div className={`w-10 md:w-20 min-h-14 md:min-h-20 flex items-center justify-center font-bold text-lg md:text-2xl text-gray-900 ${TIER_COLORS[tier]} shrink-0`}>
                {tier === "Crown" ? "👑" : tier}
              </div>
              <div className="flex-1 bg-gray-800 p-1.5 md:p-2 flex flex-wrap items-center gap-1 md:gap-2 min-h-14 md:min-h-20">
                {tierGuilds.map((guild, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-700 hover:bg-gray-600 px-1.5 md:px-2 py-1 md:py-1.5 rounded text-xs md:text-sm text-gray-200 flex items-center gap-1 md:gap-2 transition-colors cursor-pointer"
                    onClick={() => onGuildClick(guild.realm, guild.guildName)}
                  >
                    {guild.crest && (
                      <div className="w-5 h-5 md:w-8 md:h-8 shrink-0">
                        <GuildCrest crest={guild.crest} faction={guild.faction} size={128} className="scale-[0.15] md:scale-[0.25] origin-top-left" />
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">
                        <span className="font-bold">{guild.guildName}</span>
                        {guild.parent_guild && <span className="text-gray-400 hidden md:inline"> ({guild.parent_guild})</span>}
                      </span>
                      <span className="text-[10px] md:text-xs text-gray-400 truncate">{guild.realm}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TierListsPage() {
  const t = useTranslations("tierListsPage");
  const router = useRouter();
  const [selectedRaidId, setSelectedRaidId] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Fetch raid metadata
  const { data: allRaids } = useRaids();
  const { data: tierListRaidsData, isLoading: isRaidsLoading, error: raidsError } = useTierListRaids();

  // Filter to only raids that have tier list data
  const raids = useMemo(() => {
    if (!allRaids || !tierListRaidsData) return [];
    const tierListRaidIds = new Set(tierListRaidsData.map((r) => r.raidId));
    return allRaids.filter((r) => tierListRaidIds.has(r.id));
  }, [allRaids, tierListRaidsData]);

  // Set initial selectedRaidId when raids data loads (only once)
  useEffect(() => {
    if (!initialized && allRaids && tierListRaidsData) {
      if (raids.length > 0) {
        setSelectedRaidId(raids[0].id);
      }
      setInitialized(true);
    }
  }, [initialized, allRaids, tierListRaidsData, raids]);

  // Fetch tier data based on selection
  const isOverallSelected = selectedRaidId === null && initialized;
  const { data: overallData, isLoading: isOverallLoading, error: overallError } = useOverallTierList(isOverallSelected);
  const { data: raidData, isLoading: isRaidDataLoading, error: raidDataError } = useTierListForRaid(selectedRaidId);

  const loading = isRaidsLoading || !initialized;
  const dataLoading = isOverallSelected ? isOverallLoading : isRaidDataLoading;
  const error = raidsError || overallError || raidDataError;

  const guilds = isOverallSelected ? (overallData?.guilds ?? []) : (raidData?.guilds ?? []);
  const calculatedAt = isOverallSelected ? (overallData?.calculatedAt ?? null) : (raidData?.calculatedAt ?? null);

  const handleRaidSelect = (raidId: number | null) => {
    setSelectedRaidId(raidId);
  };

  if (loading) {
    return (
      <div className="w-full px-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full px-6">
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 text-center">
          <p className="text-red-300">{t("error")}</p>
        </div>
      </div>
    );
  }

  // Handle guild click to navigate to profile
  const handleGuildClick = (realm: string, name: string) => {
    const encodedRealm = encodeURIComponent(realm);
    const encodedName = encodeURIComponent(name);
    router.push(`/guilds/${encodedRealm}/${encodedName}`);
  };

  return (
    <div className="w-full px-3 md:px-6">
      <div className="mb-4 md:mb-6">
        {/* Raid Selector and Last Calculated */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4">
          <div className="flex items-end gap-3">
            <RaidSelector raids={raids} selectedRaidId={selectedRaidId} onRaidSelect={handleRaidSelect} showOverall={true} />
            {dataLoading && <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500 mb-2"></div>}
          </div>
          {calculatedAt && (
            <p className="text-gray-400 text-xs md:text-sm">
              {t("lastCalculated")}: {new Date(calculatedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Tier Lists Grid - Stack on mobile, side by side on desktop */}
      {guilds.length > 0 ? (
        <div className="flex flex-col lg:flex-row gap-4">
          <TierListDisplay title={t("overall")} guilds={guilds} scoreKey="overallScore" onGuildClick={handleGuildClick} />
          <TierListDisplay title={t("speed")} guilds={guilds} scoreKey="speedScore" onGuildClick={handleGuildClick} />
          <TierListDisplay title={t("efficiency")} guilds={guilds} scoreKey="efficiencyScore" onGuildClick={handleGuildClick} />
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">{t("noDataForRaid")}</p>
        </div>
      )}
    </div>
  );
}
