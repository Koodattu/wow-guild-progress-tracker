import logger from "../utils/logger";
import { CURRENT_RAID_IDS, TRACKED_RAIDS } from "../config/guilds";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Cache warmer function type - async function that generates cache data
 */
type CacheWarmer = () => Promise<any>;

/**
 * Comprehensive in-memory cache service for API responses.
 *
 * Features:
 * - Smart TTL management based on data volatility
 * - Pattern-based cache invalidation
 * - Cache warming for startup and after scheduled updates
 * - Automatic cleanup of expired entries
 *
 * Cache Strategy:
 * - Static data (tier lists, raid analytics, older raids): Long TTL (24h), invalidate on recalculation
 * - Semi-static data (guild list, schedules): Medium TTL (5min), invalidate on guild updates
 * - Dynamic data (current raid progress, live streamers): Short TTL (1-5min), frequent refresh
 */
class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private warmers: Map<string, CacheWarmer> = new Map();

  // ============================================================================
  // TTL CONSTANTS (milliseconds)
  // ============================================================================

  // Static data - rarely changes, long TTL
  public readonly STATIC_TTL = 24 * 60 * 60 * 1000; // 24 hours (effectively infinite until invalidation)
  public readonly TIER_LIST_TTL = 24 * 60 * 60 * 1000; // 24 hours (recalculated nightly)
  public readonly RAID_ANALYTICS_TTL = 24 * 60 * 60 * 1000; // 24 hours (recalculated nightly)
  public readonly OLDER_RAID_TTL = 24 * 60 * 60 * 1000; // 24 hours for historical raids

  // Semi-static data - changes occasionally
  public readonly GUILD_LIST_TTL = 5 * 60 * 1000; // 5 minutes
  public readonly SCHEDULES_TTL = 5 * 60 * 1000; // 5 minutes
  public readonly GUILD_SUMMARY_TTL = 5 * 60 * 1000; // 5 minutes
  public readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  // Dynamic data - changes frequently
  public readonly CURRENT_RAID_TTL = 5 * 60 * 1000; // 5 minutes for current raid
  public readonly LIVE_STREAMERS_TTL = 60 * 1000; // 1 minute
  public readonly EVENTS_TTL = 60 * 1000; // 1 minute

  constructor() {
    // Start automatic cleanup of expired entries every 5 minutes
    this.startCleanupInterval();
  }

  /**
   * Start periodic cleanup of expired cache entries
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredEntries();
      },
      5 * 60 * 1000,
    ); // Run every 5 minutes

    // Prevent the interval from keeping the process alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info("Cache cleanup interval stopped");
    }
  }

  /**
   * Remove all expired entries from cache
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(`Cache cleanup: removed ${removedCount} expired entries (${this.cache.size} remaining)`);
    }
  }

  /**
   * Get cached data if available and not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    // Check if entry has expired
    if (age > entry.ttl) {
      this.cache.delete(key);
      logger.debug(`Cache expired for key: ${key} (age: ${Math.round(age / 1000)}s, ttl: ${Math.round(entry.ttl / 1000)}s)`);
      return null;
    }

    logger.debug(`Cache hit for key: ${key} (age: ${Math.round(age / 1000)}s)`);
    return entry.data as T;
  }

  /**
   * Set data in cache with optional custom TTL
   */
  set<T>(key: string, data: T, customTtl?: number): void {
    const ttl = customTtl ?? this.DEFAULT_TTL;

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });

    logger.debug(`Cache set for key: ${key} (ttl: ${Math.round(ttl / 1000)}s)`);
  }

  /**
   * Invalidate (delete) a specific cache entry
   */
  invalidate(key: string): void {
    const deleted = this.cache.delete(key);
    if (deleted) {
      logger.info(`Cache invalidated for key: ${key}`);
    }
  }

  /**
   * Invalidate all cache entries matching a pattern
   */
  invalidatePattern(pattern: RegExp): void {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    if (count > 0) {
      logger.info(`Cache invalidated ${count} entries matching pattern: ${pattern}`);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`Cache cleared: ${size} entries removed`);
  }

  /**
   * Get cache key for home page
   */
  getHomeKey(): string {
    return "home:data";
  }

  /**
   * Get cache key for progress page by raid
   */
  getProgressKey(raidId: number): string {
    return `progress:raid:${raidId}`;
  }

  /**
   * Get cache key for guilds list by raid
   */
  getGuildsKey(raidId: number | null): string {
    return raidId ? `guilds:raid:${raidId}` : "guilds:all";
  }

  /**
   * Get cache key for minimal guild list (directory page)
   */
  getGuildListKey(): string {
    return "guilds:list";
  }

  /**
   * Get cache key for guild schedules
   */
  getSchedulesKey(): string {
    return "guilds:schedules";
  }

  /**
   * Get cache key for live streamers
   */
  getLiveStreamersKey(): string {
    return "guilds:live-streamers";
  }

  /**
   * Get cache key for individual guild summary
   */
  getGuildSummaryKey(realm: string, name: string): string {
    return `guild:${realm.toLowerCase()}:${name.toLowerCase()}:summary`;
  }

  /**
   * Get cache key for guild boss progress
   */
  getBossProgressKey(realm: string, name: string, raidId: number): string {
    return `guild:${realm.toLowerCase()}:${name.toLowerCase()}:raid:${raidId}:bosses`;
  }

  /**
   * Get cache key for events
   */
  getEventsKey(limit: number): string {
    return `events:limit:${limit}`;
  }

  /**
   * Get cache key for events with pagination
   */
  getEventsPaginatedKey(limit: number, page: number): string {
    return `events:limit:${limit}:page:${page}`;
  }

  /**
   * Get cache key for guild-specific events
   */
  getGuildEventsKey(realm: string, name: string, limit: number, page: number): string {
    return `events:guild:${realm.toLowerCase()}:${name.toLowerCase()}:limit:${limit}:page:${page}`;
  }

  /**
   * Get cache key for raid dates
   */
  getRaidDatesKey(raidId: number): string {
    return `raid:${raidId}:dates`;
  }

  /**
   * Get cache key for tier list (full)
   */
  getTierListFullKey(): string {
    return "tierlists:full";
  }

  /**
   * Get cache key for overall tier list
   */
  getTierListOverallKey(): string {
    return "tierlists:overall";
  }

  /**
   * Get cache key for tier list by raid
   */
  getTierListRaidKey(raidId: number): string {
    return `tierlists:raid:${raidId}`;
  }

  /**
   * Get cache key for tier list available raids
   */
  getTierListRaidsKey(): string {
    return "tierlists:raids";
  }

  /**
   * Get cache key for raid analytics all overview
   */
  getRaidAnalyticsAllKey(): string {
    return "raid-analytics:all";
  }

  /**
   * Get cache key for specific raid analytics
   */
  getRaidAnalyticsKey(raidId: number): string {
    return `raid-analytics:${raidId}`;
  }

  /**
   * Get cache key for raid analytics available raids
   */
  getRaidAnalyticsRaidsKey(): string {
    return "raid-analytics:raids";
  }

  // ============================================================================
  // TTL GETTERS
  // ============================================================================

  /**
   * Get TTL for a specific raid (current vs older)
   */
  getTTLForRaid(raidId: number | null): number {
    if (!raidId) {
      return this.DEFAULT_TTL;
    }
    const isCurrentRaid = CURRENT_RAID_IDS.includes(raidId);
    return isCurrentRaid ? this.CURRENT_RAID_TTL : this.OLDER_RAID_TTL;
  }

  /**
   * Get TTL for events
   */
  getEventsTTL(): number {
    return this.EVENTS_TTL;
  }

  /**
   * Get TTL for tier lists
   */
  getTierListTTL(): number {
    return this.TIER_LIST_TTL;
  }

  /**
   * Get TTL for raid analytics
   */
  getRaidAnalyticsTTL(): number {
    return this.RAID_ANALYTICS_TTL;
  }

  // ============================================================================
  // CACHE INVALIDATION METHODS
  // ============================================================================

  /**
   * Invalidate all guild-related caches
   * Called after guild data updates
   */
  invalidateGuildCaches(): void {
    this.invalidatePattern(/^guilds:/);
    this.invalidatePattern(/^home:/);
    this.invalidatePattern(/^guild:/);
    this.invalidatePattern(/^progress:/);
    logger.info("All guild-related caches invalidated");
  }

  /**
   * Invalidate caches for current raid only
   * Called after current raid progress updates (more targeted)
   */
  invalidateCurrentRaidCaches(): void {
    for (const raidId of CURRENT_RAID_IDS) {
      this.invalidate(this.getProgressKey(raidId));
      this.invalidate(this.getGuildsKey(raidId));
    }
    this.invalidate(this.getHomeKey());
    this.invalidate(this.getLiveStreamersKey());
    logger.info("Current raid caches invalidated");
  }

  /**
   * Invalidate caches for a specific raid
   * Called after raid-specific updates
   */
  invalidateRaidCaches(raidId: number): void {
    this.invalidate(this.getProgressKey(raidId));
    this.invalidate(this.getGuildsKey(raidId));
    this.invalidatePattern(new RegExp(`raid:${raidId}`));

    // If it's a current raid, also invalidate home cache
    if (CURRENT_RAID_IDS.includes(raidId)) {
      this.invalidate(this.getHomeKey());
    }

    logger.info(`Raid-specific caches invalidated for raid ${raidId}`);
  }

  /**
   * Invalidate event caches
   * Called after new events are created
   */
  invalidateEventCaches(): void {
    this.invalidatePattern(/^events:/);
    this.invalidatePattern(/^home:/); // Home page includes events
    logger.info("Event caches invalidated");
  }

  /**
   * Invalidate all tier list caches
   * Called after tier list recalculation
   */
  invalidateTierListCaches(): void {
    this.invalidatePattern(/^tierlists:/);
    logger.info("Tier list caches invalidated");
  }

  /**
   * Invalidate all raid analytics caches
   * Called after raid analytics recalculation
   */
  invalidateRaidAnalyticsCaches(): void {
    this.invalidatePattern(/^raid-analytics:/);
    logger.info("Raid analytics caches invalidated");
  }

  /**
   * Invalidate schedules cache
   * Called when guild schedules are updated
   */
  invalidateSchedulesCaches(): void {
    this.invalidate(this.getSchedulesKey());
    logger.info("Schedules cache invalidated");
  }

  /**
   * Invalidate caches for a specific guild
   * Called after individual guild update
   */
  invalidateGuildSpecificCaches(realm: string, name: string): void {
    // Invalidate guild summary
    this.invalidate(this.getGuildSummaryKey(realm, name));

    // Invalidate all boss progress caches for this guild
    this.invalidatePattern(new RegExp(`^guild:${realm.toLowerCase()}:${name.toLowerCase()}:`));

    // Invalidate guild events
    this.invalidatePattern(new RegExp(`^events:guild:${realm.toLowerCase()}:${name.toLowerCase()}:`));

    logger.debug(`Guild-specific caches invalidated for ${name}-${realm}`);
  }

  // ============================================================================
  // CACHE WARMING
  // ============================================================================

  /**
   * Register a cache warmer function for a specific key
   * Warmers are called during startup and after invalidation
   */
  registerWarmer(key: string, warmer: CacheWarmer): void {
    this.warmers.set(key, warmer);
    logger.debug(`Cache warmer registered for key: ${key}`);
  }

  /**
   * Warm a specific cache key using its registered warmer
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
      this.set(key, data, ttl);
      logger.info(`Cache warmed for key: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Failed to warm cache for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Warm all registered caches
   * Called during server startup
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
   * Warm progress caches for all tracked raids
   * Called during startup or after major updates
   */
  async warmProgressCaches(progressFetcher: (raidId: number) => Promise<any>): Promise<void> {
    logger.info(`[Cache Warm] Warming progress caches for ${TRACKED_RAIDS.length} raids...`);

    for (const raidId of TRACKED_RAIDS) {
      try {
        const key = this.getProgressKey(raidId);
        const data = await progressFetcher(raidId);
        const ttl = this.getTTLForRaid(raidId);
        this.set(key, data, ttl);
        logger.debug(`[Cache Warm] Progress cache warmed for raid ${raidId}`);
      } catch (error) {
        logger.error(`[Cache Warm] Failed to warm progress cache for raid ${raidId}:`, error);
      }
    }

    logger.info(`[Cache Warm] Progress caches warmed for all raids`);
  }

  /**
   * Warm tier list caches for all raids
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
        this.set(this.getTierListFullKey(), fullData, this.TIER_LIST_TTL);
      }

      // Warm overall tier list
      const overallData = await overallFetcher();
      if (overallData) {
        this.set(this.getTierListOverallKey(), overallData, this.TIER_LIST_TTL);
      }

      // Warm available raids list
      const raidsData = await raidsFetcher();
      if (raidsData) {
        this.set(this.getTierListRaidsKey(), raidsData, this.TIER_LIST_TTL);

        // Warm per-raid tier lists
        for (const raid of raidsData) {
          try {
            const raidData = await raidFetcher(raid.raidId);
            if (raidData) {
              this.set(this.getTierListRaidKey(raid.raidId), raidData, this.TIER_LIST_TTL);
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
   * Warm raid analytics caches
   */
  async warmRaidAnalyticsCaches(allFetcher: () => Promise<any>, raidFetcher: (raidId: number) => Promise<any>, raidsFetcher: () => Promise<any>): Promise<void> {
    logger.info(`[Cache Warm] Warming raid analytics caches...`);

    try {
      // Warm all analytics overview
      const allData = await allFetcher();
      if (allData) {
        this.set(this.getRaidAnalyticsAllKey(), allData, this.RAID_ANALYTICS_TTL);
      }

      // Warm available raids list
      const raidsData = await raidsFetcher();
      if (raidsData) {
        this.set(this.getRaidAnalyticsRaidsKey(), raidsData, this.RAID_ANALYTICS_TTL);

        // Warm per-raid analytics
        for (const raid of raidsData) {
          try {
            const raidData = await raidFetcher(raid.raidId);
            if (raidData) {
              this.set(this.getRaidAnalyticsKey(raid.raidId), raidData, this.RAID_ANALYTICS_TTL);
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
   * Infer TTL from cache key pattern
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

    return this.DEFAULT_TTL;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    keys: string[];
    byPrefix: Record<string, number>;
  } {
    const keys = Array.from(this.cache.keys());
    const byPrefix: Record<string, number> = {};

    for (const key of keys) {
      const prefix = key.split(":")[0];
      byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
    }

    return {
      size: this.cache.size,
      keys,
      byPrefix,
    };
  }
}

// Export singleton instance
export default new CacheService();
