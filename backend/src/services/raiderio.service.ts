import fetch from "node-fetch";
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

export class RaiderIOApiClient {
  private readonly apiKey: string;
  private readonly apiBaseUrl = "https://raider.io/api/v1";

  // Expansion IDs we want to fetch
  private readonly expansionIds = [10, 9, 8, 7, 6]; // TWW, DF, SL, BfA, Legion

  constructor() {
    this.apiKey = process.env.RAIDER_IO_API_KEY!;

    if (!this.apiKey) {
      throw new Error("Raider.IO API key not found in environment variables");
    }
  }

  /**
   * Fetch raid static data for a specific expansion
   */
  private async fetchExpansionRaids(expansionId: number): Promise<RaiderIORaid[]> {
    try {
      const url = `${this.apiBaseUrl}/raiding/static-data?access_key=${this.apiKey}&expansion_id=${expansionId}`;

      logger.info(`📅 Fetching raid dates for expansion ${expansionId}...`);
      logger.info(`[API REQUEST] GET ${this.apiBaseUrl}/raiding/static-data?expansion_id=${expansionId}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as RaiderIOStaticDataResponse;

      logger.info(`✅ Found ${data.raids.length} raids for expansion ${expansionId}`);

      return data.raids;
    } catch (error: any) {
      logger.error(`Error fetching Raider.IO data for expansion ${expansionId}:`, error.message);
      throw new Error(`Raider.IO API request failed: ${error.message}`);
    }
  }

  /**
   * Fetch raid dates for all tracked expansions
   * Returns a Map with raid slug/name as key and raid data as value
   */
  public async fetchAllRaidDates(): Promise<Map<string, RaiderIORaid>> {
    logger.info("📅 Fetching raid dates from Raider.IO...");

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
}

export default new RaiderIOApiClient();
