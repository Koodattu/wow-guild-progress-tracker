import cacheService from "./cache.service";
import guildService from "./guild.service";
import tierListService from "./tierlist.service";
import raidAnalyticsService from "./raid-analytics.service";
import { TRACKED_RAIDS, CURRENT_RAID_IDS } from "../config/guilds";
import logger from "../utils/logger";
import Raid from "../models/Raid";
import Event from "../models/Event";

/**
 * Cache Warming Service
 *
 * Responsible for pre-populating caches with data to ensure
 * fast response times for end users. Called during:
 * - Server startup (after initialization)
 * - After scheduled recalculations (tier lists, analytics)
 * - After guild updates
 */
class CacheWarmerService {
  /**
   * Warm all critical caches on server startup
   * This should be called after all services are initialized
   */
  async warmAllCaches(): Promise<void> {
    logger.info("[Cache Warmer] Starting full cache warm-up...");
    const startTime = Date.now();

    try {
      // Warm caches in priority order (most important first)
      await Promise.all([this.warmProgressCaches(), this.warmHomeCacheData(), this.warmGuildListCaches()]);

      // Warm tier lists and analytics (can take longer)
      await Promise.all([this.warmTierListCaches(), this.warmRaidAnalyticsCaches()]);

      const duration = Math.round((Date.now() - startTime) / 1000);
      logger.info(`[Cache Warmer] Full cache warm-up completed in ${duration}s`);
    } catch (error) {
      logger.error("[Cache Warmer] Error during cache warm-up:", error);
    }
  }

  /**
   * Warm progress caches for all tracked raids
   * Older raids get longer TTL since they don't change
   */
  async warmProgressCaches(): Promise<void> {
    logger.info(`[Cache Warmer] Warming progress caches for ${TRACKED_RAIDS.length} raids...`);

    for (const raidId of TRACKED_RAIDS) {
      try {
        const key = cacheService.getProgressKey(raidId);
        const data = await guildService.getAllGuildsForRaid(raidId);
        const ttl = cacheService.getTTLForRaid(raidId);
        cacheService.set(key, data, ttl);
        logger.debug(`[Cache Warmer] Progress cache warmed for raid ${raidId}`);
      } catch (error) {
        logger.error(`[Cache Warmer] Failed to warm progress cache for raid ${raidId}:`, error);
      }
    }

    logger.info(`[Cache Warmer] Progress caches warmed`);
  }

  /**
   * Warm home page data cache
   */
  async warmHomeCacheData(): Promise<void> {
    logger.info("[Cache Warmer] Warming home page cache...");

    try {
      const currentRaidId = CURRENT_RAID_IDS[0];

      // Fetch all data needed for home page
      const [guilds, events, raid, raidDatesDoc] = await Promise.all([
        guildService.getAllGuildsForRaid(currentRaidId),
        Event.find().sort({ timestamp: -1 }).limit(5).lean(),
        Raid.findOne({ id: currentRaidId }).lean(),
        Raid.findOne({ id: currentRaidId }).select("starts ends").lean(),
      ]);

      if (!raid) {
        logger.warn("[Cache Warmer] Current raid not found, skipping home cache");
        return;
      }

      // Sort guilds by rank
      const sortedGuilds = guilds.sort((a: any, b: any) => {
        const aMythic = a.progress.find((p: any) => p.difficulty === "mythic" && p.raidId === currentRaidId);
        const bMythic = b.progress.find((p: any) => p.difficulty === "mythic" && p.raidId === currentRaidId);
        const aHeroic = a.progress.find((p: any) => p.difficulty === "heroic" && p.raidId === currentRaidId);
        const bHeroic = b.progress.find((p: any) => p.difficulty === "heroic" && p.raidId === currentRaidId);

        const aProgress = aMythic || aHeroic;
        const bProgress = bMythic || bHeroic;

        if (!aProgress && !bProgress) return 0;
        if (!aProgress) return 1;
        if (!bProgress) return -1;

        const aRank = aProgress.guildRank ?? 999;
        const bRank = bProgress.guildRank ?? 999;

        return aRank - bRank;
      });

      const response = {
        raid: {
          id: (raid as any).id,
          name: (raid as any).name,
          slug: (raid as any).slug,
          expansion: (raid as any).expansion,
          iconUrl: (raid as any).iconUrl,
        },
        dates: {
          starts: (raidDatesDoc as any)?.starts,
          ends: (raidDatesDoc as any)?.ends,
        },
        guilds: sortedGuilds,
        events: events,
      };

      cacheService.set(cacheService.getHomeKey(), response, cacheService.CURRENT_RAID_TTL);
      logger.info("[Cache Warmer] Home page cache warmed");
    } catch (error) {
      logger.error("[Cache Warmer] Failed to warm home cache:", error);
    }
  }

  /**
   * Warm guild list related caches
   */
  async warmGuildListCaches(): Promise<void> {
    logger.info("[Cache Warmer] Warming guild list caches...");

    try {
      // Warm minimal guild list
      const guildList = await guildService.getGuildListMinimal();
      cacheService.set(cacheService.getGuildListKey(), guildList, cacheService.GUILD_LIST_TTL);

      // Warm schedules
      const schedules = await guildService.getAllGuildSchedules();
      cacheService.set(cacheService.getSchedulesKey(), schedules, cacheService.SCHEDULES_TTL);

      logger.info("[Cache Warmer] Guild list caches warmed");
    } catch (error) {
      logger.error("[Cache Warmer] Failed to warm guild list caches:", error);
    }
  }

  /**
   * Warm tier list caches
   */
  async warmTierListCaches(): Promise<void> {
    logger.info("[Cache Warmer] Warming tier list caches...");

    try {
      // Warm full tier list
      const fullTierList = await tierListService.getTierList();
      if (fullTierList) {
        cacheService.set(cacheService.getTierListFullKey(), fullTierList, cacheService.TIER_LIST_TTL);
      }

      // Warm overall tier list
      const overallTierList = await tierListService.getOverallTierList();
      if (overallTierList) {
        cacheService.set(cacheService.getTierListOverallKey(), overallTierList, cacheService.TIER_LIST_TTL);
      }

      // Warm available raids
      const raids = await tierListService.getAvailableRaids();
      if (raids) {
        cacheService.set(cacheService.getTierListRaidsKey(), raids, cacheService.TIER_LIST_TTL);

        // Warm per-raid tier lists
        for (const raid of raids) {
          try {
            const raidTierList = await tierListService.getTierListForRaid(raid.raidId);
            if (raidTierList) {
              cacheService.set(cacheService.getTierListRaidKey(raid.raidId), raidTierList, cacheService.TIER_LIST_TTL);
            }
          } catch (error) {
            logger.error(`[Cache Warmer] Failed to warm tier list for raid ${raid.raidId}:`, error);
          }
        }
      }

      logger.info("[Cache Warmer] Tier list caches warmed");
    } catch (error) {
      logger.error("[Cache Warmer] Failed to warm tier list caches:", error);
    }
  }

  /**
   * Warm raid analytics caches
   */
  async warmRaidAnalyticsCaches(): Promise<void> {
    logger.info("[Cache Warmer] Warming raid analytics caches...");

    try {
      // Warm all analytics overview
      const allAnalytics = await raidAnalyticsService.getAllRaidAnalyticsOverview();
      if (allAnalytics) {
        cacheService.set(cacheService.getRaidAnalyticsAllKey(), allAnalytics, cacheService.RAID_ANALYTICS_TTL);
      }

      // Warm available raids
      const raids = await raidAnalyticsService.getAvailableRaids();
      if (raids) {
        cacheService.set(cacheService.getRaidAnalyticsRaidsKey(), raids, cacheService.RAID_ANALYTICS_TTL);

        // Warm per-raid analytics
        for (const raid of raids) {
          try {
            const raidAnalytics = await raidAnalyticsService.getRaidAnalytics(raid.raidId);
            if (raidAnalytics) {
              cacheService.set(cacheService.getRaidAnalyticsKey(raid.raidId), raidAnalytics, cacheService.RAID_ANALYTICS_TTL);
            }
          } catch (error) {
            logger.error(`[Cache Warmer] Failed to warm analytics for raid ${raid.raidId}:`, error);
          }
        }
      }

      logger.info("[Cache Warmer] Raid analytics caches warmed");
    } catch (error) {
      logger.error("[Cache Warmer] Failed to warm raid analytics caches:", error);
    }
  }

  /**
   * Warm caches for current raid only
   * Called after guild updates during hot hours
   */
  async warmCurrentRaidCaches(): Promise<void> {
    logger.info("[Cache Warmer] Warming current raid caches...");

    try {
      for (const raidId of CURRENT_RAID_IDS) {
        const key = cacheService.getProgressKey(raidId);
        const data = await guildService.getAllGuildsForRaid(raidId);
        cacheService.set(key, data, cacheService.CURRENT_RAID_TTL);
      }

      // Also warm home page
      await this.warmHomeCacheData();

      logger.info("[Cache Warmer] Current raid caches warmed");
    } catch (error) {
      logger.error("[Cache Warmer] Failed to warm current raid caches:", error);
    }
  }
}

export default new CacheWarmerService();
