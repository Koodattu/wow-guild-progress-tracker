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
  // Weight constants for scoring
  private readonly MYTHIC_WEIGHT = 3; // Mythic is weighted 3x more than heroic
  private readonly HEROIC_WEIGHT = 1;

  // Score normalization constants
  private readonly MAX_WORLD_RANK = 10000; // Assume max world rank for normalization
  private readonly MAX_GUILD_RANK = 100; // Assume max guild rank for normalization

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
        { guildName: string; realm: string; faction?: string; crest?: IGuildCrest; totalSpeed: number; totalEfficiency: number; raidCount: number }
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
   * Calculate speed, efficiency, and overall scores for a guild in a specific raid
   */
  private calculateGuildRaidScores(guildData: GuildRaidData, allGuildsData: GuildRaidData[]): { speedScore: number; efficiencyScore: number; overallScore: number } {
    // === SPEED SCORE ===
    // Based on world rank and guild rank (lower rank = better)
    // Score = 100 - normalized_rank
    let speedScore = 0;

    // Calculate heroic speed component
    if (guildData.heroicWorldRank || guildData.heroicGuildRank) {
      const heroicWorldRankScore = guildData.heroicWorldRank ? Math.max(0, 100 - (guildData.heroicWorldRank / this.MAX_WORLD_RANK) * 100) : 0;
      const heroicGuildRankScore = guildData.heroicGuildRank ? Math.max(0, 100 - (guildData.heroicGuildRank / this.MAX_GUILD_RANK) * 100) : 0;
      const heroicSpeedScore = (heroicWorldRankScore * 0.7 + heroicGuildRankScore * 0.3) * this.HEROIC_WEIGHT;
      speedScore += heroicSpeedScore;
    }

    // Calculate mythic speed component (weighted more heavily)
    if (guildData.mythicWorldRank || guildData.mythicGuildRank) {
      const mythicWorldRankScore = guildData.mythicWorldRank ? Math.max(0, 100 - (guildData.mythicWorldRank / this.MAX_WORLD_RANK) * 100) : 0;
      const mythicGuildRankScore = guildData.mythicGuildRank ? Math.max(0, 100 - (guildData.mythicGuildRank / this.MAX_GUILD_RANK) * 100) : 0;
      const mythicSpeedScore = (mythicWorldRankScore * 0.7 + mythicGuildRankScore * 0.3) * this.MYTHIC_WEIGHT;
      speedScore += mythicSpeedScore;
    }

    // Normalize speed score to 0-100
    const maxSpeedWeight = this.HEROIC_WEIGHT + this.MYTHIC_WEIGHT;
    speedScore = (speedScore / maxSpeedWeight) * (100 / 100); // Normalize

    // Also factor in progress (bosses killed)
    const heroicProgress = guildData.heroicTotalBosses > 0 ? (guildData.heroicBossesDefeated / guildData.heroicTotalBosses) * 100 : 0;
    const mythicProgress = guildData.mythicTotalBosses > 0 ? (guildData.mythicBossesDefeated / guildData.mythicTotalBosses) * 100 : 0;
    const weightedProgress = (heroicProgress * this.HEROIC_WEIGHT + mythicProgress * this.MYTHIC_WEIGHT) / maxSpeedWeight;

    // Combine rank-based speed with progress
    speedScore = speedScore * 0.6 + weightedProgress * 0.4;

    // === EFFICIENCY SCORE ===
    // Based on kills per pull ratio and time per boss
    // Higher efficiency = fewer pulls and less time per boss
    let efficiencyScore = 0;

    // Calculate efficiency based on pulls per boss killed
    const heroicBossesDefeated = guildData.heroicBossesDefeated || 0;
    const mythicBossesDefeated = guildData.mythicBossesDefeated || 0;

    // Find average pulls in the raid for normalization
    const avgHeroicPulls =
      allGuildsData.filter((g) => g.heroicBossesDefeated > 0).reduce((sum, g) => sum + g.heroicTotalPulls / g.heroicBossesDefeated, 0) /
        Math.max(1, allGuildsData.filter((g) => g.heroicBossesDefeated > 0).length) || 50;

    const avgMythicPulls =
      allGuildsData.filter((g) => g.mythicBossesDefeated > 0).reduce((sum, g) => sum + g.mythicTotalPulls / g.mythicBossesDefeated, 0) /
        Math.max(1, allGuildsData.filter((g) => g.mythicBossesDefeated > 0).length) || 100;

    // Heroic efficiency
    if (heroicBossesDefeated > 0) {
      const pullsPerBoss = guildData.heroicTotalPulls / heroicBossesDefeated;
      // Score: if pulls per boss is lower than average, score > 50, otherwise < 50
      const heroicEfficiency = Math.max(0, Math.min(100, 100 - ((pullsPerBoss - avgHeroicPulls) / avgHeroicPulls) * 50 + 50));
      efficiencyScore += heroicEfficiency * this.HEROIC_WEIGHT;
    }

    // Mythic efficiency (weighted more)
    if (mythicBossesDefeated > 0) {
      const pullsPerBoss = guildData.mythicTotalPulls / mythicBossesDefeated;
      const mythicEfficiency = Math.max(0, Math.min(100, 100 - ((pullsPerBoss - avgMythicPulls) / avgMythicPulls) * 50 + 50));
      efficiencyScore += mythicEfficiency * this.MYTHIC_WEIGHT;
    }

    // Normalize efficiency score
    const totalWeight = (heroicBossesDefeated > 0 ? this.HEROIC_WEIGHT : 0) + (mythicBossesDefeated > 0 ? this.MYTHIC_WEIGHT : 0);
    if (totalWeight > 0) {
      efficiencyScore = efficiencyScore / totalWeight;
    }

    // Factor in progress for efficiency too (can't be efficient if you haven't killed bosses)
    efficiencyScore = efficiencyScore * 0.7 + weightedProgress * 0.3;

    // === OVERALL SCORE ===
    // Equal weight of speed and efficiency
    const overallScore = (speedScore + efficiencyScore) / 2;

    return {
      speedScore: Math.max(0, Math.min(100, speedScore)),
      efficiencyScore: Math.max(0, Math.min(100, efficiencyScore)),
      overallScore: Math.max(0, Math.min(100, overallScore)),
    };
  }

  /**
   * Get the latest tier list
   */
  async getTierList(): Promise<any> {
    const tierList = await TierList.findOne().sort({ calculatedAt: -1 });
    return tierList;
  }

  /**
   * Get tier list for a specific raid
   */
  async getTierListForRaid(raidId: number): Promise<IRaidTierList | null> {
    const tierList = await TierList.findOne().sort({ calculatedAt: -1 });
    if (!tierList) return null;

    return tierList.raids.find((r) => r.raidId === raidId) || null;
  }
}

export default new TierListService();
