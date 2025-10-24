import fetch from "node-fetch";
import { Achievement, BossIcon, RaidIcon, AuthToken, AchievementUpdateLog } from "../models/Achievement";
import iconCacheService from "./icon-cache.service";

interface BlizzardTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  sub: string;
}

interface BlizzardAchievementIndex {
  _links: {
    self: {
      href: string;
    };
  };
  achievements: Array<{
    key: {
      href: string;
    };
    name: string;
    id: number;
  }>;
}

interface BlizzardAchievementMedia {
  _links: {
    self: {
      href: string;
    };
  };
  assets: Array<{
    key: string;
    value: string;
    file_data_id: number;
  }>;
  id: number;
}

export class BlizzardApiClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly oauthUrl = "https://oauth.battle.net/token";
  private readonly apiBaseUrl = "https://us.api.blizzard.com";
  private readonly namespace = "static-us";
  private readonly locale = "en_US";

  // In-memory cache for ongoing requests to prevent duplicates
  private readonly pendingBossIconRequests = new Map<string, Promise<string | null>>();
  private readonly pendingRaidIconRequests = new Map<string, Promise<string | null>>();

  constructor() {
    this.clientId = process.env.BLIZZARD_CLIENT_ID!;
    this.clientSecret = process.env.BLIZZARD_CLIENT_SECRET!;

    if (!this.clientId || !this.clientSecret) {
      throw new Error("Blizzard API credentials not found in environment variables");
    }
  }

  /**
   * Get a valid access token, fetching a new one if necessary
   */
  private async getAccessToken(): Promise<string> {
    try {
      // Check if we have a valid token in the database
      const existingToken = await AuthToken.findOne({ service: "blizzard" });

      if (existingToken && existingToken.expiresAt > new Date()) {
        return existingToken.accessToken;
      }

      // Fetch a new token
      console.log("Fetching new Blizzard OAuth token...");

      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

      const response = await fetch(this.oauthUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Blizzard token: ${response.statusText}`);
      }

      const data = (await response.json()) as BlizzardTokenResponse;
      const { access_token, token_type, expires_in } = data;

      // Calculate expiration time (subtract 60 seconds for safety buffer)
      const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000);

      // Store in database (upsert to replace existing token)
      await AuthToken.findOneAndUpdate(
        { service: "blizzard" },
        {
          service: "blizzard",
          accessToken: access_token,
          tokenType: token_type,
          expiresAt,
        },
        { upsert: true, new: true }
      );

      console.log(`✅ New Blizzard token acquired, expires at: ${expiresAt.toISOString()}`);
      return access_token;
    } catch (error: any) {
      console.error("Error fetching Blizzard access token:", error.message);
      throw new Error("Failed to obtain Blizzard API access token");
    }
  }

  /**
   * Make an authenticated API call to Blizzard with exponential backoff retry
   */
  private async makeAuthenticatedRequest<T>(url: string, retryCount = 0, maxRetries = 25): Promise<T> {
    const token = await this.getAccessToken();

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        if (retryCount >= maxRetries) {
          throw new Error(`Max retries (${maxRetries}) reached for rate limited request`);
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Rate limited (429). Retrying in ${waitTime / 1000}s... (attempt ${retryCount + 1}/${maxRetries})`);

        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.makeAuthenticatedRequest<T>(url, retryCount + 1, maxRetries);
      }

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error: any) {
      // If it's a retry error, throw it directly
      if (error.message.includes("Max retries")) {
        throw error;
      }
      console.error(`Error making authenticated request to ${url}:`, error.message);
      throw new Error(`Blizzard API request failed: ${error.message}`);
    }
  }

  /**
   * Fetch all achievements from Blizzard API and store them
   */
  public async updateAchievements(): Promise<void> {
    try {
      console.log("📋 Fetching achievements from Blizzard API...");
      const url = `${this.apiBaseUrl}/data/wow/achievement/index?namespace=${this.namespace}&locale=${this.locale}`;
      const achievementIndex = await this.makeAuthenticatedRequest<BlizzardAchievementIndex>(url);

      console.log(`📋 Found ${achievementIndex.achievements.length} achievements to process`);

      // Use bulk operations for better performance
      const bulkOps = achievementIndex.achievements.map((achievement) => ({
        updateOne: {
          filter: { id: achievement.id },
          update: {
            $set: {
              id: achievement.id,
              name: achievement.name,
              href: achievement.key.href,
              lastUpdated: new Date(),
            },
          },
          upsert: true,
        },
      }));

      if (bulkOps.length > 0) {
        await Achievement.bulkWrite(bulkOps);
        console.log(`✅ Successfully updated ${bulkOps.length} achievements`);
      }

      // Update the log
      await AchievementUpdateLog.findOneAndUpdate(
        {},
        {
          lastFullUpdate: new Date(),
          $inc: { attemptCount: 1 },
        },
        { upsert: true }
      );

      console.log("✅ Achievement update completed successfully");
    } catch (error: any) {
      console.error("Error updating achievements:", error.message);
      throw new Error(`Failed to update achievements: ${error.message}`);
    }
  }

  /**
   * Find achievement by partial boss name match
   */
  public async findAchievementByBossName(bossName: string): Promise<{ id: number; name: string } | null> {
    try {
      // First, try exact match patterns for mythic achievements
      const mythicPattern = `Mythic: ${bossName}`;
      let achievement = await Achievement.findOne({
        name: { $regex: new RegExp(`^${mythicPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      });

      if (achievement) {
        return { id: achievement.id, name: achievement.name };
      }

      // Try partial matching with the boss name
      const escapedBossName = bossName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      achievement = await Achievement.findOne({
        name: { $regex: new RegExp(escapedBossName, "i") },
      });

      if (achievement) {
        return { id: achievement.id, name: achievement.name };
      }

      // Try fuzzy matching with alternative boss name formats
      // Some achievements only use the first part of the boss name before a comma
      // Example: "Rashok, the Elder" -> "Mythic: Rashok"
      if (bossName.includes(",")) {
        const firstPart = bossName.split(",")[0].trim();
        const mythicFirstPart = `Mythic: ${firstPart}`;
        const escapedFirstPart = firstPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        achievement = await Achievement.findOne({
          name: { $regex: new RegExp(`^${mythicFirstPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        });

        if (achievement) {
          console.log(`✅ Found achievement using first part before comma: "${bossName}" -> "${achievement.name}"`);
          return { id: achievement.id, name: achievement.name };
        }

        achievement = await Achievement.findOne({
          name: { $regex: new RegExp(escapedFirstPart, "i") },
        });

        if (achievement) {
          console.log(`✅ Found achievement using first part before comma: "${bossName}" -> "${achievement.name}"`);
          return { id: achievement.id, name: achievement.name };
        }
      }

      // Try using just the first word of the boss name
      // Example: "Igira the Cruel" -> "Mythic: Igira"
      const firstWord = bossName.split(" ")[0].trim();
      if (firstWord && firstWord.length > 3) {
        // Only try if first word is substantial
        const mythicFirstWord = `Mythic: ${firstWord}`;
        const escapedFirstWord = firstWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        achievement = await Achievement.findOne({
          name: { $regex: new RegExp(`^${mythicFirstWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        });

        if (achievement) {
          console.log(`✅ Found achievement using first word: "${bossName}" -> "${achievement.name}"`);
          return { id: achievement.id, name: achievement.name };
        }

        achievement = await Achievement.findOne({
          name: { $regex: new RegExp(escapedFirstWord, "i") },
        });

        if (achievement) {
          console.log(`✅ Found achievement using first word: "${bossName}" -> "${achievement.name}"`);
          return { id: achievement.id, name: achievement.name };
        }
      }

      console.log(`⚠️  No achievement found for boss: "${bossName}"`);
      return null;
    } catch (error: any) {
      console.error(`Error finding achievement for boss "${bossName}":`, error.message);
      return null;
    }
  }

  /**
   * Find achievement by raid name match (looks for raid achievements)
   */
  public async findAchievementByRaidName(raidName: string): Promise<{ id: number; name: string } | null> {
    try {
      // Try to find achievement that contains the raid name
      // Raid achievements typically have the raid name in them
      const escapedRaidName = raidName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // First try exact match
      let achievement = await Achievement.findOne({
        name: { $regex: new RegExp(`^${escapedRaidName}$`, "i") },
      });

      if (achievement) {
        return { id: achievement.id, name: achievement.name };
      }

      // Try partial match
      achievement = await Achievement.findOne({
        name: { $regex: new RegExp(escapedRaidName, "i") },
      });

      if (achievement) {
        return { id: achievement.id, name: achievement.name };
      }

      // Try fuzzy matching with "first word + raider" pattern
      // Example: "Hellfire Citadel" -> "Hellfire Raider"
      const firstWord = raidName.split(" ")[0].trim();
      if (firstWord && firstWord.length > 3) {
        // Only try if first word is substantial
        const raiderPattern = `${firstWord} Raider`;
        const escapedRaiderPattern = raiderPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        achievement = await Achievement.findOne({
          name: { $regex: new RegExp(`^${escapedRaiderPattern}$`, "i") },
        });

        if (achievement) {
          console.log(`✅ Found achievement using raider pattern: "${raidName}" -> "${achievement.name}"`);
          return { id: achievement.id, name: achievement.name };
        }

        achievement = await Achievement.findOne({
          name: { $regex: new RegExp(escapedRaiderPattern, "i") },
        });

        if (achievement) {
          console.log(`✅ Found achievement using raider pattern: "${raidName}" -> "${achievement.name}"`);
          return { id: achievement.id, name: achievement.name };
        }
      }

      console.log(`⚠️  No achievement found for raid: "${raidName}"`);
      return null;
    } catch (error: any) {
      console.error(`Error finding achievement for raid "${raidName}":`, error.message);
      return null;
    }
  }

  /**
   * Fetch achievement media (icon) by achievement ID
   */
  public async getAchievementMedia(achievementId: number): Promise<string | null> {
    try {
      const url = `${this.apiBaseUrl}/data/wow/media/achievement/${achievementId}?namespace=${this.namespace}&locale=${this.locale}`;
      const media = await this.makeAuthenticatedRequest<BlizzardAchievementMedia>(url);

      const iconAsset = media.assets.find((asset) => asset.key === "icon");
      if (!iconAsset) {
        console.log(`⚠️  No icon found for achievement ${achievementId}`);
        return null;
      }

      return iconAsset.value;
    } catch (error: any) {
      console.error(`Error fetching media for achievement ${achievementId}:`, error.message);
      return null;
    }
  }

  /**
   * Get boss icon URL by boss name (main entry point)
   */
  public async getBossIconUrl(bossName: string): Promise<string | null> {
    // Check if there's already a pending request for this boss name
    if (this.pendingBossIconRequests.has(bossName)) {
      console.log(`⏳ Waiting for existing request for boss: ${bossName}`);
      return this.pendingBossIconRequests.get(bossName)!;
    }

    // Create a new promise for this boss name
    const promise = this._fetchBossIconUrl(bossName);
    this.pendingBossIconRequests.set(bossName, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      // Clean up the pending request when done
      this.pendingBossIconRequests.delete(bossName);
    }
  }

  /**
   * Internal method to actually fetch the boss icon URL
   */
  private async _fetchBossIconUrl(bossName: string): Promise<string | null> {
    try {
      // Check if we already have the icon cached
      const cachedIcon = await BossIcon.findOne({ bossName });
      if (cachedIcon) {
        console.log(`✅ Found cached icon for boss: ${bossName}`);
        return cachedIcon.iconUrl;
      }

      // Find the achievement for this boss
      const achievement = await this.findAchievementByBossName(bossName);
      if (!achievement) {
        return null;
      }

      // Get the icon from the achievement media (Blizzard URL)
      const blizzardIconUrl = await this.getAchievementMedia(achievement.id);
      if (!blizzardIconUrl) {
        return null;
      }

      // Download and cache the icon locally (returns filename only)
      const iconFilename = await iconCacheService.downloadAndCacheIcon(blizzardIconUrl);

      // Cache the result using upsert to avoid race conditions
      await BossIcon.findOneAndUpdate(
        { bossName },
        {
          bossName,
          blizzardIconUrl,
          iconUrl: iconFilename, // Store just the filename
          achievementId: achievement.id,
          lastUpdated: new Date(),
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Cached new icon for boss: ${bossName} -> ${iconFilename}`);
      return iconFilename;
    } catch (error: any) {
      console.error(`Error getting boss icon for "${bossName}":`, error.message);
      return null;
    }
  }

  /**
   * Get raid icon URL by raid name (main entry point)
   */
  public async getRaidIconUrl(raidName: string): Promise<string | null> {
    // Check if there's already a pending request for this raid name
    if (this.pendingRaidIconRequests.has(raidName)) {
      console.log(`⏳ Waiting for existing request for raid: ${raidName}`);
      return this.pendingRaidIconRequests.get(raidName)!;
    }

    // Create a new promise for this raid name
    const promise = this._fetchRaidIconUrl(raidName);
    this.pendingRaidIconRequests.set(raidName, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      // Clean up the pending request when done
      this.pendingRaidIconRequests.delete(raidName);
    }
  }

  /**
   * Internal method to actually fetch the raid icon URL
   */
  private async _fetchRaidIconUrl(raidName: string): Promise<string | null> {
    try {
      // Check if we already have the icon cached
      const cachedIcon = await RaidIcon.findOne({ raidName });
      if (cachedIcon) {
        console.log(`✅ Found cached icon for raid: ${raidName}`);
        return cachedIcon.iconUrl;
      }

      // Find the achievement for this raid
      const achievement = await this.findAchievementByRaidName(raidName);
      if (!achievement) {
        return null;
      }

      // Get the icon from the achievement media (Blizzard URL)
      const blizzardIconUrl = await this.getAchievementMedia(achievement.id);
      if (!blizzardIconUrl) {
        return null;
      }

      // Download and cache the icon locally (returns filename only)
      const iconFilename = await iconCacheService.downloadAndCacheIcon(blizzardIconUrl);

      // Cache the result using upsert to avoid race conditions
      await RaidIcon.findOneAndUpdate(
        { raidName },
        {
          raidName,
          blizzardIconUrl,
          iconUrl: iconFilename, // Store just the filename
          achievementId: achievement.id,
          lastUpdated: new Date(),
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Cached new icon for raid: ${raidName} -> ${iconFilename}`);
      return iconFilename;
    } catch (error: any) {
      console.error(`Error getting raid icon for "${raidName}":`, error.message);
      return null;
    }
  }

  /**
   * Batch fetch boss icons for multiple boss names (deduplicates automatically)
   * Processes sequentially with small delays to avoid rate limiting
   */
  public async getBossIconUrls(bossNames: string[]): Promise<Map<string, string | null>> {
    // Deduplicate boss names
    const uniqueBossNames = [...new Set(bossNames)];

    if (uniqueBossNames.length < bossNames.length) {
      console.log(`🔄 Deduplicated ${bossNames.length} boss names to ${uniqueBossNames.length} unique names`);
    }

    const results = new Map<string, string | null>();

    // Process sequentially with small delays to avoid rate limiting
    for (let i = 0; i < uniqueBossNames.length; i++) {
      const bossName = uniqueBossNames[i];
      const iconUrl = await this.getBossIconUrl(bossName);
      results.set(bossName, iconUrl);

      // Add a small delay between requests (except for the last one)
      if (i < uniqueBossNames.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
      }
    }

    return results;
  }

  /**
   * Batch fetch raid icons for multiple raid names (deduplicates automatically)
   * Processes sequentially with small delays to avoid rate limiting
   */
  public async getRaidIconUrls(raidNames: string[]): Promise<Map<string, string | null>> {
    // Deduplicate raid names
    const uniqueRaidNames = [...new Set(raidNames)];

    if (uniqueRaidNames.length < raidNames.length) {
      console.log(`🔄 Deduplicated ${raidNames.length} raid names to ${uniqueRaidNames.length} unique names`);
    }

    const results = new Map<string, string | null>();

    // Process sequentially with small delays to avoid rate limiting
    for (let i = 0; i < uniqueRaidNames.length; i++) {
      const raidName = uniqueRaidNames[i];
      const iconUrl = await this.getRaidIconUrl(raidName);
      results.set(raidName, iconUrl);

      // Add a small delay between requests (except for the last one)
      if (i < uniqueRaidNames.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
      }
    }

    return results;
  }

  /**
   * Initialize achievements if none exist
   */
  public async initializeIfNeeded(): Promise<void> {
    try {
      const count = await Achievement.countDocuments();
      if (count === 0) {
        console.log("🚀 No achievements found, performing initial fetch...");
        await this.updateAchievements();
      } else {
        console.log(`✅ Found ${count} achievements in database`);
      }
    } catch (error: any) {
      console.error("Error during Blizzard API initialization:", error.message);
      // Don't throw here, as this is initialization and shouldn't block startup
    }
  }
}

export default new BlizzardApiClient();
