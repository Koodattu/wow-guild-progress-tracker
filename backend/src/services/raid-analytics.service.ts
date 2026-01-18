import Guild from "../models/Guild";
import Raid from "../models/Raid";
import RaidAnalytics, { IRaidAnalytics, IBossAnalytics, IRaidOverallAnalytics, IGuildEntry, IDistribution, IWeeklyProgressionEntry } from "../models/RaidAnalytics";
import { TRACKED_RAIDS } from "../config/guilds";
import logger from "../utils/logger";

interface GuildBossData {
  guildName: string;
  guildRealm: string;
  pullCount: number;
  timeSpent: number;
  kills: number;
  firstKillTime?: Date;
}

interface GuildRaidData {
  guildName: string;
  guildRealm: string;
  totalPulls: number;
  totalTimeSpent: number;
  bossesKilled: number;
  totalBosses: number;
  lastBossKillTime?: Date;
}

/** Internal type for distribution calculation that includes values */
interface IGuildEntryWithValues {
  name: string;
  realm: string;
  pullCount: number;
  timeSpent: number;
}

/**
 * Format seconds to hours and minutes for display labels
 */
function formatTime(seconds: number): string {
  if (seconds === 0) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

class RaidAnalyticsService {
  /**
   * Calculate analytics for a specific raid
   */
  async calculateRaidAnalytics(raidId: number): Promise<IRaidAnalytics | null> {
    try {
      const raid = await Raid.findOne({ id: raidId });
      if (!raid) {
        logger.warn(`[RaidAnalytics] Raid ${raidId} not found`);
        return null;
      }

      const totalBosses = raid.bosses.length;
      logger.info(`[RaidAnalytics] Calculating analytics for ${raid.name} (${totalBosses} bosses)`);

      const guilds = await Guild.find({
        "progress.raidId": raidId,
        "progress.difficulty": "mythic",
      }).select("name realm progress");

      if (guilds.length === 0) {
        logger.info(`[RaidAnalytics] No guilds with progress for raid ${raidId}`);
        return null;
      }

      const bossDataMap = new Map<number, GuildBossData[]>();
      raid.bosses.forEach((boss) => {
        bossDataMap.set(boss.id, []);
      });

      const guildRaidDataList: GuildRaidData[] = [];

      for (const guild of guilds) {
        const mythicProgress = guild.progress.find((p) => p.raidId === raidId && p.difficulty === "mythic");
        if (!mythicProgress) continue;

        let totalPulls = 0;
        let totalTimeSpent = 0;
        let bossesKilled = 0;
        let lastBossKillTime: Date | undefined;

        for (const boss of mythicProgress.bosses) {
          const bossDataList = bossDataMap.get(boss.bossId);
          if (bossDataList) {
            bossDataList.push({
              guildName: guild.name,
              guildRealm: guild.realm,
              pullCount: boss.pullCount,
              timeSpent: boss.timeSpent,
              kills: boss.kills,
              firstKillTime: boss.firstKillTime,
            });
          }

          totalPulls += boss.pullCount;
          totalTimeSpent += boss.timeSpent;

          if (boss.kills > 0) {
            bossesKilled++;
            if (boss.firstKillTime) {
              const killTime = new Date(boss.firstKillTime);
              if (!lastBossKillTime || killTime > lastBossKillTime) {
                lastBossKillTime = killTime;
              }
            }
          }
        }

        if (totalPulls > 0) {
          guildRaidDataList.push({
            guildName: guild.name,
            guildRealm: guild.realm,
            totalPulls,
            totalTimeSpent,
            bossesKilled,
            totalBosses,
            lastBossKillTime: bossesKilled === totalBosses ? lastBossKillTime : undefined,
          });
        }
      }

      const raidStart = raid.starts?.eu ? new Date(raid.starts.eu) : undefined;
      const raidEnd = raid.ends?.eu ? new Date(raid.ends.eu) : undefined;

      // Calculate boss analytics
      const bossAnalytics: IBossAnalytics[] = [];

      for (const boss of raid.bosses) {
        const bossDataList = bossDataMap.get(boss.id) || [];
        const pulledGuilds = bossDataList.filter((g) => g.pullCount > 0);
        const killedGuilds = pulledGuilds.filter((g) => g.kills > 0);

        // Calculate pull count stats
        let pullStats = {
          average: 0,
          lowest: 0,
          highest: 0,
        } as IBossAnalytics["pullCount"];

        if (killedGuilds.length > 0) {
          const counts = killedGuilds.map((g) => g.pullCount);

          pullStats = {
            average: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length),
            lowest: Math.min(...counts),
            highest: Math.max(...counts),
          };
        }

        // Calculate time spent stats
        let timeStats = {
          average: 0,
          lowest: 0,
          highest: 0,
        } as IBossAnalytics["timeSpent"];

        if (killedGuilds.length > 0) {
          const times = killedGuilds.map((g) => g.timeSpent);

          timeStats = {
            average: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
            lowest: Math.min(...times),
            highest: Math.max(...times),
          };
        }

        // Create internal guild entries with values for distribution calculation
        const guildEntriesWithValues = killedGuilds.map((g) => ({
          name: g.guildName,
          realm: g.guildRealm,
          pullCount: g.pullCount,
          timeSpent: g.timeSpent,
        }));

        // Calculate pre-bucketed distributions
        const pullDistribution = this.calculateDistribution(guildEntriesWithValues, "pullCount");
        const timeDistribution = this.calculateDistribution(guildEntriesWithValues, "timeSpent");

        // Calculate weekly progression from kill dates
        const killDates = killedGuilds.filter((g) => g.firstKillTime).map((g) => new Date(g.firstKillTime!));
        const weeklyProgression = this.calculateWeeklyProgression(killDates, raidStart, raidEnd);

        bossAnalytics.push({
          bossId: boss.id,
          bossName: boss.name,
          guildsKilled: killedGuilds.length,
          guildsProgressing: pulledGuilds.length - killedGuilds.length,
          pullCount: pullStats,
          timeSpent: timeStats,
          pullDistribution,
          timeDistribution,
          weeklyProgression,
        });
      }

      // Calculate overall raid analytics
      const overallAnalytics = this.calculateOverallAnalytics(guildRaidDataList, totalBosses, raidStart, raidEnd);

      const analytics = await RaidAnalytics.findOneAndUpdate(
        { raidId },
        {
          raidId,
          raidName: raid.name,
          difficulty: "mythic",
          overall: overallAnalytics,
          bosses: bossAnalytics,
          raidStart,
          raidEnd,
          lastCalculated: new Date(),
        },
        { upsert: true, new: true },
      );

      logger.info(`[RaidAnalytics] Completed analytics for ${raid.name}: ${overallAnalytics.guildsCleared} cleared, ${overallAnalytics.guildsProgressing} progressing`);

      return analytics;
    } catch (error) {
      logger.error(`[RaidAnalytics] Error calculating analytics for raid ${raidId}:`, error);
      return null;
    }
  }

  /**
   * Calculate quantile-based distribution buckets
   * Mirrors the frontend bucketing logic exactly
   * Takes guilds with values for calculation, outputs stripped guild entries (name/realm only)
   */
  private calculateDistribution(guilds: IGuildEntryWithValues[], valueKey: "pullCount" | "timeSpent"): IDistribution {
    if (guilds.length === 0) {
      return { buckets: [] };
    }

    const values = guilds.map((g) => g[valueKey]);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue;

    const numGuilds = guilds.length;
    const targetBuckets = numGuilds < 5 ? numGuilds : 5;

    // Helper to strip guild entries to name/realm only
    const stripGuilds = (guildList: IGuildEntryWithValues[]): IGuildEntry[] => guildList.map((g) => ({ name: g.name, realm: g.realm }));

    // Single bucket case: all guilds have same value or few guilds
    if (range === 0 || targetBuckets === 1) {
      const label = valueKey === "timeSpent" ? formatTime(Math.floor(minValue)) : `${Math.floor(minValue)}`;

      return {
        buckets: [
          {
            label,
            count: guilds.length,
            guilds: stripGuilds(guilds),
          },
        ],
      };
    }

    // Sort guilds by value for quantile calculation
    const sortedGuilds = [...guilds].sort((a, b) => a[valueKey] - b[valueKey]);

    // Calculate quantile boundaries
    const bucketBoundaries: number[] = [minValue];
    for (let i = 1; i < targetBuckets; i++) {
      const quantileIndex = Math.floor((i / targetBuckets) * sortedGuilds.length);
      bucketBoundaries.push(sortedGuilds[quantileIndex][valueKey]);
    }
    bucketBoundaries.push(maxValue + 1);

    // Create buckets based on quantile boundaries
    const buckets: { min: number; max: number; guilds: IGuildEntryWithValues[]; sortValue: number }[] = [];

    for (let i = 0; i < targetBuckets; i++) {
      const bucketMin = bucketBoundaries[i];
      const bucketMax = bucketBoundaries[i + 1];

      const guildsInBucket = sortedGuilds.filter((guild) => guild[valueKey] >= bucketMin && guild[valueKey] < bucketMax);

      // For last bucket, include guilds at max boundary
      if (i === targetBuckets - 1) {
        guildsInBucket.push(...sortedGuilds.filter((guild) => guild[valueKey] === bucketMax - 1 && !guildsInBucket.includes(guild)));
      }

      buckets.push({
        min: bucketMin,
        max: bucketMax - 1,
        guilds: guildsInBucket,
        sortValue: guildsInBucket[0]?.[valueKey] ?? 0,
      });
    }

    // Convert to final format with labels and stripped guilds
    const resultBuckets = buckets
      .filter((bucket) => bucket.guilds.length > 0)
      .map((bucket) => {
        let label: string;
        if (valueKey === "timeSpent") {
          const bucketAverage = (bucket.min + bucket.max) / 2;
          label = formatTime(Math.floor(bucketAverage));
        } else {
          label = `${Math.floor(bucket.min)}-${Math.floor(bucket.max)}`;
        }

        return {
          label,
          count: bucket.guilds.length,
          guilds: stripGuilds(bucket.guilds),
          sortValue: bucket.sortValue,
        };
      })
      .sort((a, b) => a.sortValue - b.sortValue)
      .map(({ label, count, guilds }) => ({ label, count, guilds }));

    return { buckets: resultBuckets };
  }

  /**
   * Calculate weekly progression from dates
   * Converts daily data to weekly buckets
   */
  private calculateWeeklyProgression(dates: Date[], raidStart?: Date, raidEnd?: Date): IWeeklyProgressionEntry[] {
    if (!raidStart) {
      return [];
    }

    const startDate = raidStart;
    const endDate = raidEnd || new Date();
    const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
    const totalWeeks = Math.ceil((endDate.getTime() - startDate.getTime()) / millisecondsPerWeek);

    // Sort dates
    const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());

    // Build cumulative count per day first
    const cumulativeByDate = new Map<string, number>();
    let cumulativeCount = 0;

    for (const date of sortedDates) {
      cumulativeCount++;
      const dateStr = date.toISOString().split("T")[0];
      cumulativeByDate.set(dateStr, cumulativeCount);
    }

    const weeklyData: IWeeklyProgressionEntry[] = [];

    for (let week = 1; week <= totalWeeks; week++) {
      const weekStart = new Date(startDate.getTime() + (week - 1) * millisecondsPerWeek);
      const weekEnd = new Date(Math.min(weekStart.getTime() + millisecondsPerWeek, endDate.getTime()));

      // Find max cumulative value within this week
      let weekValue = 0;
      cumulativeByDate.forEach((count, dateStr) => {
        const entryDate = new Date(dateStr);
        if (entryDate >= weekStart && entryDate < weekEnd) {
          weekValue = Math.max(weekValue, count);
        }
      });

      // Carry forward from previous week if no new kills
      if (weekValue === 0 && week > 1) {
        weekValue = weeklyData[week - 2].value;
      }

      weeklyData.push({
        weekNumber: week,
        value: weekValue,
        label: `W${week}`,
      });
    }

    return weeklyData;
  }

  /**
   * Calculate overall raid analytics
   */
  private calculateOverallAnalytics(guildRaidDataList: GuildRaidData[], totalBosses: number, raidStart?: Date, raidEnd?: Date): IRaidOverallAnalytics {
    const clearedGuilds = guildRaidDataList.filter((g) => g.bossesKilled === totalBosses);
    const progressingGuilds = guildRaidDataList.filter((g) => g.bossesKilled > 0 && g.bossesKilled < totalBosses);

    // Pull count stats
    let pullStats = {
      average: 0,
      lowest: 0,
      highest: 0,
    } as IRaidOverallAnalytics["pullCount"];

    if (clearedGuilds.length > 0) {
      const counts = clearedGuilds.map((g) => g.totalPulls);

      pullStats = {
        average: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length),
        lowest: Math.min(...counts),
        highest: Math.max(...counts),
      };
    }

    // Time spent stats
    let timeStats = {
      average: 0,
      lowest: 0,
      highest: 0,
    } as IRaidOverallAnalytics["timeSpent"];

    if (clearedGuilds.length > 0) {
      const times = clearedGuilds.map((g) => g.totalTimeSpent);

      timeStats = {
        average: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
        lowest: Math.min(...times),
        highest: Math.max(...times),
      };
    }

    // Create internal guild entries with values for distribution calculation
    const guildEntriesWithValues: IGuildEntryWithValues[] = clearedGuilds.map((g) => ({
      name: g.guildName,
      realm: g.guildRealm,
      pullCount: g.totalPulls,
      timeSpent: g.totalTimeSpent,
    }));

    // Calculate distributions
    const pullDistribution = this.calculateDistribution(guildEntriesWithValues, "pullCount");
    const timeDistribution = this.calculateDistribution(guildEntriesWithValues, "timeSpent");

    // Calculate weekly clear progression
    const clearDates = clearedGuilds.filter((g) => g.lastBossKillTime).map((g) => g.lastBossKillTime!);
    const weeklyProgression = this.calculateWeeklyProgression(clearDates, raidStart, raidEnd);

    return {
      guildsCleared: clearedGuilds.length,
      guildsProgressing: progressingGuilds.length,
      pullCount: pullStats,
      timeSpent: timeStats,
      pullDistribution,
      timeDistribution,
      weeklyProgression,
    };
  }

  /**
   * Calculate analytics for all tracked raids
   */
  async calculateAllRaidAnalytics(): Promise<void> {
    logger.info("[RaidAnalytics] Starting analytics calculation for all tracked raids...");
    const startTime = Date.now();

    for (const raidId of TRACKED_RAIDS) {
      await this.calculateRaidAnalytics(raidId);
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    logger.info(`[RaidAnalytics] Completed analytics calculation for all raids in ${duration}s`);
  }

  /**
   * Get analytics for a specific raid (full data with bosses)
   */
  async getRaidAnalytics(raidId: number): Promise<IRaidAnalytics | null> {
    return RaidAnalytics.findOne({ raidId }).lean();
  }

  /**
   * Get overall analytics for all raids (raid-level only, no boss data)
   * Returns minimal data for overview display
   */
  async getAllRaidAnalyticsOverview(): Promise<
    {
      raidId: number;
      raidName: string;
      difficulty: string;
      overall: IRaidOverallAnalytics;
      raidStart?: Date;
      raidEnd?: Date;
      lastCalculated: Date;
    }[]
  > {
    const analytics = await RaidAnalytics.find({}).select("raidId raidName difficulty overall raidStart raidEnd lastCalculated").sort({ raidId: -1 }).lean();

    return analytics.map((a) => ({
      raidId: a.raidId,
      raidName: a.raidName,
      difficulty: a.difficulty,
      overall: a.overall,
      raidStart: a.raidStart,
      raidEnd: a.raidEnd,
      lastCalculated: a.lastCalculated,
    }));
  }

  /**
   * Get list of raids that have analytics available
   */
  async getAvailableRaids(): Promise<{ raidId: number; raidName: string; lastCalculated: Date }[]> {
    const analytics = await RaidAnalytics.find({}, { raidId: 1, raidName: 1, lastCalculated: 1 }).sort({
      raidId: -1,
    });

    return analytics.map((a) => ({
      raidId: a.raidId,
      raidName: a.raidName,
      lastCalculated: a.lastCalculated,
    }));
  }
}

export default new RaidAnalyticsService();
