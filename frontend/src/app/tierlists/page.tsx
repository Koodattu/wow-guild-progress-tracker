"use client";

import { useEffect, useState } from "react";
import { TierList, GuildTierScore, RaidInfo } from "@/types";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import GuildCrest from "@/components/GuildCrest";

// Crown tier is special - only the highest scoring guild gets it
// S and F tiers are harder to achieve (narrower score ranges)
// A through E are evenly distributed in between
const TIERS = ["Crown", "S", "A", "B", "C", "D", "E", "F"] as const;
type TierName = (typeof TIERS)[number];

const TIER_COLORS: Record<TierName, string> = {
  Crown: "bg-amber-400",
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
}

function TierListDisplay({ title, guilds, scoreKey }: TierListDisplayProps) {
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
                  <div key={idx} className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-sm text-gray-200 flex items-center gap-2 transition-colors">
                    {guild.crest && (
                      <div className="w-8 h-8 shrink-0">
                        <GuildCrest crest={guild.crest} faction={guild.faction} size={128} className="scale-[0.25] origin-top-left" />
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="font-bold">{guild.guildName}</span>
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
  const [tierList, setTierList] = useState<TierList | null>(null);
  const [raids, setRaids] = useState<RaidInfo[]>([]);
  const [selectedRaidId, setSelectedRaidId] = useState<number | "overall">("overall");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [tierListData, raidsData] = await Promise.all([api.getTierList(), api.getRaids()]);
        setTierList(tierListData);
        setRaids(raidsData);
      } catch (err) {
        console.error("Error fetching tier list:", err);
        setError(t("error"));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [t]);

  if (loading) {
    return (
      <div className="w-full px-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error || !tierList) {
    return (
      <div className="w-full px-6">
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 text-center">
          <p className="text-red-300">{error || t("noData")}</p>
        </div>
      </div>
    );
  }

  // Get current guild scores based on selection
  let currentGuilds: GuildTierScore[] = [];

  if (selectedRaidId === "overall") {
    currentGuilds = tierList.overall;
  } else {
    const raidTierList = tierList.raids.find((r) => r.raidId === selectedRaidId);
    if (raidTierList) {
      currentGuilds = raidTierList.guilds;
    }
  }

  return (
    <div className="w-full px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-4">{t("title")}</h1>

        {/* Raid Selector */}
        <div className="flex items-center gap-4 mb-4">
          <label className="text-gray-300">{t("selectRaid")}:</label>
          <select
            value={selectedRaidId}
            onChange={(e) => setSelectedRaidId(e.target.value === "overall" ? "overall" : parseInt(e.target.value))}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="overall">{t("overallAllRaids")}</option>
            {raids.map((raid) => (
              <option key={raid.id} value={raid.id}>
                {raid.name}
              </option>
            ))}
          </select>
        </div>

        {/* Last calculated info */}
        <p className="text-gray-400 text-sm">
          {t("lastCalculated")}: {new Date(tierList.calculatedAt).toLocaleString()}
        </p>
      </div>

      {/* Tier Lists Grid */}
      {currentGuilds.length > 0 ? (
        <div className="flex gap-4">
          <TierListDisplay title={t("overall")} guilds={currentGuilds} scoreKey="overallScore" />
          <TierListDisplay title={t("speed")} guilds={currentGuilds} scoreKey="speedScore" />
          <TierListDisplay title={t("efficiency")} guilds={currentGuilds} scoreKey="efficiencyScore" />
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">{t("noDataForRaid")}</p>
        </div>
      )}
    </div>
  );
}
