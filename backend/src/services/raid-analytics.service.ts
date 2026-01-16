import Guild from "../models/Guild";
import Raid from "../models/Raid";
import RaidAnalytics, { IRaidAnalytics, IBossAnalytics, IRaidOverallAnalytics } from "../models/RaidAnalytics";
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
  lastBossKillTime?: Date; // Time of the final boss kill (raid clear)
}

class RaidAnalyticsService {
  /**
   * Calculate analytics for a specific raid
   */
  async calculateRaidAnalytics(raidId: number): Promise<IRaidAnalytics | null> {
    try {
      // Get raid info
      const raid = await Raid.findOne({ id: raidId });
      if (!raid) {
        logger.warn(`[RaidAnalytics] Raid ${raidId} not found`);
        return null;
      }

      const totalBosses = raid.bosses.length;
      logger.info(`[RaidAnalytics] Calculating analytics for ${raid.name} (${totalBosses} bosses)`);

      // Get all guilds with progress for this raid (mythic only)
      const guilds = await Guild.find({
        "progress.raidId": raidId,
        "progress.difficulty": "mythic",
      }).select("name realm progress");

      if (guilds.length === 0) {
        logger.info(`[RaidAnalytics] No guilds with progress for raid ${raidId}`);
        return null;
      }

      // Collect data per boss
      const bossDataMap = new Map<number, GuildBossData[]>();
      raid.bosses.forEach((boss) => {
        bossDataMap.set(boss.id, []);
      });

      // Collect overall raid data
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
            // Track last boss kill for cleared guilds
            if (boss.firstKillTime) {
              const killTime = new Date(boss.firstKillTime);
              if (!lastBossKillTime || killTime > lastBossKillTime) {
                lastBossKillTime = killTime;
              }
            }
          }
        }

        // Only include guilds that have pulled at least once
        if (totalPulls > 0) {
          guildRaidDataList.push({
            guildName: guild.name,
            guildRealm: guild.realm,
            totalPulls,
            totalTimeSpent,
            bossesKilled,
            totalBosses,
            // Only set clear time if guild actually cleared the raid
            lastBossKillTime: bossesKilled === totalBosses ? lastBossKillTime : undefined,
          });
        }
      }

      // Calculate boss analytics
      const bossAnalytics: IBossAnalytics[] = [];

      for (const boss of raid.bosses) {
        const bossDataList = bossDataMap.get(boss.id) || [];

        // Filter to guilds that have actually pulled this boss
        const pulledGuilds = bossDataList.filter((g) => g.pullCount > 0);
        const killedGuilds = pulledGuilds.filter((g) => g.kills > 0);

        // Calculate pull count stats (only for guilds that killed)
        let pullStats = { average: 0, lowest: 0, highest: 0, lowestGuild: undefined, highestGuild: undefined } as IBossAnalytics["pullCount"];
        if (killedGuilds.length > 0) {
          const counts = killedGuilds.map((g) => g.pullCount);
          const lowestIdx = counts.indexOf(Math.min(...counts));
          const highestIdx = counts.indexOf(Math.max(...counts));

          pullStats = {
            average: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length),
            lowest: counts[lowestIdx],
            highest: counts[highestIdx],
            lowestGuild: {
              name: killedGuilds[lowestIdx].guildName,
              realm: killedGuilds[lowestIdx].guildRealm,
              count: counts[lowestIdx],
            },
            highestGuild: {
              name: killedGuilds[highestIdx].guildName,
              realm: killedGuilds[highestIdx].guildRealm,
              count: counts[highestIdx],
            },
          };
        }

        // Calculate time spent stats (only for guilds that killed)
        let timeStats = { average: 0, lowest: 0, highest: 0, lowestGuild: undefined, highestGuild: undefined } as IBossAnalytics["timeSpent"];
        if (killedGuilds.length > 0) {
          const times = killedGuilds.map((g) => g.timeSpent);
          const lowestIdx = times.indexOf(Math.min(...times));
          const highestIdx = times.indexOf(Math.max(...times));

          timeStats = {
            average: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
            lowest: times[lowestIdx],
            highest: times[highestIdx],
            lowestGuild: {
              name: killedGuilds[lowestIdx].guildName,
              realm: killedGuilds[lowestIdx].guildRealm,
              time: times[lowestIdx],
            },
            highestGuild: {
              name: killedGuilds[highestIdx].guildName,
              realm: killedGuilds[highestIdx].guildRealm,
              time: times[highestIdx],
            },
          };
        }

        // Calculate kill progression over time
        const killProgression = this.calculateKillProgression(killedGuilds);

        bossAnalytics.push({
          bossId: boss.id,
          bossName: boss.name,
          guildsKilled: killedGuilds.length,
          guildsProgressing: pulledGuilds.length - killedGuilds.length,
          pullCount: pullStats,
          timeSpent: timeStats,
          killProgression,
        });
      }

      // Calculate overall raid analytics
      const overallAnalytics = this.calculateOverallAnalytics(guildRaidDataList, totalBosses);

      // Get raid start/end dates
      const raidStart = raid.starts?.eu ? new Date(raid.starts.eu) : undefined;
      const raidEnd = raid.ends?.eu ? new Date(raid.ends.eu) : undefined;

      // Upsert the analytics document
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
        { upsert: true, new: true }
      );

      logger.info(`[RaidAnalytics] Completed analytics for ${raid.name}: ${overallAnalytics.guildsCleared} cleared, ${overallAnalytics.guildsProgressing} progressing`);

      return analytics;
    } catch (error) {
      logger.error(`[RaidAnalytics] Error calculating analytics for raid ${raidId}:`, error);
      return null;
    }
  }

  /**
   * Calculate kill progression over time (cumulative kills per day)
   */
  private calculateKillProgression(killedGuilds: GuildBossData[]): IBossAnalytics["killProgression"] {
    const killDates: Date[] = [];

    for (const guild of killedGuilds) {
      if (guild.firstKillTime) {
        killDates.push(new Date(guild.firstKillTime));
      }
    }

    if (killDates.length === 0) {
      return [];
    }

    // Sort by date
    killDates.sort((a, b) => a.getTime() - b.getTime());

    // Group by day and create cumulative count
    const progression: { date: Date; killCount: number }[] = [];
    let cumulativeCount = 0;
    let lastDateStr = "";

    for (const date of killDates) {
      cumulativeCount++;
      const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD

      // Only add a new entry if it's a different day
      if (dateStr !== lastDateStr) {
        progression.push({
          date: new Date(dateStr), // Normalize to start of day
          killCount: cumulativeCount,
        });
        lastDateStr = dateStr;
      } else {
        // Update the existing entry for this day
        progression[progression.length - 1].killCount = cumulativeCount;
      }
    }

    return progression;
  }

  /**
   * Calculate overall raid analytics
   */
  private calculateOverallAnalytics(guildRaidDataList: GuildRaidData[], totalBosses: number): IRaidOverallAnalytics {
    const clearedGuilds = guildRaidDataList.filter((g) => g.bossesKilled === totalBosses);
    const progressingGuilds = guildRaidDataList.filter((g) => g.bossesKilled > 0 && g.bossesKilled < totalBosses);

    // Pull count stats (only for guilds that cleared)
    let pullStats = { average: 0, lowest: 0, highest: 0, lowestGuild: undefined, highestGuild: undefined } as IRaidOverallAnalytics["pullCount"];
    if (clearedGuilds.length > 0) {
      const counts = clearedGuilds.map((g) => g.totalPulls);
      const lowestIdx = counts.indexOf(Math.min(...counts));
      const highestIdx = counts.indexOf(Math.max(...counts));

      pullStats = {
        average: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length),
        lowest: counts[lowestIdx],
        highest: counts[highestIdx],
        lowestGuild: {
          name: clearedGuilds[lowestIdx].guildName,
          realm: clearedGuilds[lowestIdx].guildRealm,
          count: counts[lowestIdx],
        },
        highestGuild: {
          name: clearedGuilds[highestIdx].guildName,
          realm: clearedGuilds[highestIdx].guildRealm,
          count: counts[highestIdx],
        },
      };
    }

    // Time spent stats (only for guilds that cleared)
    let timeStats = { average: 0, lowest: 0, highest: 0, lowestGuild: undefined, highestGuild: undefined } as IRaidOverallAnalytics["timeSpent"];
    if (clearedGuilds.length > 0) {
      const times = clearedGuilds.map((g) => g.totalTimeSpent);
      const lowestIdx = times.indexOf(Math.min(...times));
      const highestIdx = times.indexOf(Math.max(...times));

      timeStats = {
        average: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
        lowest: times[lowestIdx],
        highest: times[highestIdx],
        lowestGuild: {
          name: clearedGuilds[lowestIdx].guildName,
          realm: clearedGuilds[lowestIdx].guildRealm,
          time: times[lowestIdx],
        },
        highestGuild: {
          name: clearedGuilds[highestIdx].guildName,
          realm: clearedGuilds[highestIdx].guildRealm,
          time: times[highestIdx],
        },
      };
    }

    // Clear progression (cumulative clears over time)
    const clearProgression = this.calculateClearProgression(clearedGuilds);

    return {
      guildsCleared: clearedGuilds.length,
      guildsProgressing: progressingGuilds.length,
      pullCount: pullStats,
      timeSpent: timeStats,
      clearProgression,
    };
  }

  /**
   * Calculate clear progression over time (cumulative clears per day)
   */
  private calculateClearProgression(clearedGuilds: GuildRaidData[]): IRaidOverallAnalytics["clearProgression"] {
    const clearDates: Date[] = [];

    for (const guild of clearedGuilds) {
      if (guild.lastBossKillTime) {
        clearDates.push(guild.lastBossKillTime);
      }
    }

    if (clearDates.length === 0) {
      return [];
    }

    // Sort by date
    clearDates.sort((a, b) => a.getTime() - b.getTime());

    // Group by day and create cumulative count
    const progression: { date: Date; clearCount: number }[] = [];
    let cumulativeCount = 0;
    let lastDateStr = "";

    for (const date of clearDates) {
      cumulativeCount++;
      const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD

      if (dateStr !== lastDateStr) {
        progression.push({
          date: new Date(dateStr),
          clearCount: cumulativeCount,
        });
        lastDateStr = dateStr;
      } else {
        progression[progression.length - 1].clearCount = cumulativeCount;
      }
    }

    return progression;
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
   * Get analytics for a specific raid
   */
  async getRaidAnalytics(raidId: number): Promise<IRaidAnalytics | null> {
    return RaidAnalytics.findOne({ raidId });
  }

  /**
   * Get analytics for all raids in a single call
   * Sorted by raidId descending (newest to oldest)
   */
  async getAllRaidAnalytics(): Promise<IRaidAnalytics[]> {
    return RaidAnalytics.find({}).sort({ raidId: -1 });
  }

  /**
   * Get list of raids that have analytics available
   */
  async getAvailableRaids(): Promise<{ raidId: number; raidName: string; lastCalculated: Date }[]> {
    const analytics = await RaidAnalytics.find({}, { raidId: 1, raidName: 1, lastCalculated: 1 }).sort({ raidId: -1 });

    return analytics.map((a) => ({
      raidId: a.raidId,
      raidName: a.raidName,
      lastCalculated: a.lastCalculated,
    }));
  }
}

export default new RaidAnalyticsService();
