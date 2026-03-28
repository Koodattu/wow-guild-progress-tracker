import fetch from "node-fetch";
import { RAIDER_IO_EXPANSION_IDS } from "../config/guilds";
import logger from "../utils/logger";

interface RaiderIORegionDates {
  us: string;
  eu: string;
  tw: string;
  kr: string;
  cn: string;
}

interface RaiderIOEncounter {
  id: number;
  slug: string;
  name: string;
}

interface RaiderIORaid {
  id: number;
  slug: string;
  name: string;
  short_name: string;
  starts: RaiderIORegionDates;
  ends: RaiderIORegionDates;
  encounters: RaiderIOEncounter[];
}

interface RaiderIOStaticDataResponse {
  raids: RaiderIORaid[];
}

export interface RaiderIORaidTierProgress {
  summary: string;
  total_bosses: number;
  normal_bosses_killed: number;
  heroic_bosses_killed: number;
  mythic_bosses_killed: number;
}

export interface RaiderIOGuildProfile {
  name: string;
  faction: string;
  region: string;
  realm: string;
  raid_progression: Record<string, RaiderIORaidTierProgress>;
}

export interface RaiderIORaidRanks {
  world: number;
  region: number;
  realm: number;
}

export interface RaiderIORaidDifficultyRankings {
  normal?: RaiderIORaidRanks;
  heroic?: RaiderIORaidRanks;
  mythic?: RaiderIORaidRanks;
}

export interface RaiderIOGuildRankingsProfile {
  name: string;
  faction: string;
  region: string;
  realm: string;
  raid_rankings: Record<string, RaiderIORaidDifficultyRankings>;
}

/**
 * Rate limiter configuration for Raider.IO API.
 * Uses sliding window token bucket: 2000 requests per hour with API key.
 */
interface RaiderIORateLimitConfig {
  maxRequestsPerHour: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
}

export class RaiderIOApiClient {
  private readonly apiKey: string;
  private readonly apiBaseUrl = "https://raider.io/api/v1";

  // Expansion IDs are configured centrally in guilds config
  private readonly expansionIds = RAIDER_IO_EXPANSION_IDS;

  // Rate limiting: sliding window of request timestamps
  private requestTimestamps: number[] = [];
  private readonly rateLimitConfig: RaiderIORateLimitConfig = {
    maxRequestsPerHour: 1800, // Conservative: 1800 of 2000 limit to leave headroom
    retryAttempts: 3,
    retryBaseDelayMs: 2000,
  };

  constructor() {
    this.apiKey = process.env.RAIDER_IO_API_KEY!;

    if (!this.apiKey) {
      throw new Error("Raider.IO API key not found in environment variables");
    }
  }

  /**
   * Wait until a request slot is available under the hourly rate limit.
   * Prunes timestamps older than 1 hour, then waits if at capacity.
   */
  private async waitForRateLimit(): Promise<void> {
    const oneHourAgo = Date.now() - 3600 * 1000;
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > oneHourAgo);

    if (this.requestTimestamps.length >= this.rateLimitConfig.maxRequestsPerHour) {
      const oldestInWindow = this.requestTimestamps[0];
      const waitMs = oldestInWindow + 3600 * 1000 - Date.now() + 100; // +100ms buffer
      logger.warn(`[RaiderIO RateLimit] At capacity (${this.requestTimestamps.length}/${this.rateLimitConfig.maxRequestsPerHour}), waiting ${Math.ceil(waitMs / 1000)}s`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      // Re-prune after waiting
      const nowOneHourAgo = Date.now() - 3600 * 1000;
      this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > nowOneHourAgo);
    }

    this.requestTimestamps.push(Date.now());
  }

  /**
   * Execute a rate-limited fetch with retry on timeout/transient errors.
   * Returns the fetch Response or null on permanent failure.
   */
  private async rateLimitedFetch(url: string, logLabel: string): Promise<any | null> {
    for (let attempt = 1; attempt <= this.rateLimitConfig.retryAttempts; attempt++) {
      await this.waitForRateLimit();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(url, { signal: controller.signal as any });
        clearTimeout(timeoutId);

        // 429 Too Many Requests: back off and retry
        if (response.status === 429) {
          const delay = this.rateLimitConfig.retryBaseDelayMs * Math.pow(2, attempt - 1);
          logger.warn(`[RaiderIO] 429 rate limited on ${logLabel}, retrying in ${delay}ms (attempt ${attempt}/${this.rateLimitConfig.retryAttempts})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // 5xx Server errors: retry with backoff
        if (response.status >= 500) {
          const delay = this.rateLimitConfig.retryBaseDelayMs * Math.pow(2, attempt - 1);
          logger.warn(`[RaiderIO] Server error ${response.status} on ${logLabel}, retrying in ${delay}ms (attempt ${attempt}/${this.rateLimitConfig.retryAttempts})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        return response;
      } catch (error: any) {
        const isTimeout = error.name === "AbortError" || error.type === "aborted" || error.code === "ETIMEDOUT" || error.code === "ECONNRESET";
        if (isTimeout && attempt < this.rateLimitConfig.retryAttempts) {
          const delay = this.rateLimitConfig.retryBaseDelayMs * Math.pow(2, attempt - 1);
          logger.warn(`[RaiderIO] Timeout on ${logLabel}, retrying in ${delay}ms (attempt ${attempt}/${this.rateLimitConfig.retryAttempts})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        logger.warn(`[RaiderIO] Fetch failed for ${logLabel} after ${attempt} attempt(s): ${error.message}`);
        return null;
      }
    }

    logger.warn(`[RaiderIO] All ${this.rateLimitConfig.retryAttempts} attempts exhausted for ${logLabel}`);
    return null;
  }

  /**
   * Get current rate limit usage for monitoring
   */
  public getRateLimitUsage(): { requestsInWindow: number; maxPerHour: number } {
    const oneHourAgo = Date.now() - 3600 * 1000;
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > oneHourAgo);
    return {
      requestsInWindow: this.requestTimestamps.length,
      maxPerHour: this.rateLimitConfig.maxRequestsPerHour,
    };
  }

  /**
   * Fetch raid static data for a specific expansion
   */
  private async fetchExpansionRaids(expansionId: number): Promise<RaiderIORaid[]> {
    const url = `${this.apiBaseUrl}/raiding/static-data?access_key=${this.apiKey}&expansion_id=${expansionId}`;
    const logLabel = `raiding/static-data?expansion_id=${expansionId}`;

    logger.info(`📅 Fetching raid dates for expansion ${expansionId}...`);
    logger.info(`[API REQUEST] GET ${this.apiBaseUrl}/${logLabel}`);

    const response = await this.rateLimitedFetch(url, logLabel);

    if (!response) {
      throw new Error(`Raider.IO API request failed for expansion ${expansionId} (no response after retries)`);
    }

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as RaiderIOStaticDataResponse;
    logger.info(`✅ Found ${data.raids.length} raids for expansion ${expansionId}`);
    return data.raids;
  }

  /**
   * Fetch raid dates for all configured expansions
   * Returns a Map with raid slug/name as key and raid data as value
   */
  public async fetchAllRaidDates(): Promise<Map<string, RaiderIORaid>> {
    logger.info("📅 Fetching raid dates from Raider.IO for configured expansions...");

    const allRaids = new Map<string, RaiderIORaid>();

    for (const expansionId of this.expansionIds) {
      try {
        const raids = await this.fetchExpansionRaids(expansionId);

        // Store raids by both slug and name for flexible matching
        for (const raid of raids) {
          allRaids.set(raid.slug.toLowerCase(), raid);
          allRaids.set(raid.name.toLowerCase(), raid);
        }

        // Small delay between expansion requests to be nice to the API
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        logger.error(`Failed to fetch raids for expansion ${expansionId}, continuing...`);
      }
    }

    logger.info(`✅ Total raids fetched from Raider.IO: ${allRaids.size / 2} (stored by slug and name)`);

    return allRaids;
  }

  /**
   * Find matching Raider.IO raid data for a given raid name or slug
   */
  public findRaidMatch(raidMap: Map<string, RaiderIORaid>, raidName: string, raidSlug: string): RaiderIORaid | undefined {
    // Try exact slug match first
    let match = raidMap.get(raidSlug.toLowerCase());
    if (match) {
      return match;
    }

    // Try exact name match
    match = raidMap.get(raidName.toLowerCase());
    if (match) {
      return match;
    }

    // Try partial matches (in case of slight differences)
    for (const [key, raid] of raidMap.entries()) {
      if (key.includes(raidSlug.toLowerCase()) || raidSlug.toLowerCase().includes(key)) {
        logger.info(`⚠️  Partial match found: "${raidSlug}" matched with "${key}"`);
        return raid;
      }
      if (key.includes(raidName.toLowerCase()) || raidName.toLowerCase().includes(key)) {
        logger.info(`⚠️  Partial match found: "${raidName}" matched with "${key}"`);
        return raid;
      }
    }

    return undefined;
  }

  /**
   * Fetch guild raid progression from Raider.IO API
   */
  public async fetchGuildRaidProgression(region: string, realmSlug: string, guildName: string): Promise<RaiderIOGuildProfile | null> {
    const encodedName = encodeURIComponent(guildName);
    const url = `${this.apiBaseUrl}/guilds/profile?access_key=${this.apiKey}&region=${region}&realm=${realmSlug}&name=${encodedName}&fields=raid_progression`;
    const logLabel = `guilds/profile?region=${region}&realm=${realmSlug}&name=${encodedName}&fields=raid_progression`;

    logger.info(`[API REQUEST] GET ${this.apiBaseUrl}/${logLabel}`);

    const response = await this.rateLimitedFetch(url, logLabel);

    if (!response) {
      logger.warn(`Raider.IO guild profile fetch failed for ${guildName} (${region}-${realmSlug}): no response after retries`);
      return null;
    }

    if (!response.ok) {
      logger.warn(`Raider.IO guild profile request failed for ${guildName} (${region}-${realmSlug}): ${response.status} ${response.statusText}`);
      return null;
    }

    return (await response.json()) as RaiderIOGuildProfile;
  }

  /**
   * Fetch guild raid rankings from Raider.IO API
   */
  public async fetchGuildRaidRankings(region: string, realmSlug: string, guildName: string): Promise<Record<string, RaiderIORaidDifficultyRankings> | null> {
    const encodedName = encodeURIComponent(guildName);
    const url = `${this.apiBaseUrl}/guilds/profile?access_key=${this.apiKey}&region=${region}&realm=${realmSlug}&name=${encodedName}&fields=raid_rankings`;
    const logLabel = `guilds/profile?region=${region}&realm=${realmSlug}&name=${encodedName}&fields=raid_rankings`;

    logger.info(`[API REQUEST] GET ${this.apiBaseUrl}/${logLabel}`);

    const response = await this.rateLimitedFetch(url, logLabel);

    if (!response) {
      logger.warn(`Raider.IO guild rankings fetch failed for ${guildName} (${region}-${realmSlug}): no response after retries`);
      return null;
    }

    if (!response.ok) {
      logger.warn(`Raider.IO guild rankings request failed for ${guildName} (${region}-${realmSlug}): ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as RaiderIOGuildRankingsProfile;
    return data.raid_rankings ?? null;
  }

  /**
   * Fetch guild raid progression AND rankings in a single API call.
   * More efficient than two separate calls when both are needed.
   */
  public async fetchGuildProgressionAndRankings(
    region: string,
    realmSlug: string,
    guildName: string,
  ): Promise<{ progression: Record<string, RaiderIORaidTierProgress> | null; rankings: Record<string, RaiderIORaidDifficultyRankings> | null; faction: string | null }> {
    const encodedName = encodeURIComponent(guildName);
    const url = `${this.apiBaseUrl}/guilds/profile?access_key=${this.apiKey}&region=${region}&realm=${realmSlug}&name=${encodedName}&fields=raid_progression,raid_rankings`;
    const logLabel = `guilds/profile?region=${region}&realm=${realmSlug}&name=${encodedName}&fields=raid_progression,raid_rankings`;

    logger.info(`[API REQUEST] GET ${this.apiBaseUrl}/${logLabel}`);

    const response = await this.rateLimitedFetch(url, logLabel);

    if (!response) {
      logger.warn(`Raider.IO combined fetch failed for ${guildName} (${region}-${realmSlug}): no response after retries`);
      return { progression: null, rankings: null, faction: null };
    }

    if (!response.ok) {
      logger.warn(`Raider.IO combined request failed for ${guildName} (${region}-${realmSlug}): ${response.status} ${response.statusText}`);
      return { progression: null, rankings: null, faction: null };
    }

    const data = (await response.json()) as RaiderIOGuildProfile & { raid_rankings?: Record<string, RaiderIORaidDifficultyRankings> };
    return {
      progression: data.raid_progression ?? null,
      rankings: data.raid_rankings ?? null,
      faction: data.faction ?? null,
    };
  }
}

export default new RaiderIOApiClient();
