import Guild, { IGuild, IGuildCrest } from "../models/Guild";
import TierList, { IGuildTierScore, IRaidTierList } from "../models/TierList";
import { TRACKED_RAIDS } from "../config/guilds";
import logger from "../utils/logger";

interface GuildRaidData {
  guildId: string;
  guildName: string;
  realm: string;
  faction?: string;
  crest?: IGuildCrest;
  parent_guild?: string;
  raidId: number;
  raidName: string;
  // Heroic data
  heroicBossesDefeated: number;
  heroicTotalBosses: number;
  heroicWorldRank: number | null;
  heroicGuildRank: number | null;
  heroicTotalPulls: number;
  heroicTimeSpent: number;
  // Mythic data
  mythicBossesDefeated: number;
  mythicTotalBosses: number;
  mythicWorldRank: number | null;
  mythicGuildRank: number | null;
  mythicTotalPulls: number;
  mythicTimeSpent: number;
}

class TierListService {
  // Weight constants for scoring (heroic 20%, mythic 80%)
  private readonly HEROIC_WEIGHT = 0.2;
  private readonly MYTHIC_WEIGHT = 0.8;

  // Score range constants
  private readonly MAX_SCORE = 1000;
  private readonly MIN_SCORE = 0;

  // Cap for world rank (ranks above this are treated as this value)
  private readonly MAX_WORLD_RANK_CAP = 10000;

  /**
   * Calculate tier list scores for all guilds
   * Algorithm:
   * - Speed Score: Based on world rank and guild rank (lower = better)
   * - Efficiency Score: Based on kills per pull ratio and time efficiency
   * - Overall Score: Weighted combination of speed and efficiency
   */
  async calculateTierLists(): Promise<void> {
    logger.info("[TierList] Starting tier list calculation...");

    try {
      // Get all guilds with their progress
      const guilds = await Guild.find();

      if (guilds.length === 0) {
        logger.info("[TierList] No guilds found, skipping calculation");
        return;
      }

      // Collect raid data for all guilds
      const guildRaidDataMap = new Map<string, GuildRaidData[]>();

      for (const guild of guilds as IGuild[]) {
        const guildId = (guild._id as any).toString();
        const raidDataList: GuildRaidData[] = [];

        for (const raidId of TRACKED_RAIDS) {
          const heroicProgress = guild.progress.find((p) => p.raidId === raidId && p.difficulty === "heroic");
          const mythicProgress = guild.progress.find((p) => p.raidId === raidId && p.difficulty === "mythic");

          // Skip if no progress for this raid
          if (!heroicProgress && !mythicProgress) continue;

          const raidName = heroicProgress?.raidName || mythicProgress?.raidName || `Raid ${raidId}`;

          // Calculate total pulls from bosses array
          const heroicTotalPulls = heroicProgress?.bosses.reduce((sum, boss) => sum + boss.pullCount, 0) || 0;
          const mythicTotalPulls = mythicProgress?.bosses.reduce((sum, boss) => sum + boss.pullCount, 0) || 0;

          raidDataList.push({
            guildId,
            guildName: guild.name,
            realm: guild.realm,
            faction: guild.faction,
            crest: guild.crest,
            parent_guild: guild.parent_guild,
            raidId,
            raidName,
            heroicBossesDefeated: heroicProgress?.bossesDefeated || 0,
            heroicTotalBosses: heroicProgress?.totalBosses || 0,
            heroicWorldRank: heroicProgress?.worldRank || null,
            heroicGuildRank: heroicProgress?.guildRank || null,
            heroicTotalPulls,
            heroicTimeSpent: heroicProgress?.totalTimeSpent || 0,
            mythicBossesDefeated: mythicProgress?.bossesDefeated || 0,
            mythicTotalBosses: mythicProgress?.totalBosses || 0,
            mythicWorldRank: mythicProgress?.worldRank || null,
            mythicGuildRank: mythicProgress?.guildRank || null,
            mythicTotalPulls,
            mythicTimeSpent: mythicProgress?.totalTimeSpent || 0,
          });
        }

        if (raidDataList.length > 0) {
          guildRaidDataMap.set(guildId, raidDataList);
        }
      }

      // Calculate per-raid tier lists
      const raidTierLists: IRaidTierList[] = [];
      const raidScoresMap = new Map<number, Map<string, { speedScore: number; efficiencyScore: number }>>();

      for (const raidId of TRACKED_RAIDS) {
        const raidGuildsData: GuildRaidData[] = [];

        // Collect all guilds' data for this raid
        for (const [, raidDataList] of guildRaidDataMap) {
          const raidData = raidDataList.find((rd) => rd.raidId === raidId);
          if (raidData) {
            raidGuildsData.push(raidData);
          }
        }

        if (raidGuildsData.length === 0) continue;

        // Calculate scores for each guild in this raid
        const guildScores: IGuildTierScore[] = [];
        const scoreMap = new Map<string, { speedScore: number; efficiencyScore: number }>();

        for (const data of raidGuildsData) {
          const { speedScore, efficiencyScore, overallScore } = this.calculateGuildRaidScores(data, raidGuildsData);

          scoreMap.set(data.guildId, { speedScore, efficiencyScore });

          guildScores.push({
            guildId: data.guildId as any,
            guildName: data.guildName,
            realm: data.realm,
            faction: data.faction,
            crest: data.crest,
            parent_guild: data.parent_guild,
            overallScore: Math.round(overallScore),
            speedScore: Math.round(speedScore),
            efficiencyScore: Math.round(efficiencyScore),
          });
        }

        raidScoresMap.set(raidId, scoreMap);

        // Sort by overall score descending
        guildScores.sort((a, b) => b.overallScore - a.overallScore);

        const raidName = raidGuildsData[0]?.raidName || `Raid ${raidId}`;
        raidTierLists.push({
          raidId,
          raidName,
          guilds: guildScores,
        });
      }

      // Calculate overall tier list (combined scores across all raids)
      const overallScores: Map<
        string,
        { guildName: string; realm: string; faction?: string; crest?: IGuildCrest; parent_guild?: string; totalSpeed: number; totalEfficiency: number; raidCount: number }
      > = new Map();

      for (const [guildId, raidDataList] of guildRaidDataMap) {
        const guildInfo = raidDataList[0];
        let totalSpeed = 0;
        let totalEfficiency = 0;
        let raidCount = 0;

        for (const raidData of raidDataList) {
          const scoreMap = raidScoresMap.get(raidData.raidId);
          if (scoreMap) {
            const scores = scoreMap.get(guildId);
            if (scores) {
              totalSpeed += scores.speedScore;
              totalEfficiency += scores.efficiencyScore;
              raidCount++;
            }
          }
        }

        if (raidCount > 0) {
          overallScores.set(guildId, {
            guildName: guildInfo.guildName,
            realm: guildInfo.realm,
            faction: guildInfo.faction,
            crest: guildInfo.crest,
            parent_guild: guildInfo.parent_guild,
            totalSpeed,
            totalEfficiency,
            raidCount,
          });
        }
      }

      // Convert to array and calculate final overall scores
      const overallGuildScores: IGuildTierScore[] = [];

      for (const [guildId, data] of overallScores) {
        const avgSpeed = data.totalSpeed / data.raidCount;
        const avgEfficiency = data.totalEfficiency / data.raidCount;
        const overallScore = (avgSpeed + avgEfficiency) / 2;

        overallGuildScores.push({
          guildId: guildId as any,
          guildName: data.guildName,
          realm: data.realm,
          faction: data.faction,
          crest: data.crest,
          parent_guild: data.parent_guild,
          overallScore: Math.round(overallScore),
          speedScore: Math.round(avgSpeed),
          efficiencyScore: Math.round(avgEfficiency),
        });
      }

      // Sort by overall score descending
      overallGuildScores.sort((a, b) => b.overallScore - a.overallScore);

      // Delete old tier lists and save new one
      await TierList.deleteMany({});

      const tierList = new TierList({
        calculatedAt: new Date(),
        overall: overallGuildScores,
        raids: raidTierLists,
      });

      await tierList.save();

      logger.info(`[TierList] Tier list calculation completed. ${overallGuildScores.length} guilds ranked across ${raidTierLists.length} raids.`);
    } catch (error) {
      logger.error("[TierList] Error calculating tier lists:", error);
      throw error;
    }
  }

  /**
   * Linear interpolation helper: maps a value from [min, max] range to [1000, 0] score
   * Lower values get higher scores (closer to 1000)
   */
  private interpolateScore(value: number, minValue: number, maxValue: number): number {
    if (minValue === maxValue) return this.MAX_SCORE; // All same value, give max score
    const normalized = (value - minValue) / (maxValue - minValue);
    return Math.round(this.MAX_SCORE * (1 - normalized));
  }

  /**
   * Calculate exponential progress score for bosses defeated.
   * Later bosses are worth more than earlier bosses (exponential growth).
   * 0 bosses = 0 score, all bosses = 1000 score.
   *
   * @param k Steepness factor. Higher = more emphasis on later bosses.
   *          Speed scoring uses k=10 (only near-full clears matter).
   *          Efficiency scoring uses k=3 (all progress meaningful).
   */
  private calculateExponentialProgressScore(bossesDefeated: number, totalBosses: number, k: number = 10): number {
    if (totalBosses === 0 || bossesDefeated === 0) return 0;
    if (bossesDefeated >= totalBosses) return this.MAX_SCORE;

    const progress = bossesDefeated / totalBosses;
    const exponentialProgress = (Math.exp(k * progress) - 1) / (Math.exp(k) - 1);

    return Math.round(exponentialProgress * this.MAX_SCORE);
  }

  /**
   * Calculate speed, efficiency, and overall scores for a guild in a specific raid
   * All scores are on a 0-1000 scale where 1000 is best
   */
  private calculateGuildRaidScores(
    guildData: GuildRaidData,
    allGuildsData: GuildRaidData[],
  ): {
    speedScore: number;
    efficiencyScore: number;
    overallScore: number;
    heroicSpeedScore: number;
    mythicSpeedScore: number;
    heroicEfficiencyScore: number;
    mythicEfficiencyScore: number;
  } {
    // === FIND MIN/MAX VALUES FOR DYNAMIC SCORING ===

    // Guild ranks (min is always 1, find max)
    const heroicGuildRanks = allGuildsData.filter((g) => g.heroicGuildRank !== null).map((g) => g.heroicGuildRank!);
    const mythicGuildRanks = allGuildsData.filter((g) => g.mythicGuildRank !== null).map((g) => g.mythicGuildRank!);
    const minHeroicGuildRank = 1;
    const maxHeroicGuildRank = heroicGuildRanks.length > 0 ? Math.max(...heroicGuildRanks) : 1;
    const minMythicGuildRank = 1;
    const maxMythicGuildRank = mythicGuildRanks.length > 0 ? Math.max(...mythicGuildRanks) : 1;

    // World ranks (find actual min, cap max at MAX_WORLD_RANK_CAP)
    const heroicWorldRanks = allGuildsData.filter((g) => g.heroicWorldRank !== null).map((g) => g.heroicWorldRank!);
    const mythicWorldRanks = allGuildsData.filter((g) => g.mythicWorldRank !== null).map((g) => g.mythicWorldRank!);
    const minHeroicWorldRank = heroicWorldRanks.length > 0 ? Math.min(...heroicWorldRanks) : 1;
    const maxHeroicWorldRank = heroicWorldRanks.length > 0 ? Math.min(Math.max(...heroicWorldRanks), this.MAX_WORLD_RANK_CAP) : this.MAX_WORLD_RANK_CAP;
    const minMythicWorldRank = mythicWorldRanks.length > 0 ? Math.min(...mythicWorldRanks) : 1;
    const maxMythicWorldRank = mythicWorldRanks.length > 0 ? Math.min(Math.max(...mythicWorldRanks), this.MAX_WORLD_RANK_CAP) : this.MAX_WORLD_RANK_CAP;

    // Total bosses (for progress calculation)
    const heroicTotalBosses = guildData.heroicTotalBosses || allGuildsData.find((g) => g.heroicTotalBosses > 0)?.heroicTotalBosses || 0;
    const mythicTotalBosses = guildData.mythicTotalBosses || allGuildsData.find((g) => g.mythicTotalBosses > 0)?.mythicTotalBosses || 0;

    // === CALCULATE HEROIC SPEED SCORE ===
    let heroicSpeedScore = 0;
    let hasHeroicSpeed = false;
    if (guildData.heroicGuildRank !== null || guildData.heroicWorldRank !== null || guildData.heroicBossesDefeated > 0) {
      hasHeroicSpeed = true;
      const scores: number[] = [];

      // Guild rank score (rank 1 = 1000, highest rank = 0)
      if (guildData.heroicGuildRank !== null) {
        scores.push(this.interpolateScore(guildData.heroicGuildRank, minHeroicGuildRank, maxHeroicGuildRank));
      }

      // World rank score (lowest = 1000, highest/cap = 0)
      if (guildData.heroicWorldRank !== null) {
        const cappedRank = Math.min(guildData.heroicWorldRank, this.MAX_WORLD_RANK_CAP);
        scores.push(this.interpolateScore(cappedRank, minHeroicWorldRank, maxHeroicWorldRank));
      }

      // Bosses defeated score (0 = 0, all = 1000) - exponential growth, later bosses worth more
      if (heroicTotalBosses > 0) {
        const progressScore = this.calculateExponentialProgressScore(guildData.heroicBossesDefeated, heroicTotalBosses);
        scores.push(progressScore);
      }

      // Average of available scores
      heroicSpeedScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    }

    // === CALCULATE MYTHIC SPEED SCORE ===
    let mythicSpeedScore = 0;
    let hasMythicSpeed = false;
    if (guildData.mythicGuildRank !== null || guildData.mythicWorldRank !== null || guildData.mythicBossesDefeated > 0) {
      hasMythicSpeed = true;
      const scores: number[] = [];

      // Guild rank score (rank 1 = 1000, highest rank = 0)
      if (guildData.mythicGuildRank !== null) {
        scores.push(this.interpolateScore(guildData.mythicGuildRank, minMythicGuildRank, maxMythicGuildRank));
      }

      // World rank score (lowest = 1000, highest/cap = 0)
      if (guildData.mythicWorldRank !== null) {
        const cappedRank = Math.min(guildData.mythicWorldRank, this.MAX_WORLD_RANK_CAP);
        scores.push(this.interpolateScore(cappedRank, minMythicWorldRank, maxMythicWorldRank));
      }

      // Bosses defeated score (0 = 0, all = 1000) - exponential growth, later bosses worth more
      if (mythicTotalBosses > 0) {
        const progressScore = this.calculateExponentialProgressScore(guildData.mythicBossesDefeated, mythicTotalBosses);
        scores.push(progressScore);
      }

      // Average of available scores
      mythicSpeedScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    }

    // === CALCULATE EFFICIENCY SCORE ===
    // Efficiency = how effectively a guild clears bosses relative to time/effort spent.
    // Core insight: time and pulls are measured PER UNIT OF WEIGHTED PROGRESS, not in absolute terms.
    // This means 3 hours for 6 bosses beats 51 min for 1 boss, because per-progress time is lower.
    //
    // Uses k=3 exponential curve (not k=10 used by speed) so partial progress is meaningful:
    //   k=3: 1/9 → 21pts, 3/9 → 90pts, 6/9 → 335pts, 9/9 → 1000pts
    //   k=10: 1/9 → 0pts, 6/9 → 36pts (too compressed, only rewards near-full clears)
    //
    // Components: 60% boss progress, 25% time-per-progress, 15% pulls-per-progress
    // Mythic always worth more than heroic (80/20 weighting per difficulty).
    let heroicEfficiencyScore = 0;
    let mythicEfficiencyScore = 0;
    let efficiencyScore = 0;
    const hasHeroicEfficiency = guildData.heroicBossesDefeated > 0;
    const hasMythicEfficiency = guildData.mythicBossesDefeated > 0;

    if (hasHeroicEfficiency || hasMythicEfficiency) {
      const EFFICIENCY_K = 3;

      // --- Precompute derived metrics across all guilds in this raid ---
      // "time per weighted progress" and "pulls per weighted progress" normalize
      // effort against achievement, so more bosses killed with more time is
      // correctly scored as efficient if the time-per-progress ratio is low.
      const heroicTimePerProgressValues: number[] = [];
      const heroicPullsPerProgressValues: number[] = [];
      const mythicTimePerProgressValues: number[] = [];
      const mythicPullsPerProgressValues: number[] = [];

      for (const g of allGuildsData) {
        if (g.heroicBossesDefeated > 0 && heroicTotalBosses > 0) {
          const prog = this.calculateExponentialProgressScore(g.heroicBossesDefeated, heroicTotalBosses, EFFICIENCY_K);
          if (prog > 0) {
            if (g.heroicTimeSpent > 0) heroicTimePerProgressValues.push(g.heroicTimeSpent / prog);
            if (g.heroicTotalPulls > 0) heroicPullsPerProgressValues.push(g.heroicTotalPulls / prog);
          }
        }
        if (g.mythicBossesDefeated > 0 && mythicTotalBosses > 0) {
          const prog = this.calculateExponentialProgressScore(g.mythicBossesDefeated, mythicTotalBosses, EFFICIENCY_K);
          if (prog > 0) {
            if (g.mythicTimeSpent > 0) mythicTimePerProgressValues.push(g.mythicTimeSpent / prog);
            if (g.mythicTotalPulls > 0) mythicPullsPerProgressValues.push(g.mythicTotalPulls / prog);
          }
        }
      }

      const minHeroicTPP = heroicTimePerProgressValues.length > 0 ? Math.min(...heroicTimePerProgressValues) : 0;
      const maxHeroicTPP = heroicTimePerProgressValues.length > 0 ? Math.max(...heroicTimePerProgressValues) : 1;
      const minHeroicPPP = heroicPullsPerProgressValues.length > 0 ? Math.min(...heroicPullsPerProgressValues) : 0;
      const maxHeroicPPP = heroicPullsPerProgressValues.length > 0 ? Math.max(...heroicPullsPerProgressValues) : 1;
      const minMythicTPP = mythicTimePerProgressValues.length > 0 ? Math.min(...mythicTimePerProgressValues) : 0;
      const maxMythicTPP = mythicTimePerProgressValues.length > 0 ? Math.max(...mythicTimePerProgressValues) : 1;
      const minMythicPPP = mythicPullsPerProgressValues.length > 0 ? Math.min(...mythicPullsPerProgressValues) : 0;
      const maxMythicPPP = mythicPullsPerProgressValues.length > 0 ? Math.max(...mythicPullsPerProgressValues) : 1;

      // --- Score heroic efficiency ---
      let heroicDifficultyScore = 0;
      if (hasHeroicEfficiency && heroicTotalBosses > 0) {
        const progressScore = this.calculateExponentialProgressScore(guildData.heroicBossesDefeated, heroicTotalBosses, EFFICIENCY_K);

        let timeEffScore = 0;
        if (progressScore > 0 && guildData.heroicTimeSpent > 0) {
          timeEffScore = this.interpolateScore(guildData.heroicTimeSpent / progressScore, minHeroicTPP, maxHeroicTPP);
        }

        let pullEffScore = 0;
        if (progressScore > 0 && guildData.heroicTotalPulls > 0) {
          pullEffScore = this.interpolateScore(guildData.heroicTotalPulls / progressScore, minHeroicPPP, maxHeroicPPP);
        }

        heroicDifficultyScore = progressScore * 0.6 + timeEffScore * 0.25 + pullEffScore * 0.15;
        heroicEfficiencyScore = Math.round(heroicDifficultyScore);
      }

      // --- Score mythic efficiency ---
      let mythicDifficultyScore = 0;
      if (hasMythicEfficiency && mythicTotalBosses > 0) {
        const progressScore = this.calculateExponentialProgressScore(guildData.mythicBossesDefeated, mythicTotalBosses, EFFICIENCY_K);

        let timeEffScore = 0;
        if (progressScore > 0 && guildData.mythicTimeSpent > 0) {
          timeEffScore = this.interpolateScore(guildData.mythicTimeSpent / progressScore, minMythicTPP, maxMythicTPP);
        }

        let pullEffScore = 0;
        if (progressScore > 0 && guildData.mythicTotalPulls > 0) {
          pullEffScore = this.interpolateScore(guildData.mythicTotalPulls / progressScore, minMythicPPP, maxMythicPPP);
        }

        mythicDifficultyScore = progressScore * 0.6 + timeEffScore * 0.25 + pullEffScore * 0.15;
        mythicEfficiencyScore = Math.round(mythicDifficultyScore);
      }

      // --- Combine heroic + mythic ---
      // Mythic 80%, Heroic 20%. Single-difficulty guilds are scaled by their weight
      // so mythic-only can reach 800 and heroic-only caps at 200.
      if (hasHeroicEfficiency && hasMythicEfficiency) {
        efficiencyScore = Math.round(heroicDifficultyScore * this.HEROIC_WEIGHT + mythicDifficultyScore * this.MYTHIC_WEIGHT);
      } else if (hasMythicEfficiency) {
        efficiencyScore = Math.round(mythicDifficultyScore * this.MYTHIC_WEIGHT);
      } else {
        efficiencyScore = Math.round(heroicDifficultyScore * this.HEROIC_WEIGHT);
      }

      efficiencyScore = Math.max(this.MIN_SCORE, Math.min(this.MAX_SCORE, efficiencyScore));
    }

    // === CALCULATE WEIGHTED SPEED SCORE ===
    // Heroic 20%, Mythic 80% — normalized when only one difficulty has data
    let speedScore = 0;
    if (hasHeroicSpeed && hasMythicSpeed) {
      speedScore = heroicSpeedScore * this.HEROIC_WEIGHT + mythicSpeedScore * this.MYTHIC_WEIGHT;
    } else if (hasHeroicSpeed) {
      speedScore = heroicSpeedScore;
    } else if (hasMythicSpeed) {
      speedScore = mythicSpeedScore;
    }

    // === OVERALL SCORE ===
    // Average of speed and efficiency
    const overallScore = (speedScore + efficiencyScore) / 2;

    return {
      speedScore: Math.max(this.MIN_SCORE, Math.min(this.MAX_SCORE, Math.round(speedScore))),
      efficiencyScore: Math.max(this.MIN_SCORE, Math.min(this.MAX_SCORE, Math.round(efficiencyScore))),
      overallScore: Math.max(this.MIN_SCORE, Math.min(this.MAX_SCORE, Math.round(overallScore))),
      heroicSpeedScore: Math.round(heroicSpeedScore),
      mythicSpeedScore: Math.round(mythicSpeedScore),
      heroicEfficiencyScore: Math.round(heroicEfficiencyScore),
      mythicEfficiencyScore: Math.round(mythicEfficiencyScore),
    };
  }

  /**
   * Get the latest tier list (full data - all raids + overall)
   */
  async getTierList(): Promise<any> {
    const tierList = await TierList.findOne().sort({ calculatedAt: -1 }).lean();
    if (!tierList) return null;

    // Remove guildId from response as frontend doesn't need it
    return {
      calculatedAt: tierList.calculatedAt,
      overall: tierList.overall.map(this.stripGuildId),
      raids: tierList.raids.map((raid) => ({
        raidId: raid.raidId,
        raidName: raid.raidName,
        guilds: raid.guilds.map(this.stripGuildId),
      })),
    };
  }

  /**
   * Get overall tier list only (without per-raid data)
   */
  async getOverallTierList(): Promise<{ calculatedAt: Date; guilds: Omit<IGuildTierScore, "guildId">[] } | null> {
    const tierList = await TierList.findOne().sort({ calculatedAt: -1 }).lean();
    if (!tierList) return null;

    return {
      calculatedAt: tierList.calculatedAt,
      guilds: tierList.overall.map(this.stripGuildId),
    };
  }

  /**
   * Get tier list for a specific raid
   */
  async getTierListForRaid(raidId: number): Promise<{ calculatedAt: Date; raidId: number; raidName: string; guilds: Omit<IGuildTierScore, "guildId">[] } | null> {
    const tierList = await TierList.findOne().sort({ calculatedAt: -1 }).lean();
    if (!tierList) return null;

    const raidTierList = tierList.raids.find((r) => r.raidId === raidId);
    if (!raidTierList) return null;

    return {
      calculatedAt: tierList.calculatedAt,
      raidId: raidTierList.raidId,
      raidName: raidTierList.raidName,
      guilds: raidTierList.guilds.map(this.stripGuildId),
    };
  }

  /**
   * Get available raids from tier list (just raid IDs and names)
   */
  async getAvailableRaids(): Promise<{ raidId: number; raidName: string }[]> {
    const tierList = await TierList.findOne().sort({ calculatedAt: -1 }).lean();
    if (!tierList) return [];

    return tierList.raids.map((raid) => ({
      raidId: raid.raidId,
      raidName: raid.raidName,
    }));
  }

  /**
   * Strip guildId from guild tier score (not needed by frontend)
   */
  private stripGuildId(guild: IGuildTierScore): Omit<IGuildTierScore, "guildId"> {
    const { guildId, ...rest } = guild as any;
    return rest;
  }
}

export default new TierListService();
