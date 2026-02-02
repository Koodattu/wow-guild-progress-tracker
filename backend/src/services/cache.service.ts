import logger from "../utils/logger";
import { CURRENT_RAID_IDS, TRACKED_RAIDS } from "../config/guilds";
import Cache from "../models/Cache";

/**
 * Cache warmer function type - async function that generates cache data
 */
type CacheWarmer = () => Promise<any>;

/**
 * MongoDB-backed cache service for API responses.
 *
 * Features:
 * - Persistent caching via MongoDB collection
 * - Automatic expiration via MongoDB TTL index
 * - Pattern-based cache invalidation
 * - Cache warming for startup and after scheduled updates
 *
 * Cache Strategy:
 * - Static data (tier lists, raid analytics, older raids): Long TTL (24h), invalidate on recalculation
 * - Semi-static data (guild list, schedules): Long TTL (24h), invalidate on updates
 * - Dynamic data (current raid progress, home, live streamers, events): Short TTL (1-5min)
 *
 * TTL Summary:
 * - /api/home: 5 minutes (current raid changes frequently)
 * - /api/progress?raidId=current: 5 minutes
 * - /api/progress?raidId=older: 24 hours (invalidated when guilds recalculated)
 * - /api/guilds/list: 24 hours (invalidated when new guild added or nightly)
 * - /api/guilds/schedules: 24 hours (invalidated when schedules recalculated or nightly)
 * - /api/guilds/live-streamers: 1 minute
 * - /api/guilds/:realm/:name: 24 hours (invalidated when that specific guild updates)
 * - /api/tierlists/*: 24 hours (invalidated when tier lists recalculated)
 * - /api/raid-analytics/*: 24 hours (invalidated when raid analytics recalculated)
 * - /api/events: 1 minute
 */
class CacheService {
  private warmers: Map<string, CacheWarmer> = new Map();
  private isInitialized: boolean = false;

  // ============================================================================
  // TTL CONSTANTS (milliseconds)
  // ============================================================================

  // Static data - rarely changes, long TTL (invalidated by backend triggers)
  public readonly STATIC_TTL = 24 * 60 * 60 * 1000; // 24 hours
  public readonly TIER_LIST_TTL = 24 * 60 * 60 * 1000; // 24 hours (recalculated nightly)
  public readonly RAID_ANALYTICS_TTL = 24 * 60 * 60 * 1000; // 24 hours (recalculated nightly)
  public readonly OLDER_RAID_TTL = 24 * 60 * 60 * 1000; // 24 hours for historical raids

  // Semi-static data - changes occasionally, 24h TTL (invalidated by triggers)
  public readonly GUILD_LIST_TTL = 24 * 60 * 60 * 1000; // 24 hours (invalidated on new guild or nightly)
  public readonly SCHEDULES_TTL = 24 * 60 * 60 * 1000; // 24 hours (invalidated on schedule update or nightly)
  public readonly GUILD_SUMMARY_TTL = 24 * 60 * 60 * 1000; // 24 hours (invalidated on guild update)

  // Dynamic data - changes frequently, short TTL
  public readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  public readonly CURRENT_RAID_TTL = 5 * 60 * 1000; // 5 minutes for current raid
  public readonly LIVE_STREAMERS_TTL = 60 * 1000; // 1 minute
  public readonly EVENTS_TTL = 60 * 1000; // 1 minute

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the cache service.
   * Should be called after MongoDB connection is established.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug("Cache service already initialized");
      return;
    }

    try {
      // Ensure indexes are created (TTL index is critical)
      await Cache.createIndexes();
      this.isInitialized = true;
      logger.info("MongoDB cache service initialized with TTL indexes");
    } catch (error) {
      logger.error("Failed to initialize cache service:", error);
      throw error;
    }
  }

  // ============================================================================
  // CORE CACHE OPERATIONS
  // ============================================================================

  /**
   * Get cached data if available and not expired.
   * Returns null if cache miss or expired (MongoDB TTL handles cleanup).
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const entry = await Cache.findOne({ key }).lean();

      if (!entry) {
        logger.debug(`Cache miss for key: ${key}`);
        return null;
      }

      // Double-check expiration (in case TTL index hasn't cleaned up yet)
      if (new Date() > new Date(entry.expiresAt)) {
        logger.debug(`Cache expired for key: ${key}`);
        return null;
      }

      logger.debug(`Cache hit for key: ${key}`);
      return entry.data as T;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set data in cache with optional custom TTL.
   * Uses upsert to create or update cache entry.
   */
  async set<T>(key: string, data: T, customTtl?: number): Promise<void> {
    try {
      const ttl = customTtl ?? this.DEFAULT_TTL;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl);
      const endpoint = this.extractEndpoint(key);

      await Cache.findOneAndUpdate(
        { key },
        {
          key,
          data,
          cachedAt: now,
          expiresAt,
          ttlMs: ttl,
          endpoint,
        },
        { upsert: true, new: true },
      );

      logger.debug(`Cache set for key: ${key} (ttl: ${Math.round(ttl / 1000)}s)`);
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Extract endpoint category from cache key for grouping.
   */
  private extractEndpoint(key: string): string {
    // Extract first two segments as endpoint identifier
    const parts = key.split(":");
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
    return parts[0];
  }

  /**
   * Invalidate (delete) a specific cache entry.
   */
  async invalidate(key: string): Promise<void> {
    try {
      const result = await Cache.deleteOne({ key });
      if (result.deletedCount > 0) {
        logger.info(`Cache invalidated for key: ${key}`);
      }
    } catch (error) {
      logger.error(`Cache invalidate error for key ${key}:`, error);
    }
  }

  /**
   * Invalidate all cache entries matching a pattern (regex).
   */
  async invalidatePattern(pattern: RegExp): Promise<void> {
    try {
      const result = await Cache.deleteMany({ key: { $regex: pattern } });
      if (result.deletedCount > 0) {
        logger.info(`Cache invalidated ${result.deletedCount} entries matching pattern: ${pattern}`);
      }
    } catch (error) {
      logger.error(`Cache invalidatePattern error for ${pattern}:`, error);
    }
  }

  /**
   * Clear all cache entries.
   */
  async clear(): Promise<void> {
    try {
      const result = await Cache.deleteMany({});
      logger.info(`Cache cleared: ${result.deletedCount} entries removed`);
    } catch (error) {
      logger.error("Cache clear error:", error);
    }
  }

  // ============================================================================
  // CACHE KEY GENERATORS
  // ============================================================================

  /**
   * Get cache key for home page.
   */
  getHomeKey(): string {
    return "home:data";
  }

  /**
   * Get cache key for progress page by raid.
   */
  getProgressKey(raidId: number): string {
    return `progress:raid:${raidId}`;
  }

  /**
   * Get cache key for guilds list by raid.
   */
  getGuildsKey(raidId: number | null): string {
    return raidId ? `guilds:raid:${raidId}` : "guilds:all";
  }

  /**
   * Get cache key for minimal guild list (directory page).
   */
  getGuildListKey(): string {
    return "guilds:list";
  }

  /**
   * Get cache key for guild schedules.
   */
  getSchedulesKey(): string {
    return "guilds:schedules";
  }

  /**
   * Get cache key for live streamers.
   */
  getLiveStreamersKey(): string {
    return "guilds:live-streamers";
  }

  /**
   * Get cache key for individual guild summary.
   */
  getGuildSummaryKey(realm: string, name: string): string {
    return `guild:${realm.toLowerCase()}:${name.toLowerCase()}:summary`;
  }

  /**
   * Get cache key for guild boss progress.
   */
  getBossProgressKey(realm: string, name: string, raidId: number): string {
    return `guild:${realm.toLowerCase()}:${name.toLowerCase()}:raid:${raidId}:bosses`;
  }

  /**
   * Get cache key for events.
   */
  getEventsKey(limit: number): string {
    return `events:limit:${limit}`;
  }

  /**
   * Get cache key for events with pagination.
   */
  getEventsPaginatedKey(limit: number, page: number): string {
    return `events:limit:${limit}:page:${page}`;
  }

  /**
   * Get cache key for guild-specific events.
   */
  getGuildEventsKey(realm: string, name: string, limit: number, page: number): string {
    return `events:guild:${realm.toLowerCase()}:${name.toLowerCase()}:limit:${limit}:page:${page}`;
  }

  /**
   * Get cache key for raid dates.
   */
  getRaidDatesKey(raidId: number): string {
    return `raid:${raidId}:dates`;
  }

  /**
   * Get cache key for tier list (full).
   */
  getTierListFullKey(): string {
    return "tierlists:full";
  }

  /**
   * Get cache key for overall tier list.
   */
  getTierListOverallKey(): string {
    return "tierlists:overall";
  }

  /**
   * Get cache key for tier list by raid.
   */
  getTierListRaidKey(raidId: number): string {
    return `tierlists:raid:${raidId}`;
  }

  /**
   * Get cache key for tier list available raids.
   */
  getTierListRaidsKey(): string {
    return "tierlists:raids";
  }

  /**
   * Get cache key for raid analytics all overview.
   */
  getRaidAnalyticsAllKey(): string {
    return "raid-analytics:all";
  }

  /**
   * Get cache key for specific raid analytics.
   */
  getRaidAnalyticsKey(raidId: number): string {
    return `raid-analytics:${raidId}`;
  }

  /**
   * Get cache key for raid analytics available raids.
   */
  getRaidAnalyticsRaidsKey(): string {
    return "raid-analytics:raids";
  }

  // ============================================================================
  // TTL GETTERS
  // ============================================================================

  /**
   * Get TTL for a specific raid (current vs older).
   */
  getTTLForRaid(raidId: number | null): number {
    if (!raidId) {
      return this.DEFAULT_TTL;
    }
    const isCurrentRaid = CURRENT_RAID_IDS.includes(raidId);
    return isCurrentRaid ? this.CURRENT_RAID_TTL : this.OLDER_RAID_TTL;
  }

  /**
   * Get TTL for events.
   */
  getEventsTTL(): number {
    return this.EVENTS_TTL;
  }

  /**
   * Get TTL for tier lists.
   */
  getTierListTTL(): number {
    return this.TIER_LIST_TTL;
  }

  /**
   * Get TTL for raid analytics.
   */
  getRaidAnalyticsTTL(): number {
    return this.RAID_ANALYTICS_TTL;
  }

  // ============================================================================
  // CACHE INVALIDATION METHODS
  // ============================================================================

  /**
   * Invalidate ALL guild-related caches including older raid progress.
   *
   * ⚠️  USE SPARINGLY - This is aggressive and should only be called when:
   * - A NEW guild is added and its data is fetched (new guild appears in all lists)
   * - Major data restructuring occurs
   *
   * This invalidates:
   * - guilds:* (guild list, schedules, live streamers)
   * - home:* (home page data)
   * - guild:* (individual guild summaries)
   * - progress:* (ALL raid progress including older raids)
   */
  async invalidateAllGuildCaches(): Promise<void> {
    await this.invalidatePattern(/^guilds:/);
    await this.invalidatePattern(/^home:/);
    await this.invalidatePattern(/^guild:/);
    await this.invalidatePattern(/^progress:/);
    logger.info("All guild-related caches invalidated (including older raids)");
  }

  /**
   * @deprecated Use invalidateCurrentRaidCaches() for regular updates or invalidateAllGuildCaches() for new guilds
   */
  async invalidateGuildCaches(): Promise<void> {
    // Redirect to the more targeted method for backward compatibility
    // This prevents accidental invalidation of older raid caches
    await this.invalidateCurrentRaidCaches();
  }

  /**
   * Invalidate caches for current raid only.
   *
   * ✅ USE THIS for regular guild updates (hot/off hours).
   *
   * This is the correct method for most guild update scenarios because:
   * - Older raid data NEVER changes (guilds don't get new progress for completed raids)
   * - Only current raid progress can change during updates
   * - Home page shows current raid data
   *
   * This invalidates:
   * - progress:raid:{currentRaidId} (current raid progress only)
   * - guilds:raid:{currentRaidId} (current raid guild list)
   * - home:* (home page shows current raid)
   * - guilds:live-streamers (can change during updates)
   */
  async invalidateCurrentRaidCaches(): Promise<void> {
    for (const raidId of CURRENT_RAID_IDS) {
      await this.invalidate(this.getProgressKey(raidId));
      await this.invalidate(this.getGuildsKey(raidId));
    }
    await this.invalidate(this.getHomeKey());
    await this.invalidate(this.getLiveStreamersKey());
    logger.info("Current raid caches invalidated");
  }

  /**
   * Invalidate caches for a specific raid.
   * Called after raid-specific updates.
   */
  async invalidateRaidCaches(raidId: number): Promise<void> {
    await this.invalidate(this.getProgressKey(raidId));
    await this.invalidate(this.getGuildsKey(raidId));
    await this.invalidatePattern(new RegExp(`raid:${raidId}`));

    // If it's a current raid, also invalidate home cache
    if (CURRENT_RAID_IDS.includes(raidId)) {
      await this.invalidate(this.getHomeKey());
    }

    logger.info(`Raid-specific caches invalidated for raid ${raidId}`);
  }

  /**
   * Invalidate event caches.
   * Called after new events are created.
   */
  async invalidateEventCaches(): Promise<void> {
    await this.invalidatePattern(/^events:/);
    await this.invalidatePattern(/^home:/); // Home page includes events
    logger.info("Event caches invalidated");
  }

  /**
   * Invalidate all tier list caches.
   * Called after tier list recalculation.
   */
  async invalidateTierListCaches(): Promise<void> {
    await this.invalidatePattern(/^tierlists:/);
    logger.info("Tier list caches invalidated");
  }

  /**
   * Invalidate all raid analytics caches.
   * Called after raid analytics recalculation.
   */
  async invalidateRaidAnalyticsCaches(): Promise<void> {
    await this.invalidatePattern(/^raid-analytics:/);
    logger.info("Raid analytics caches invalidated");
  }

  /**
   * Invalidate schedules cache.
   * Called when guild schedules are updated.
   */
  async invalidateSchedulesCaches(): Promise<void> {
    await this.invalidate(this.getSchedulesKey());
    logger.info("Schedules cache invalidated");
  }

  /**
   * Invalidate caches for a specific guild.
   * Called after individual guild update.
   */
  async invalidateGuildSpecificCaches(realm: string, name: string): Promise<void> {
    // Invalidate guild summary
    await this.invalidate(this.getGuildSummaryKey(realm, name));

    // Invalidate all boss progress caches for this guild
    await this.invalidatePattern(new RegExp(`^guild:${realm.toLowerCase()}:${name.toLowerCase()}:`));

    // Invalidate guild events
    await this.invalidatePattern(new RegExp(`^events:guild:${realm.toLowerCase()}:${name.toLowerCase()}:`));

    logger.debug(`Guild-specific caches invalidated for ${name}-${realm}`);
  }

  // ============================================================================
  // CACHE WARMING
  // ============================================================================

  /**
   * Register a cache warmer function for a specific key.
   * Warmers are called during startup and after invalidation.
   */
  registerWarmer(key: string, warmer: CacheWarmer): void {
    this.warmers.set(key, warmer);
    logger.debug(`Cache warmer registered for key: ${key}`);
  }

  /**
   * Warm a specific cache key using its registered warmer.
   */
  async warmCache(key: string): Promise<boolean> {
    const warmer = this.warmers.get(key);
    if (!warmer) {
      logger.debug(`No warmer registered for key: ${key}`);
      return false;
    }

    try {
      const data = await warmer();
      // TTL will be determined by the cache key pattern
      const ttl = this.inferTTLFromKey(key);
      await this.set(key, data, ttl);
      logger.info(`Cache warmed for key: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Failed to warm cache for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Warm all registered caches.
   * Called during server startup.
   */
  async warmAllCaches(): Promise<{ warmed: number; failed: number }> {
    logger.info(`[Cache Warm] Starting cache warm-up for ${this.warmers.size} registered warmers...`);
    let warmed = 0;
    let failed = 0;

    for (const key of this.warmers.keys()) {
      const success = await this.warmCache(key);
      if (success) {
        warmed++;
      } else {
        failed++;
      }
    }

    logger.info(`[Cache Warm] Cache warm-up complete: ${warmed} warmed, ${failed} failed`);
    return { warmed, failed };
  }

  /**
   * Warm progress caches for all tracked raids.
   * Called during startup or after major updates.
   */
  async warmProgressCaches(progressFetcher: (raidId: number) => Promise<any>): Promise<void> {
    logger.info(`[Cache Warm] Warming progress caches for ${TRACKED_RAIDS.length} raids...`);

    for (const raidId of TRACKED_RAIDS) {
      try {
        const key = this.getProgressKey(raidId);
        const data = await progressFetcher(raidId);
        const ttl = this.getTTLForRaid(raidId);
        await this.set(key, data, ttl);
        logger.debug(`[Cache Warm] Progress cache warmed for raid ${raidId}`);
      } catch (error) {
        logger.error(`[Cache Warm] Failed to warm progress cache for raid ${raidId}:`, error);
      }
    }

    logger.info(`[Cache Warm] Progress caches warmed for all raids`);
  }

  /**
   * Warm tier list caches for all raids.
   */
  async warmTierListCaches(
    fullFetcher: () => Promise<any>,
    overallFetcher: () => Promise<any>,
    raidFetcher: (raidId: number) => Promise<any>,
    raidsFetcher: () => Promise<any>,
  ): Promise<void> {
    logger.info(`[Cache Warm] Warming tier list caches...`);

    try {
      // Warm full tier list
      const fullData = await fullFetcher();
      if (fullData) {
        await this.set(this.getTierListFullKey(), fullData, this.TIER_LIST_TTL);
      }

      // Warm overall tier list
      const overallData = await overallFetcher();
      if (overallData) {
        await this.set(this.getTierListOverallKey(), overallData, this.TIER_LIST_TTL);
      }

      // Warm available raids list
      const raidsData = await raidsFetcher();
      if (raidsData) {
        await this.set(this.getTierListRaidsKey(), raidsData, this.TIER_LIST_TTL);

        // Warm per-raid tier lists
        for (const raid of raidsData) {
          try {
            const raidData = await raidFetcher(raid.raidId);
            if (raidData) {
              await this.set(this.getTierListRaidKey(raid.raidId), raidData, this.TIER_LIST_TTL);
            }
          } catch (error) {
            logger.error(`[Cache Warm] Failed to warm tier list for raid ${raid.raidId}:`, error);
          }
        }
      }

      logger.info(`[Cache Warm] Tier list caches warmed`);
    } catch (error) {
      logger.error(`[Cache Warm] Failed to warm tier list caches:`, error);
    }
  }

  /**
   * Warm raid analytics caches.
   */
  async warmRaidAnalyticsCaches(allFetcher: () => Promise<any>, raidFetcher: (raidId: number) => Promise<any>, raidsFetcher: () => Promise<any>): Promise<void> {
    logger.info(`[Cache Warm] Warming raid analytics caches...`);

    try {
      // Warm all analytics overview
      const allData = await allFetcher();
      if (allData) {
        await this.set(this.getRaidAnalyticsAllKey(), allData, this.RAID_ANALYTICS_TTL);
      }

      // Warm available raids list
      const raidsData = await raidsFetcher();
      if (raidsData) {
        await this.set(this.getRaidAnalyticsRaidsKey(), raidsData, this.RAID_ANALYTICS_TTL);

        // Warm per-raid analytics
        for (const raid of raidsData) {
          try {
            const raidData = await raidFetcher(raid.raidId);
            if (raidData) {
              await this.set(this.getRaidAnalyticsKey(raid.raidId), raidData, this.RAID_ANALYTICS_TTL);
            }
          } catch (error) {
            logger.error(`[Cache Warm] Failed to warm analytics for raid ${raid.raidId}:`, error);
          }
        }
      }

      logger.info(`[Cache Warm] Raid analytics caches warmed`);
    } catch (error) {
      logger.error(`[Cache Warm] Failed to warm raid analytics caches:`, error);
    }
  }

  /**
   * Infer TTL from cache key pattern.
   */
  private inferTTLFromKey(key: string): number {
    if (key.startsWith("tierlists:")) return this.TIER_LIST_TTL;
    if (key.startsWith("raid-analytics:")) return this.RAID_ANALYTICS_TTL;
    if (key.startsWith("progress:")) {
      // Extract raid ID and determine TTL
      const match = key.match(/progress:raid:(\d+)/);
      if (match) {
        const raidId = parseInt(match[1]);
        return this.getTTLForRaid(raidId);
      }
    }
    if (key.startsWith("guilds:raid:")) {
      const match = key.match(/guilds:raid:(\d+)/);
      if (match) {
        const raidId = parseInt(match[1]);
        return this.getTTLForRaid(raidId);
      }
    }
    if (key === "guilds:list") return this.GUILD_LIST_TTL;
    if (key === "guilds:schedules") return this.SCHEDULES_TTL;
    if (key === "guilds:live-streamers") return this.LIVE_STREAMERS_TTL;
    if (key.startsWith("events:")) return this.EVENTS_TTL;
    if (key.startsWith("home:")) return this.CURRENT_RAID_TTL;
    if (key.startsWith("guild:")) return this.GUILD_SUMMARY_TTL;

    return this.DEFAULT_TTL;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get cache statistics.
   */
  async getStats(): Promise<{
    totalEntries: number;
    byEndpoint: Record<string, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    try {
      const totalEntries = await Cache.countDocuments();

      // Group by endpoint
      const endpointStats = await Cache.aggregate([{ $group: { _id: "$endpoint", count: { $sum: 1 } } }]);

      const byEndpoint: Record<string, number> = {};
      for (const stat of endpointStats) {
        byEndpoint[stat._id] = stat.count;
      }

      // Get oldest and newest entries
      const oldest = await Cache.findOne().sort({ cachedAt: 1 }).select("cachedAt").lean();
      const newest = await Cache.findOne().sort({ cachedAt: -1 }).select("cachedAt").lean();

      return {
        totalEntries,
        byEndpoint,
        oldestEntry: oldest?.cachedAt || null,
        newestEntry: newest?.cachedAt || null,
      };
    } catch (error) {
      logger.error("Failed to get cache stats:", error);
      return {
        totalEntries: 0,
        byEndpoint: {},
        oldestEntry: null,
        newestEntry: null,
      };
    }
  }
}

// Export singleton instance
export default new CacheService();
