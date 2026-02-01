import logger from "../utils/logger";
import { CURRENT_RAID_IDS } from "../config/guilds";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Simple in-memory cache service for API responses
 * Provides smart invalidation and TTL management
 */
class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Default TTLs in milliseconds (exposed as public for use in routes)
  public readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  public readonly CURRENT_RAID_TTL = 3 * 60 * 1000; // 3 minutes for current raid
  public readonly OLDER_RAID_TTL = 60 * 60 * 1000; // 60 minutes for older raids
  public readonly EVENTS_TTL = 60 * 1000; // 1 minute for events

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
   * Get cache key for guilds list by raid
   */
  getGuildsKey(raidId: number | null): string {
    return raidId ? `guilds:raid:${raidId}` : "guilds:all";
  }

  /**
   * Get cache key for events
   */
  getEventsKey(limit: number): string {
    return `events:${limit}`;
  }

  /**
   * Get cache key for raid dates
   */
  getRaidDatesKey(raidId: number): string {
    return `raid:${raidId}:dates`;
  }

  /**
   * Get cache key for boss progress
   */
  getBossProgressKey(realm: string, name: string, raidId: number): string {
    return `guild:${realm}:${name}:raid:${raidId}:bosses`;
  }

  /**
   * Get TTL for a specific raid
   */
  getTTLForRaid(raidId: number | null): number {
    if (!raidId) {
      return this.DEFAULT_TTL;
    }

    // Check if this is a current raid
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
   * Invalidate all guild-related caches
   * Called after guild data updates
   */
  invalidateGuildCaches(): void {
    this.invalidatePattern(/^guilds:/);
    this.invalidatePattern(/^home:/);
    this.invalidatePattern(/^guild:/);
    logger.info("All guild-related caches invalidated");
  }

  /**
   * Invalidate caches for a specific raid
   * Called after raid-specific updates
   */
  invalidateRaidCaches(raidId: number): void {
    this.invalidatePattern(new RegExp(`raid:${raidId}`));
    this.invalidatePattern(new RegExp(`guilds:raid:${raidId}`));

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
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Export singleton instance
export default new CacheService();
