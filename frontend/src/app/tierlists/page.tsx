"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GuildTierScore, TierListRaidInfo } from "@/types";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import GuildCrest from "@/components/GuildCrest";

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
    <div className="flex-1">
      <h3 className="text-lg font-bold text-white mb-3 text-center">{title}</h3>
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        {TIERS.map((tier) => {
          const tierGuilds = tierGroups[tier];
          return (
            <div key={tier} className="flex border-b border-gray-700 last:border-b-0">
              <div className={`w-20 min-h-20 flex items-center justify-center font-bold text-2xl text-gray-900 ${TIER_COLORS[tier]}`}>{tier === "Crown" ? "👑" : tier}</div>
              <div className="flex-1 bg-gray-800 p-2 flex flex-wrap items-center gap-2 min-h-20">
                {tierGuilds.map((guild, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-700 hover:bg-gray-600 px-2 py-1.5 rounded text-sm text-gray-200 flex items-center gap-2 transition-colors cursor-pointer"
                    onClick={() => onGuildClick(guild.realm, guild.guildName)}
                  >
                    {guild.crest && (
                      <div className="w-8 h-8 shrink-0">
                        <GuildCrest crest={guild.crest} faction={guild.faction} size={128} className="scale-[0.25] origin-top-left" />
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span>
                        <span className="font-bold">{guild.guildName}</span>
                        {guild.parent_guild && <span className="text-gray-400"> ({guild.parent_guild})</span>}
                      </span>
                      <span className="text-xs text-gray-400">{guild.realm}</span>
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
  const [guilds, setGuilds] = useState<GuildTierScore[]>([]);
  const [raids, setRaids] = useState<TierListRaidInfo[]>([]);
  const [selectedRaidId, setSelectedRaidId] = useState<number | "overall" | null>(null);
  const [calculatedAt, setCalculatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch tier list data for a specific raid or overall
  const fetchTierListData = useCallback(
    async (raidId: number | "overall") => {
      try {
        setDataLoading(true);
        if (raidId === "overall") {
          const data = await api.getOverallTierList();
          setGuilds(data.guilds);
          setCalculatedAt(data.calculatedAt);
        } else {
          const data = await api.getTierListForRaid(raidId);
          setGuilds(data.guilds);
          setCalculatedAt(data.calculatedAt);
        }
      } catch (err) {
        console.error("Error fetching tier list data:", err);
        setError(t("error"));
      } finally {
        setDataLoading(false);
      }
    },
    [t]
  );

  // Initial load - fetch available raids and default to first raid
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        // Fetch available raids from tier list
        const raidsData = await api.getTierListRaids();
        setRaids(raidsData);

        // Default to first raid if available, otherwise overall
        const defaultSelection = raidsData.length > 0 ? raidsData[0].raidId : "overall";
        setSelectedRaidId(defaultSelection);

        // Fetch data for the default selection
        await fetchTierListData(defaultSelection);
      } catch (err) {
        console.error("Error fetching initial data:", err);
        setError(t("error"));
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [t, fetchTierListData]);

  // Handle dropdown change
  const handleRaidChange = async (value: string) => {
    const newSelection = value === "overall" ? "overall" : parseInt(value);
    setSelectedRaidId(newSelection);
    await fetchTierListData(newSelection);
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
          <p className="text-red-300">{error}</p>
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
    <div className="w-full px-6">
      <div className="mb-6">
        {/* Raid Selector and Last Calculated */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="text-gray-300">{t("selectRaid")}:</label>
            <select
              value={selectedRaidId ?? ""}
              onChange={(e) => handleRaidChange(e.target.value)}
              disabled={dataLoading}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="overall">{t("overallAllRaids")}</option>
              {raids.map((raid) => (
                <option key={raid.raidId} value={raid.raidId}>
                  {raid.raidName}
                </option>
              ))}
            </select>
            {dataLoading && <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>}
          </div>
          {calculatedAt && (
            <p className="text-gray-400 text-sm">
              {t("lastCalculated")}: {new Date(calculatedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Tier Lists Grid */}
      {guilds.length > 0 ? (
        <div className="flex gap-4">
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
