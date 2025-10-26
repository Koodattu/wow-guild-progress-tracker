import Guild, { IGuild, IRaidProgress, IBossProgress } from "../models/Guild";
import Event from "../models/Event";
import Raid, { IRaid } from "../models/Raid";
import Report from "../models/Report";
import Fight from "../models/Fight";
import wclService from "./warcraftlogs.service";
import blizzardService from "./blizzard.service";
import raiderIOService from "./raiderio.service";
import { GUILDS, TRACKED_RAIDS, CURRENT_RAID_ID, DIFFICULTIES } from "../config/guilds";
import mongoose from "mongoose";

class GuildService {
  // Sync raid information from WarcraftLogs to database
  async syncRaidsFromWCL(): Promise<void> {
    console.log("Syncing raid data from WarcraftLogs...");

    try {
      // Check if we have any raids in the database
      const existingRaidCount = await Raid.countDocuments();
      console.log(`Found ${existingRaidCount} raids in database`);

      // If we have existing raids, check if all tracked raids are present
      let needsFullFetch = existingRaidCount === 0;

      if (!needsFullFetch) {
        // Check if all TRACKED_RAIDS exist in our database
        const existingTrackedRaids = await Raid.find({
          id: { $in: TRACKED_RAIDS },
        }).select("id");

        const existingTrackedIds = new Set(existingTrackedRaids.map((r) => r.id));
        const missingRaidIds = TRACKED_RAIDS.filter((id) => !existingTrackedIds.has(id));

        if (missingRaidIds.length > 0) {
          console.log(`Missing tracked raid IDs in database: ${missingRaidIds.join(", ")}`);
          console.log("Triggering full zone refetch...");
          needsFullFetch = true;
        } else {
          console.log("All tracked raids already exist in database, skipping zone fetch");
          return;
        }
      } else {
        console.log("Database is empty, fetching all zones for initial setup");
      }

      // Only fetch zones if needed (first time or missing tracked raids)
      if (needsFullFetch) {
        // Fetch achievements from Blizzard API (same trigger as zones)
        console.log("Fetching achievements from Blizzard API...");
        await blizzardService.updateAchievements();

        // Fetch all zones from WarcraftLogs
        const result = await wclService.getZones();
        const zones = result.worldData?.zones;

        if (!zones || zones.length === 0) {
          console.warn("No zones data returned from WarcraftLogs");
          return;
        }

        console.log(`Found ${zones.length} zones from WarcraftLogs`);

        // Collect all raid and boss names for batch icon fetching
        const allRaidNames: string[] = [];
        const allBossNames: string[] = [];
        const zoneDataCache = new Map<number, any>(); // Cache zone data to avoid refetching

        // Sync all zones to database
        for (const zone of zones) {
          try {
            // Get detailed zone info with encounters
            const detailResult = await wclService.getZone(zone.id);
            const zoneData = detailResult.worldData?.zone;

            if (!zoneData) {
              console.warn(`No detailed data found for zone ${zone.id} (${zone.name})`);
              continue;
            }

            console.log(`Zone ${zone.id} data:`, JSON.stringify(zoneData, null, 2));

            // Check if encounters exist
            if (!zoneData.encounters || zoneData.encounters.length === 0) {
              console.warn(`Zone ${zone.id} (${zoneData.name}) has no encounters, skipping...`);
              continue;
            }

            // Cache the zone data for later use
            zoneDataCache.set(zone.id, zoneData);

            // Get expansion name from the zone data
            const expansionName = zoneData.expansion?.name || "Unknown";

            // Convert encounters to bosses format
            const bosses = (zoneData.encounters || []).map((enc: any) => ({
              id: enc.id,
              name: enc.name,
              slug: enc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            }));

            // Collect names for batch fetching
            allRaidNames.push(zoneData.name);
            const bossNames = bosses.map((b: any) => b.name);
            allBossNames.push(...bossNames);

            console.log(`Syncing zone ${zone.id} (${expansionName}) with ${bosses.length} encounters`);

            // Update or create raid in database (without icons first)
            await Raid.findOneAndUpdate(
              { id: zone.id },
              {
                $set: {
                  name: zoneData.name,
                  slug: zoneData.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                  expansion: expansionName,
                  bosses,
                },
                $setOnInsert: {
                  id: zone.id,
                },
              },
              { upsert: true, new: true }
            );

            console.log(`Synced raid: ${zoneData.name} (${expansionName}, ${bosses.length} bosses)`);
          } catch (error) {
            console.error(`Error syncing zone ${zone.id}:`, error);
          }
        }

        // Batch fetch all raid and boss icons from Blizzard
        console.log("Fetching raid and boss icons from Blizzard API...");
        const raidIconMap = await blizzardService.getRaidIconUrls(allRaidNames);
        const bossIconMap = await blizzardService.getBossIconUrls(allBossNames);

        // Fetch raid dates from Raider.IO
        console.log("Fetching raid start/end dates from Raider.IO API...");
        const raidDatesMap = await raiderIOService.fetchAllRaidDates();

        // Update raids with icons and dates using cached zone data
        console.log("Updating raids with icon URLs and start/end dates...");
        for (const [zoneId, zoneData] of zoneDataCache.entries()) {
          try {
            // Get raid icon
            const raidIconUrl = raidIconMap.get(zoneData.name) || undefined;

            // Get boss icons from the cached zone data
            const bossesWithIcons = (zoneData.encounters || []).map((enc: any) => ({
              id: enc.id,
              name: enc.name,
              slug: enc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              iconUrl: bossIconMap.get(enc.name) || undefined,
            }));

            // Find matching Raider.IO data
            const raidSlug = zoneData.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            const raiderIOMatch = raiderIOService.findRaidMatch(raidDatesMap, zoneData.name, raidSlug);

            // Prepare update object with icons
            const updateData: any = {
              iconUrl: raidIconUrl,
              bosses: bossesWithIcons,
            };

            // Add start/end dates if we found a match
            if (raiderIOMatch) {
              console.log(`✅ Found Raider.IO dates for: ${zoneData.name}`);

              // Convert string dates to Date objects
              updateData.starts = {
                us: raiderIOMatch.starts.us ? new Date(raiderIOMatch.starts.us) : undefined,
                eu: raiderIOMatch.starts.eu ? new Date(raiderIOMatch.starts.eu) : undefined,
                tw: raiderIOMatch.starts.tw ? new Date(raiderIOMatch.starts.tw) : undefined,
                kr: raiderIOMatch.starts.kr ? new Date(raiderIOMatch.starts.kr) : undefined,
                cn: raiderIOMatch.starts.cn ? new Date(raiderIOMatch.starts.cn) : undefined,
              };

              updateData.ends = {
                us: raiderIOMatch.ends.us ? new Date(raiderIOMatch.ends.us) : undefined,
                eu: raiderIOMatch.ends.eu ? new Date(raiderIOMatch.ends.eu) : undefined,
                tw: raiderIOMatch.ends.tw ? new Date(raiderIOMatch.ends.tw) : undefined,
                kr: raiderIOMatch.ends.kr ? new Date(raiderIOMatch.ends.kr) : undefined,
                cn: raiderIOMatch.ends.cn ? new Date(raiderIOMatch.ends.cn) : undefined,
              };
            } else {
              console.log(`⚠️  No Raider.IO dates found for: ${zoneData.name}`);
            }

            // Update raid with icons and dates
            await Raid.findOneAndUpdate(
              { id: zoneId },
              {
                $set: updateData,
              }
            );

            console.log(`Updated raid: ${zoneData.name} (icon: ${raidIconUrl ? "✅" : "❌"}, dates: ${raiderIOMatch ? "✅" : "❌"})`);
          } catch (error) {
            console.error(`Error updating raid data for zone ${zoneId}:`, error);
          }
        }

        console.log("Raid sync completed");
      }
    } catch (error) {
      console.error("Error syncing raids from WarcraftLogs:", error);
    }
  }

  // Get raid data from database
  async getRaidData(zoneId: number): Promise<IRaid | null> {
    return await Raid.findOne({ id: zoneId });
  }

  // Get all valid boss encounter IDs from tracked raids
  // This is used to filter out dungeon bosses and other non-raid content
  private async getValidBossEncounterIds(): Promise<Set<number>> {
    const validBossIds = new Set<number>();

    for (const raidId of TRACKED_RAIDS) {
      const raid = await this.getRaidData(raidId);
      if (raid && raid.bosses) {
        for (const boss of raid.bosses) {
          validBossIds.add(boss.id);
        }
      }
    }

    console.log(`Loaded ${validBossIds.size} valid boss encounter IDs from ${TRACKED_RAIDS.length} tracked raids`);
    return validBossIds;
  }

  // Get valid boss encounter IDs for a specific raid
  private async getValidBossEncounterIdsForRaid(raidId: number): Promise<Set<number>> {
    const validBossIds = new Set<number>();

    const raid = await this.getRaidData(raidId);
    if (raid && raid.bosses) {
      for (const boss of raid.bosses) {
        validBossIds.add(boss.id);
      }
    }

    return validBossIds;
  }

  // Check if a fight is a duplicate based on unique characteristics
  // A fight is considered duplicate if it has the same:
  // - encounterID
  // - difficulty
  // - bossPercentage
  // - fightPercentage
  // - duration
  // This indicates the same log uploaded multiple times
  // Returns the canonical fight (first occurrence by timestamp) if this is a duplicate
  private isDuplicateFightInMemory(fight: any, allFights: any[], seenFights: Map<string, any>): { isDuplicate: boolean; canonical?: any } {
    // Create a unique key based on fight characteristics
    const key = `${fight.encounterID}-${fight.difficulty}-${fight.bossPercentage}-${fight.fightPercentage}-${fight.duration}`;

    if (seenFights.has(key)) {
      // This is a duplicate
      return { isDuplicate: true, canonical: seenFights.get(key) };
    }

    // First occurrence - mark it as seen
    seenFights.set(key, fight);
    return { isDuplicate: false };
  }

  // Initialize all guilds from config
  async initializeGuilds(): Promise<void> {
    console.log("Initializing guilds from config...");

    for (const guildConfig of GUILDS) {
      const existing = await Guild.findOne({
        name: guildConfig.name,
        realm: guildConfig.realm,
        region: guildConfig.region,
      });

      if (!existing) {
        await Guild.create({
          name: guildConfig.name,
          realm: guildConfig.realm,
          region: guildConfig.region,
          progress: [],
        });
        console.log(`Created guild: ${guildConfig.name} - ${guildConfig.realm}`);
      }
    }
  }

  // Fetch and update a single guild's progress
  async updateGuildProgress(guildId: string): Promise<IGuild | null> {
    const guild = await Guild.findById(guildId);
    if (!guild) {
      console.error(`Guild not found: ${guildId}`);
      return null;
    }

    console.log(`Updating guild: ${guild.name} - ${guild.realm}`);

    try {
      // Determine if this is an initial fetch by checking if guild has any reports at all
      const hasAnyReports = await Report.exists({ guildId: guild._id });
      const isInitialFetch = !hasAnyReports;

      // Fetch reports and process - scope depends on whether initial or update
      const hasNewData = await this.fetchAndProcessReports(guild, isInitialFetch);

      // Update raiding status based on ongoing reports
      await this.updateRaidingStatus(guild);

      guild.lastFetched = new Date();

      // Log what we're about to save
      console.log(`[${guild.name}] RIGHT BEFORE SAVE - progress data:`);
      for (const progress of guild.progress) {
        console.log(`  - ${progress.raidName} (${progress.difficulty}): ${progress.bossesDefeated}/${progress.totalBosses} bosses, ${progress.bosses.length} bosses in array`);
        if (progress.bosses.length > 0) {
          console.log(
            `    First 3 bosses: ${progress.bosses
              .slice(0, 3)
              .map((b) => b.bossName)
              .join(", ")}`
          );
        }
      }

      await guild.save();

      // Log the saved progress data
      console.log(`[${guild.name}] AFTER SAVE - progress data:`);
      for (const progress of guild.progress) {
        console.log(`  - ${progress.raidName} (${progress.difficulty}): ${progress.bossesDefeated}/${progress.totalBosses} bosses, ${progress.bosses.length} bosses in array`);
      }

      // Update world rankings only if there was new data and only for current raid
      if (hasNewData && isInitialFetch) {
        // Initial fetch: update ranks for all raids with progress, then calculate guild rankings
        await this.updateGuildWorldRankings(guildId);
        await this.calculateGuildRankingsForAllRaids();
      } else if (hasNewData && !isInitialFetch) {
        // Update: only update rank for current raid if not completed
        await this.updateCurrentRaidWorldRanking(guildId);
        await this.calculateGuildRankingsForRaid(CURRENT_RAID_ID);
      }

      console.log(`Successfully updated: ${guild.name}`);
      return guild;
    } catch (error) {
      console.error(`Error updating guild ${guild.name}:`, error);
      return null;
    }
  }

  // Fetch and log guild zone rankings for debugging
  async fetchGuildZoneRankings(guildId: string, zoneId?: number): Promise<void> {
    const guild = await Guild.findById(guildId);
    if (!guild) {
      console.error(`Guild not found: ${guildId}`);
      return;
    }

    console.log(`\n========== FETCHING ZONE RANKINGS FOR ${guild.name} ==========`);

    // If no zoneId specified, use the current raid
    const targetZoneId = zoneId || CURRENT_RAID_ID;

    try {
      // Get raid info
      const raid = await this.getRaidData(targetZoneId);
      if (!raid) {
        console.error(`Raid not found for zone ID: ${targetZoneId}`);
        return;
      }

      console.log(`Raid: ${raid.name} (Zone ID: ${targetZoneId})`);
      console.log(`Bosses: ${raid.bosses?.length || 0}\n`);

      try {
        const result = await wclService.getGuildZoneRanking(guild.name, guild.realm.toLowerCase().replace(/\s+/g, "-"), guild.region.toLowerCase(), targetZoneId);

        // Debug: Log the entire result structure
        console.log(`Full API Response:`);
        console.log(JSON.stringify(result, null, 2));

        // Access the ranking data
        const zoneRanking = result.guildData?.guild?.zoneRanking;

        if (zoneRanking?.progress?.worldRank) {
          const worldRank = zoneRanking.progress.worldRank;
          console.log(`\n✅ World Progress Rank: #${worldRank.number} (${worldRank.color})`);
        } else {
          console.log(`\n⚠️  No world rank data found`);
        }
      } catch (error) {
        console.error(`Error fetching rankings:`, error);
      }

      console.log(`\n========== END ZONE RANKINGS FOR ${guild.name} ==========\n`);
    } catch (error) {
      console.error(`Error in fetchGuildZoneRankings:`, error);
    }
  }

  // Update world rankings for all raids the guild has progress in
  async updateGuildWorldRankings(guildId: string): Promise<void> {
    const guild = await Guild.findById(guildId);
    if (!guild) {
      console.error(`Guild not found: ${guildId}`);
      return;
    }

    console.log(`[${guild.name}] Updating world rankings...`);

    // Only update rankings for raids where the guild has made progress
    const raidsWithProgress = guild.progress.filter((p) => p.bossesDefeated > 0);

    if (raidsWithProgress.length === 0) {
      console.log(`[${guild.name}] No raids with progress, skipping world rank update`);
      return;
    }

    for (const raidProgress of raidsWithProgress) {
      try {
        console.log(`[${guild.name}] Fetching world rank for ${raidProgress.raidName}...`);

        const result = await wclService.getGuildZoneRanking(guild.name, guild.realm.toLowerCase().replace(/\s+/g, "-"), guild.region.toLowerCase(), raidProgress.raidId);

        const worldRank = result.guildData?.guild?.zoneRanking?.progress?.worldRank;

        if (worldRank?.number) {
          // Update the world rank in the guild's progress
          raidProgress.worldRank = worldRank.number;
          raidProgress.worldRankColor = worldRank.color;
          console.log(`[${guild.name}] ${raidProgress.raidName}: World Rank #${worldRank.number} (${worldRank.color})`);
        } else {
          console.log(`[${guild.name}] ${raidProgress.raidName}: No world rank data available`);
        }
      } catch (error) {
        console.error(`[${guild.name}] Error fetching world rank for ${raidProgress.raidName}:`, error);
      }
    }

    // Save the updated guild with world rankings
    await guild.save();
    console.log(`[${guild.name}] World rankings updated and saved`);
  }

  // Update world ranking for only the current raid
  // Skip if guild has completed the current raid (all mythic bosses defeated)
  async updateCurrentRaidWorldRanking(guildId: string): Promise<void> {
    const guild = await Guild.findById(guildId);
    if (!guild) {
      console.error(`Guild not found: ${guildId}`);
      return;
    }

    // Find the current raid data to get total boss count
    const currentRaidData = await this.getRaidData(CURRENT_RAID_ID);
    if (!currentRaidData) {
      console.warn(`[${guild.name}] Current raid data not found (ID: ${CURRENT_RAID_ID}), skipping world rank update`);
      return;
    }

    // Find mythic progress for current raid
    const mythicProgress = guild.progress.find((p) => p.raidId === CURRENT_RAID_ID && p.difficulty === "mythic");

    if (!mythicProgress) {
      console.log(`[${guild.name}] No mythic progress for current raid, skipping world rank update`);
      return;
    }

    // Check if guild has completed all mythic bosses
    const hasCompletedMythic = mythicProgress.bossesDefeated >= currentRaidData.bosses.length;

    if (hasCompletedMythic) {
      console.log(`[${guild.name}] Has completed current raid mythic (${mythicProgress.bossesDefeated}/${currentRaidData.bosses.length}), world rank is final - skipping update`);
      return;
    }

    console.log(`[${guild.name}] Updating world rank for current raid only (${mythicProgress.raidName})...`);

    try {
      const result = await wclService.getGuildZoneRanking(guild.name, guild.realm.toLowerCase().replace(/\s+/g, "-"), guild.region.toLowerCase(), CURRENT_RAID_ID);

      const worldRank = result.guildData?.guild?.zoneRanking?.progress?.worldRank;

      if (worldRank?.number) {
        // Update the world rank in mythic progress
        mythicProgress.worldRank = worldRank.number;
        mythicProgress.worldRankColor = worldRank.color;
        console.log(`[${guild.name}] ${mythicProgress.raidName}: World Rank #${worldRank.number} (${worldRank.color})`);

        // Save the updated guild
        await guild.save();
        console.log(`[${guild.name}] Current raid world rank updated`);
      } else {
        console.log(`[${guild.name}] ${mythicProgress.raidName}: No world rank data available`);
      }
    } catch (error) {
      console.error(`[${guild.name}] Error fetching world rank for current raid:`, error);
    }
  }

  // Calculate guild rankings for all tracked raids
  async calculateGuildRankingsForAllRaids(): Promise<void> {
    console.log("Calculating guild rankings for all tracked raids...");

    for (const raidId of TRACKED_RAIDS) {
      await this.calculateGuildRankingsForRaid(raidId);
    }

    console.log("Guild rankings calculation complete for all raids");
  }

  // Calculate guild rankings for a specific raid
  // Rankings are calculated per difficulty (mythic and heroic separately)
  async calculateGuildRankingsForRaid(raidId: number): Promise<void> {
    console.log(`Calculating guild rankings for raid ${raidId}...`);

    // Get all guilds
    const guilds = await Guild.find();

    if (guilds.length === 0) {
      console.log("No guilds found, skipping ranking calculation");
      return;
    }

    // Calculate rankings for both difficulties
    for (const difficulty of ["mythic", "heroic"] as const) {
      // Collect all guild progress for this raid and difficulty
      const guildProgressPairs = guilds
        .map((guild) => {
          const progress = guild.progress.find((p) => p.raidId === raidId && p.difficulty === difficulty);
          if (progress && progress.bossesDefeated > 0) {
            // Only include guilds with at least 1 boss kill
            return { guild, progress };
          }
          return null;
        })
        .filter((pair) => pair !== null) as Array<{ guild: IGuild; progress: IRaidProgress }>;

      if (guildProgressPairs.length === 0) {
        console.log(`No guilds with progress for raid ${raidId} ${difficulty}, skipping ranking`);
        continue;
      }

      // Sort guilds according to ranking rules
      const sortedPairs = guildProgressPairs.sort((a, b) => {
        const aProgress = a.progress;
        const bProgress = b.progress;

        // Rule 1: One mythic boss kill is worth more than any number of heroic boss kills
        // If we're comparing mythic progress, this doesn't apply (both are mythic)
        // If we're comparing heroic progress, this doesn't apply (both are heroic)
        // This rule is already enforced by calculating rankings per difficulty

        // Rule 2: Most boss kills first
        if (aProgress.bossesDefeated !== bProgress.bossesDefeated) {
          return bProgress.bossesDefeated - aProgress.bossesDefeated; // Higher is better
        }

        // Rule 3: If all bosses killed, whoever killed the last boss first wins
        if (aProgress.bossesDefeated === aProgress.totalBosses && bProgress.bossesDefeated === bProgress.totalBosses) {
          // Both completed - find last boss kill time
          const aLastBoss = aProgress.bosses.reduce((latest, boss) => {
            if (boss.kills > 0 && boss.firstKillTime) {
              if (!latest || new Date(boss.firstKillTime) > new Date(latest.firstKillTime!)) {
                return boss;
              }
            }
            return latest;
          }, null as any);

          const bLastBoss = bProgress.bosses.reduce((latest, boss) => {
            if (boss.kills > 0 && boss.firstKillTime) {
              if (!latest || new Date(boss.firstKillTime) > new Date(latest.firstKillTime!)) {
                return boss;
              }
            }
            return latest;
          }, null as any);

          if (aLastBoss?.firstKillTime && bLastBoss?.firstKillTime) {
            const aTime = new Date(aLastBoss.firstKillTime).getTime();
            const bTime = new Date(bLastBoss.firstKillTime).getTime();
            return aTime - bTime; // Earlier is better
          }
        }

        // Rule 4: If same boss kills and progressing, best pull progress wins
        // Find the current boss (first unkilled boss)
        const aCurrentBoss = aProgress.bosses.find((b) => b.kills === 0);
        const bCurrentBoss = bProgress.bosses.find((b) => b.kills === 0);

        if (aCurrentBoss && bCurrentBoss) {
          // Compare best pull progress (fightCompletion: lower is better)
          const aFightCompletion = aCurrentBoss.bestPullPhase?.fightCompletion ?? aCurrentBoss.bestPercent ?? 100;
          const bFightCompletion = bCurrentBoss.bestPullPhase?.fightCompletion ?? bCurrentBoss.bestPercent ?? 100;

          if (aFightCompletion !== bFightCompletion) {
            return aFightCompletion - bFightCompletion; // Lower is better
          }

          // Tiebreaker: bossHealth (lower is better)
          const aBossHealth = aCurrentBoss.bestPullPhase?.bossHealth ?? aCurrentBoss.bestPercent ?? 100;
          const bBossHealth = bCurrentBoss.bestPullPhase?.bossHealth ?? bCurrentBoss.bestPercent ?? 100;

          if (aBossHealth !== bBossHealth) {
            return aBossHealth - bBossHealth; // Lower is better
          }
        }

        // Final tiebreaker: alphabetically by guild name
        return a.guild.name.localeCompare(b.guild.name);
      });

      // Assign ranks
      sortedPairs.forEach((pair, index) => {
        pair.progress.guildRank = index + 1;
      });

      // Save all guilds with updated ranks
      for (const pair of sortedPairs) {
        await pair.guild.save();
      }

      console.log(`Ranked ${sortedPairs.length} guilds for raid ${raidId} ${difficulty}`);
    }
  }

  // Fetch reports for a guild and process both Mythic and Heroic from the same data
  // Returns true if new data was found and processed
  private async fetchAndProcessReports(guild: IGuild, isInitialFetch: boolean): Promise<boolean> {
    let hasNewData = false;

    if (isInitialFetch) {
      // Initial fetch: Get ALL reports across all content, filter by tracked raid bosses
      console.log(`[${guild.name}] INITIAL FETCH - fetching all historical reports`);
      hasNewData = await this.performInitialFetch(guild);

      // Calculate statistics from database fights for ALL tracked raids (initial setup)
      await this.calculateGuildStatistics(guild, null);
    } else {
      // Update: Only check the current raid for new reports
      console.log(`[${guild.name}] UPDATE - checking only current raid (ID: ${CURRENT_RAID_ID})`);
      hasNewData = await this.performUpdate(guild);

      // Only recalculate statistics for the current raid if we found new data
      if (hasNewData) {
        await this.calculateGuildStatistics(guild, CURRENT_RAID_ID);
      } else {
        console.log(`[${guild.name}] No new data for current raid, skipping statistics recalculation`);
      }
    }

    return hasNewData;
  }

  // Initial fetch: Get ALL reports for guild (no zone filter), save to DB
  // Returns true if any data was found and saved
  private async performInitialFetch(guild: IGuild): Promise<boolean> {
    console.log(`[${guild.name}] Performing initial fetch of all reports`);

    // Get valid boss encounter IDs from all tracked raids
    const validBossIds = await this.getValidBossEncounterIds();
    console.log(`[${guild.name}] Tracking ${validBossIds.size} boss encounters across ${TRACKED_RAIDS.length} raids`);

    const reportsPerPage = 10;
    let page = 1;
    const maxPages = 50; // Fetch up to 500 reports maximum
    let totalReportsFetched = 0;
    let totalFightsSaved = 0;

    while (page <= maxPages) {
      const data = await wclService.getGuildReportsWithFights(guild.name, guild.realm.toLowerCase().replace(/\s+/g, "-"), guild.region.toLowerCase(), reportsPerPage, page);

      if (!data.reportData?.reports?.data || data.reportData.reports.data.length === 0) {
        console.log(`[${guild.name}] No more reports found at page ${page}`);
        break;
      }

      // Update guild faction if available (only on first page)
      if (page === 1 && data.guildData?.guild?.faction?.name) {
        guild.faction = data.guildData.guild.faction.name;
      }

      const pageReports = data.reportData.reports.data;
      console.log(`[${guild.name}] Page ${page}: fetched ${pageReports.length} reports`);

      // Process each report
      for (const report of pageReports) {
        const zoneId = report.zone?.id;

        // Save report metadata
        const isOngoing = !report.endTime || report.endTime === 0;
        await Report.findOneAndUpdate(
          { code: report.code },
          {
            code: report.code,
            guildId: guild._id,
            zoneId: zoneId || 0,
            startTime: report.startTime,
            endTime: report.endTime,
            isOngoing,
            fightCount: report.fights?.length || 0,
            lastProcessed: new Date(),
          },
          { upsert: true, new: true }
        );

        totalReportsFetched++;

        // Process fights in this report
        if (report.fights && report.fights.length > 0) {
          const encounterPhases = report.phases || [];

          for (const fight of report.fights) {
            const encounterId = fight.encounterID;

            // CRITICAL: Only save fights for tracked raid bosses
            if (!validBossIds.has(encounterId)) {
              continue; // Skip dungeon bosses and other non-tracked content
            }

            const bossPercent = fight.bossPercentage || 0;
            const fightPercent = fight.fightPercentage || 0;
            const duration = fight.endTime - fight.startTime;
            const difficulty = fight.difficulty;

            // Determine phase information
            const phaseInfo = wclService.determinePhaseInfo(fight, encounterPhases);

            // Save fight to database
            const fightTimestamp = new Date(report.startTime + fight.startTime);
            await Fight.findOneAndUpdate(
              { reportCode: report.code, fightId: fight.id },
              {
                reportCode: report.code,
                guildId: guild._id,
                fightId: fight.id,
                zoneId: zoneId || 0,
                encounterID: encounterId,
                encounterName: fight.name || `Boss ${encounterId}`,
                difficulty: difficulty,
                isKill: fight.kill === true,
                bossPercentage: bossPercent,
                fightPercentage: fightPercent,
                lastPhaseId: phaseInfo.lastPhase?.phaseId,
                lastPhaseName: phaseInfo.lastPhase?.phaseName,
                phaseTransitions: fight.phaseTransitions?.map((pt: any) => ({
                  id: pt.id,
                  startTime: pt.startTime,
                  name: encounterPhases.find((ep: any) => ep.encounterID === encounterId)?.phases?.find((p: any) => p.id === pt.id)?.name,
                })),
                progressDisplay: phaseInfo.progressDisplay,
                reportStartTime: report.startTime,
                reportEndTime: report.endTime || 0,
                fightStartTime: fight.startTime,
                fightEndTime: fight.endTime,
                duration: duration,
                timestamp: fightTimestamp,
              },
              { upsert: true, new: true }
            );

            totalFightsSaved++;
          }
        }
      }

      if (pageReports.length < reportsPerPage) {
        console.log(`[${guild.name}] Reached last page at page ${page}`);
        break;
      }

      page++;
    }

    console.log(`[${guild.name}] Initial fetch complete: ${totalReportsFetched} reports, ${totalFightsSaved} fights saved`);
    return totalFightsSaved > 0;
  }

  // Update: Check only the current raid for new reports
  // Returns true if new data was found and saved
  private async performUpdate(guild: IGuild): Promise<boolean> {
    console.log(`[${guild.name}] Checking for updates on current raid (ID: ${CURRENT_RAID_ID})`);

    // Get valid boss encounter IDs for the current raid only
    const validBossIds = await this.getValidBossEncounterIdsForRaid(CURRENT_RAID_ID);
    console.log(`[${guild.name}] Current raid has ${validBossIds.size} bosses to track`);

    // Get the latest report we have for this raid
    const latestReport = await Report.findOne({
      guildId: guild._id,
      zoneId: CURRENT_RAID_ID,
    })
      .sort({ startTime: -1 })
      .limit(1);

    const latestReportTime = latestReport ? latestReport.startTime : 0;

    // Check for new reports (lightweight check)
    const checkData = await wclService.checkForNewReports(
      guild.name,
      guild.realm.toLowerCase().replace(/\s+/g, "-"),
      guild.region.toLowerCase(),
      CURRENT_RAID_ID,
      3 // Check last 3 reports
    );

    // log the check data for debugging
    console.log(`[${guild.name}] Report check data:`, JSON.stringify(checkData, null, 2));

    if (!checkData.reportData?.reports?.data || checkData.reportData.reports.data.length === 0) {
      console.log(`[${guild.name}] No reports found for current raid`);
      return false;
    }

    const recentReports = checkData.reportData.reports.data;

    // Find new reports and ongoing reports
    const newReportCodes = recentReports.filter((r: any) => r.startTime > latestReportTime).map((r: any) => r.code);

    const ongoingReportCodes = recentReports.filter((r: any) => !r.endTime || r.endTime === 0).map((r: any) => r.code);

    const reportsToFetch = [...new Set([...newReportCodes, ...ongoingReportCodes])];

    if (reportsToFetch.length === 0) {
      console.log(`[${guild.name}] No new or ongoing reports for current raid`);
      return false;
    }

    console.log(`[${guild.name}] Found ${reportsToFetch.length} reports to process (${newReportCodes.length} new, ${ongoingReportCodes.length} ongoing)`);

    let totalFightsSaved = 0;

    // Fetch and save each report
    for (const code of reportsToFetch) {
      const reportData = await wclService.getReportByCodeAllDifficulties(code);

      if (!reportData.reportData?.report) {
        console.log(`[${guild.name}] Failed to fetch report ${code}`);
        continue;
      }

      const report = reportData.reportData.report;

      // Save report metadata
      const isOngoing = !report.endTime || report.endTime === 0;
      await Report.findOneAndUpdate(
        { code: report.code },
        {
          code: report.code,
          guildId: guild._id,
          zoneId: CURRENT_RAID_ID,
          startTime: report.startTime,
          endTime: report.endTime,
          isOngoing,
          fightCount: report.fights?.length || 0,
          lastProcessed: new Date(),
        },
        { upsert: true, new: true }
      );

      // Process fights
      if (report.fights && report.fights.length > 0) {
        const encounterPhases = report.phases || [];

        for (const fight of report.fights) {
          const encounterId = fight.encounterID;

          // CRITICAL: Only save fights for current raid bosses
          if (!validBossIds.has(encounterId)) {
            continue;
          }

          const bossPercent = fight.bossPercentage || 0;
          const fightPercent = fight.fightPercentage || 0;
          const duration = fight.endTime - fight.startTime;
          const difficulty = fight.difficulty;

          // Determine phase information
          const phaseInfo = wclService.determinePhaseInfo(fight, encounterPhases);

          // Save fight to database
          const fightTimestamp = new Date(report.startTime + fight.startTime);
          await Fight.findOneAndUpdate(
            { reportCode: report.code, fightId: fight.id },
            {
              reportCode: report.code,
              guildId: guild._id,
              fightId: fight.id,
              zoneId: CURRENT_RAID_ID,
              encounterID: encounterId,
              encounterName: fight.name || `Boss ${encounterId}`,
              difficulty: difficulty,
              isKill: fight.kill === true,
              bossPercentage: bossPercent,
              fightPercentage: fightPercent,
              lastPhaseId: phaseInfo.lastPhase?.phaseId,
              lastPhaseName: phaseInfo.lastPhase?.phaseName,
              phaseTransitions: fight.phaseTransitions?.map((pt: any) => ({
                id: pt.id,
                startTime: pt.startTime,
                name: encounterPhases.find((ep: any) => ep.encounterID === encounterId)?.phases?.find((p: any) => p.id === pt.id)?.name,
              })),
              progressDisplay: phaseInfo.progressDisplay,
              reportStartTime: report.startTime,
              reportEndTime: report.endTime || 0,
              fightStartTime: fight.startTime,
              fightEndTime: fight.endTime,
              duration: duration,
              timestamp: fightTimestamp,
            },
            { upsert: true, new: true }
          );

          totalFightsSaved++;
        }
      }
    }

    console.log(`[${guild.name}] Update complete: ${reportsToFetch.length} reports processed, ${totalFightsSaved} fights saved`);
    return totalFightsSaved > 0;
  }

  // Calculate guild statistics from database fights
  // If raidId is provided, only calculate for that raid (used during updates)
  // If raidId is null, calculate for all tracked raids (used during initial fetch)
  private async calculateGuildStatistics(guild: IGuild, raidId: number | null): Promise<void> {
    if (raidId !== null) {
      console.log(`[${guild.name}] Calculating statistics for current raid only (ID: ${raidId})`);

      const raidData = await this.getRaidData(raidId);
      if (!raidData) {
        console.warn(`[${guild.name}] Raid data not found for zone ${raidId}, skipping`);
        return;
      }

      // Calculate for both difficulties
      await this.calculateRaidStatistics(guild, raidData, "mythic");
      await this.calculateRaidStatistics(guild, raidData, "heroic");
    } else {
      console.log(`[${guild.name}] Calculating statistics from database fights for all tracked raids`);

      // Process each tracked raid
      for (const trackedRaidId of TRACKED_RAIDS) {
        const raidData = await this.getRaidData(trackedRaidId);
        if (!raidData) {
          console.warn(`[${guild.name}] Raid data not found for zone ${trackedRaidId}, skipping`);
          continue;
        }

        // Calculate for both difficulties
        await this.calculateRaidStatistics(guild, raidData, "mythic");
        await this.calculateRaidStatistics(guild, raidData, "heroic");
      }
    }

    console.log(`[${guild.name}] Statistics calculation complete`);
  }

  // Calculate statistics for a specific raid and difficulty from database fights
  // IMPORTANT: This method now properly filters fights by the raid's boss encounter IDs
  // to prevent unrelated bosses from being included in the statistics
  private async calculateRaidStatistics(guild: IGuild, raidData: IRaid, difficulty: "mythic" | "heroic"): Promise<void> {
    const difficultyId = difficulty === "mythic" ? DIFFICULTIES.MYTHIC : DIFFICULTIES.HEROIC;

    // Get valid boss encounter IDs for this specific raid
    const validBossIds = await this.getValidBossEncounterIdsForRaid(raidData.id);
    console.log(`[${guild.name}] Valid boss IDs for ${raidData.name}: ${Array.from(validBossIds).join(", ")}`);

    // Get all fights from database for this guild, raid, and difficulty
    // IMPORTANT: Also filter by encounterID to ensure we only get bosses that belong to this raid
    const fights = await Fight.find({
      guildId: guild._id as mongoose.Types.ObjectId,
      zoneId: raidData.id,
      difficulty: difficultyId,
      encounterID: { $in: Array.from(validBossIds) }, // Only include fights for bosses in this raid
    }).sort({ timestamp: 1 }); // Sort by timestamp (oldest first) for proper kill order tracking

    if (fights.length === 0) {
      console.log(`[${guild.name}] No ${difficulty} fights found for ${raidData.name}`);
      return;
    }

    console.log(`[${guild.name}] Calculating ${difficulty} statistics from ${fights.length} fights for ${raidData.name}`);

    // Filter fights by raid's "current content" date range for the guild's region
    const guildRegion = guild.region.toLowerCase();
    let raidStartDate = raidData.starts?.[guildRegion as keyof typeof raidData.starts];
    let raidEndDate = raidData.ends?.[guildRegion as keyof typeof raidData.ends];

    // For older raids (pre-Legion) that don't have start/end dates in Raider.IO,
    // use very permissive dates so all fights are included
    if (!raidStartDate && !raidEndDate) {
      raidStartDate = new Date("1970-01-01T00:00:00Z"); // Very old date
      raidEndDate = new Date("2100-12-31T23:59:59Z"); // Very far future date
      console.log(`[${guild.name}] No dates available for ${raidData.name} - using permissive date range (all fights included)`);
    }

    let filteredFights = fights;
    let dateFilteredCount = 0;

    if (raidStartDate || raidEndDate) {
      const beforeFilterCount = fights.length;

      filteredFights = fights.filter((fight) => {
        const fightTimestamp = fight.timestamp;

        // Check if fight is after raid start (if start date exists)
        if (raidStartDate && fightTimestamp < raidStartDate) {
          return false;
        }

        // Check if fight is before raid end (if end date exists)
        if (raidEndDate && fightTimestamp > raidEndDate) {
          return false;
        }

        return true;
      });

      dateFilteredCount = beforeFilterCount - filteredFights.length;

      if (dateFilteredCount > 0) {
        console.log(
          `[${guild.name}] Filtered out ${dateFilteredCount} ${difficulty} fights outside raid's current content window (${raidStartDate?.toISOString() || "no start"} to ${
            raidEndDate?.toISOString() || "no end"
          }) for region ${guildRegion}`
        );
      }
    }

    if (filteredFights.length === 0) {
      console.log(`[${guild.name}] No ${difficulty} fights remaining after date filtering for ${raidData.name}`);
      return;
    }

    console.log(`[${guild.name}] Processing ${filteredFights.length} ${difficulty} fights (after date filtering) for ${raidData.name}`);

    // Aggregate boss data from database fights
    const bossDataMap = new Map<
      number,
      {
        encounterID: number;
        name: string;
        kills: number;
        pulls: number;
        bestPercent: number;
        totalTime: number;
        firstKillTime?: Date;
        firstKillReportCode?: string;
        firstKillFightId?: number;
        bestPullPhase?: {
          phaseId: number;
          phaseName: string;
          bossHealth: number;
          fightCompletion: number;
          displayString: string;
        };
      }
    >();

    // Track kill order - which boss was killed first, second, etc.
    const killOrderTracker: Array<{ encounterId: number; killTime: Date }> = [];

    // FIRST PASS: Filter out duplicate fights
    // Create a map to track seen fight characteristics
    const seenFights = new Map<string, any>();
    const uniqueFights: any[] = [];
    let duplicateCount = 0;

    for (const fight of filteredFights) {
      const duplicateCheck = this.isDuplicateFightInMemory(fight, uniqueFights, seenFights);

      if (duplicateCheck.isDuplicate) {
        duplicateCount++;
        console.log(
          `[${guild.name}] Skipping duplicate ${difficulty} fight: ${fight.encounterName} (${fight.reportCode}#${fight.fightId}) - duplicate of (${duplicateCheck.canonical.reportCode}#${duplicateCheck.canonical.fightId})`
        );
        continue;
      }

      uniqueFights.push(fight);
    }

    if (duplicateCount > 0) {
      console.log(`[${guild.name}] Filtered out ${duplicateCount} duplicate ${difficulty} fights for ${raidData.name}`);
    }

    console.log(`[${guild.name}] Processing ${uniqueFights.length} unique ${difficulty} fights for ${raidData.name}`);

    // SECOND PASS: Identify first kill times for each boss
    const firstKillTimes = new Map<number, Date>();

    for (const fight of uniqueFights) {
      if (fight.isKill && !firstKillTimes.has(fight.encounterID)) {
        firstKillTimes.set(fight.encounterID, fight.timestamp);
      }
    }

    console.log(
      `[${guild.name}] First kill times identified for ${difficulty}:`,
      Array.from(firstKillTimes.entries()).map(([id, time]) => `Boss ${id}: ${time.toISOString()}`)
    );

    // THIRD PASS: Process all unique fights and build statistics
    for (const fight of uniqueFights) {
      const encounterId = fight.encounterID;
      const isKill = fight.isKill;
      const bossPercent = fight.bossPercentage || 0;
      const fightPercent = fight.fightPercentage || 0;
      const duration = fight.duration / 1000; // Convert ms to seconds

      if (!bossDataMap.has(encounterId)) {
        bossDataMap.set(encounterId, {
          encounterID: encounterId,
          name: fight.encounterName,
          kills: 0,
          pulls: 0,
          bestPercent: 100, // Start at 100 (worst), track lowest (best)
          totalTime: 0,
          firstKillTime: undefined,
          firstKillReportCode: undefined,
          firstKillFightId: undefined,
          bestPullPhase: undefined,
        });
      }

      const bossData = bossDataMap.get(encounterId)!;

      // Only count pulls and time up to (and including) the first kill
      const firstKillTime = firstKillTimes.get(encounterId);
      const shouldCountPull = !firstKillTime || fight.timestamp <= firstKillTime;

      if (shouldCountPull) {
        bossData.pulls++;
        bossData.totalTime += duration;
      }

      if (isKill) {
        bossData.kills++;
        // Track first kill time and report/fight info
        if (!bossData.firstKillTime) {
          bossData.firstKillTime = fight.timestamp;
          bossData.firstKillReportCode = fight.reportCode;
          bossData.firstKillFightId = fight.fightId;

          // Add to kill order tracker
          killOrderTracker.push({ encounterId, killTime: fight.timestamp });
        }
      } else {
        // Track best pull percentage for non-kills
        // Use fightPercentage as it's more accurate
        // Only track best percent for pulls before first kill
        if (shouldCountPull && fightPercent < bossData.bestPercent) {
          bossData.bestPercent = fightPercent;

          // Store best pull phase info
          if (fight.lastPhaseId && fight.lastPhaseName) {
            bossData.bestPullPhase = {
              phaseId: fight.lastPhaseId,
              phaseName: fight.lastPhaseName,
              bossHealth: bossPercent,
              fightCompletion: fightPercent,
              displayString: fight.progressDisplay || `${bossPercent.toFixed(1)}%`,
            };
          }
        }
      }
    }

    // Sort kill order by time and assign order numbers
    killOrderTracker.sort((a, b) => a.killTime.getTime() - b.killTime.getTime());
    const killOrderMap = new Map<number, number>();
    killOrderTracker.forEach((entry, index) => {
      killOrderMap.set(entry.encounterId, index + 1);
    });

    // If no boss data found for this difficulty, skip
    if (bossDataMap.size === 0) {
      console.log(`[${guild.name}] No ${difficulty} encounters found - bossDataMap is empty`);
      return;
    }

    console.log(
      `[${guild.name}] Found ${bossDataMap.size} unique bosses for ${difficulty}:`,
      Array.from(bossDataMap.keys()).map((id) => {
        const boss = bossDataMap.get(id)!;
        return `${boss.name} (${boss.kills} kills, ${boss.pulls} pulls)`;
      })
    );

    // Update or create raid progress entry
    let raidProgress = guild.progress.find((p) => p.raidId === raidData.id && p.difficulty === difficulty);

    if (!raidProgress) {
      // Create a new progress entry
      guild.progress.push({
        raidId: raidData.id,
        raidName: raidData.name,
        difficulty,
        bossesDefeated: 0,
        totalBosses: raidData.bosses.length,
        totalTimeSpent: 0,
        bosses: [],
        lastUpdated: new Date(),
      } as IRaidProgress);

      raidProgress = guild.progress[guild.progress.length - 1];
      console.log(`[${guild.name}] Created new ${difficulty} progress entry for ${raidData.name}`);
    }

    // First, remove any bosses that don't belong to this raid (cleanup old invalid data)
    const initialBossCount = raidProgress.bosses.length;
    raidProgress.bosses = raidProgress.bosses.filter((b) => validBossIds.has(b.bossId));
    if (raidProgress.bosses.length < initialBossCount) {
      console.log(`[${guild.name}] Removed ${initialBossCount - raidProgress.bosses.length} invalid boss(es) that don't belong to ${raidData.name} (${difficulty})`);
    }

    // Process each boss from our calculated data
    for (const [encounterId, bossInfo] of bossDataMap.entries()) {
      // Double-check this boss belongs to the raid (should always be true due to earlier filtering)
      if (!validBossIds.has(encounterId)) {
        console.warn(`[${guild.name}] Skipping boss ${bossInfo.name} (ID: ${encounterId}) - not in raid ${raidData.name}'s boss list`);
        continue;
      }

      let bossProgress = raidProgress.bosses.find((b) => b.bossId === encounterId);

      const bossData: IBossProgress = {
        bossId: encounterId,
        bossName: bossInfo.name,
        kills: bossInfo.kills,
        bestPercent: bossInfo.bestPercent,
        pullCount: bossInfo.pulls,
        timeSpent: bossInfo.totalTime,
        firstKillTime: bossInfo.firstKillTime,
        firstKillReportCode: bossInfo.firstKillReportCode,
        firstKillFightId: bossInfo.firstKillFightId,
        killOrder: killOrderMap.get(encounterId),
        bestPullPhase: bossInfo.kills > 0 ? undefined : bossInfo.bestPullPhase,
        lastUpdated: new Date(),
      };

      if (bossProgress) {
        // Check if we should create events
        await this.checkAndCreateEvents(guild, raidProgress, bossProgress, bossData);

        // Update existing boss progress
        Object.assign(bossProgress, bossData);
      } else {
        // New boss progress
        console.log(`[${guild.name}] Adding new boss to ${difficulty} progress: ${bossData.bossName} (${bossData.kills} kills, ${bossData.pullCount} pulls)`);
        raidProgress.bosses.push(bossData);
      }
    }

    // Recalculate totals from only the valid bosses that belong to this raid
    let totalTime = 0;
    let defeatedCount = 0;
    for (const boss of raidProgress.bosses) {
      // Extra safety check - only count bosses that belong to this raid
      if (validBossIds.has(boss.bossId)) {
        totalTime += boss.timeSpent;
        if (boss.kills > 0) defeatedCount++;
      }
    }

    raidProgress.bossesDefeated = defeatedCount;
    raidProgress.totalBosses = raidData.bosses.length;
    raidProgress.totalTimeSpent = totalTime;
    raidProgress.lastUpdated = new Date();

    console.log(`[${guild.name}] Before markModified - ${difficulty} progress has ${raidProgress.bosses.length} bosses in array`);

    // Mark the specific progress subdocument as modified
    const progressIndex = guild.progress.findIndex((p) => p.raidId === raidData.id && p.difficulty === difficulty);
    if (progressIndex !== -1) {
      guild.markModified(`progress.${progressIndex}.bosses`);
      guild.markModified(`progress.${progressIndex}.bossesDefeated`);
      guild.markModified(`progress.${progressIndex}.totalTimeSpent`);
    }

    // Also mark the entire progress array as modified
    guild.markModified("progress");

    console.log(`[${guild.name}] Processed ${difficulty} progress: ${defeatedCount}/${raidData.bosses.length} bosses defeated, ${raidProgress.bosses.length} bosses tracked`);
  }

  private async checkAndCreateEvents(guild: IGuild, raidProgress: IRaidProgress, oldBoss: IBossProgress, newBoss: IBossProgress): Promise<void> {
    // Check for first kill
    if (oldBoss.kills === 0 && newBoss.kills > 0) {
      await Event.create({
        type: "boss_kill",
        guildId: guild._id,
        guildName: guild.name,
        raidId: raidProgress.raidId,
        raidName: raidProgress.raidName,
        bossId: newBoss.bossId,
        bossName: newBoss.bossName,
        difficulty: raidProgress.difficulty,
        data: {
          pullCount: newBoss.pullCount,
          timeSpent: newBoss.timeSpent,
        },
        timestamp: newBoss.firstKillTime || new Date(),
      });
    }

    // Check for new best pull (improvement of at least 5% lower health)
    if (oldBoss.bestPercent - newBoss.bestPercent >= 5 && newBoss.kills === 0) {
      await Event.create({
        type: "best_pull",
        guildId: guild._id,
        guildName: guild.name,
        raidId: raidProgress.raidId,
        raidName: raidProgress.raidName,
        bossId: newBoss.bossId,
        bossName: newBoss.bossName,
        difficulty: raidProgress.difficulty,
        data: {
          bestPercent: newBoss.bestPercent,
          pullCount: newBoss.pullCount,
          progressDisplay: newBoss.bestPullPhase?.displayString, // Include phase display string
        },
        timestamp: new Date(),
      });
    }
  }

  // Check if guild has ongoing reports (currently raiding)
  async updateRaidingStatus(guild: IGuild): Promise<void> {
    // Check if there are any ongoing reports for this guild in any tracked raid
    const ongoingReports = await Report.countDocuments({
      guildId: guild._id,
      zoneId: { $in: TRACKED_RAIDS },
      isOngoing: true,
    });

    const wasRaiding = guild.isCurrentlyRaiding;
    guild.isCurrentlyRaiding = ongoingReports > 0;

    if (wasRaiding !== guild.isCurrentlyRaiding) {
      console.log(`${guild.name} raiding status changed: ${guild.isCurrentlyRaiding ? "STARTED" : "STOPPED"} raiding`);
      // Don't save here - let the caller save to avoid overwriting changes
    }
  }

  // Get all guilds sorted by progress
  async getAllGuilds(): Promise<IGuild[]> {
    const guilds = await Guild.find().sort({ "progress.bossesDefeated": -1 });
    return guilds;
  }

  // Get all guilds with progress filtered by raidId (minimal data for leaderboard)
  async getAllGuildsForRaid(raidId: number): Promise<any[]> {
    const guilds = await Guild.find().sort({ "progress.bossesDefeated": -1 });

    // Filter and transform to minimal structure for leaderboard
    return guilds
      .map((guild) => {
        const guildObj = guild.toObject();

        // Filter progress for the specified raid
        const raidProgress = guildObj.progress.filter((p) => p.raidId === raidId);

        // Transform progress to minimal structure
        const minimalProgress = raidProgress.map((p) => {
          // Find current boss (first unkilled boss) to get best pull info
          const currentBoss = p.bosses.find((b) => b.kills === 0);

          // Find the last killed boss to get the most recent kill timestamp
          const killedBosses = p.bosses.filter((b) => b.kills > 0 && b.firstKillTime);
          const lastKilledBoss =
            killedBosses.length > 0 ? killedBosses.reduce((latest, boss) => (new Date(boss.firstKillTime!) > new Date(latest.firstKillTime!) ? boss : latest)) : null;

          return {
            raidId: p.raidId,
            raidName: p.raidName,
            difficulty: p.difficulty,
            bossesDefeated: p.bossesDefeated,
            totalBosses: p.totalBosses,
            totalTimeSpent: p.totalTimeSpent,
            currentBossPulls: currentBoss?.pullCount || 0,
            bestPullPercent: currentBoss?.bestPercent || 0,
            bestPullPhase: currentBoss?.bestPullPhase,
            lastKillTime: lastKilledBoss?.firstKillTime || null,
            worldRank: p.worldRank,
            worldRankColor: p.worldRankColor,
            guildRank: p.guildRank,
          };
        });

        // Return minimal guild structure
        return {
          _id: guildObj._id,
          name: guildObj.name,
          realm: guildObj.realm,
          region: guildObj.region,
          faction: guildObj.faction,
          isCurrentlyRaiding: guildObj.isCurrentlyRaiding,
          lastFetched: guildObj.lastFetched,
          progress: minimalProgress,
        };
      })
      .filter((guild) => {
        // Only include guilds that have killed at least one boss (on any difficulty) for this raid
        return guild.progress.some((p) => p.bossesDefeated > 0);
      });
  }

  // Get detailed boss progress for a specific raid (returns only progress array, not guild info)
  async getGuildBossProgressForRaid(guildId: string, raidId: number): Promise<any[] | null> {
    const guild = await Guild.findById(guildId);

    if (!guild) {
      return null;
    }

    const guildObj = guild.toObject();

    // Return only the progress array for the specified raid
    const raidProgress = guildObj.progress.filter((p) => p.raidId === raidId);

    return raidProgress;
  } // Get single guild by ID
  async getGuildById(id: string): Promise<IGuild | null> {
    return await Guild.findById(id);
  }

  // Get guild summary with progress summaries (without boss arrays)
  async getGuildSummary(guildId: string): Promise<any | null> {
    const guild = await Guild.findById(guildId);

    if (!guild) {
      return null;
    }

    const guildObj = guild.toObject();

    // Transform progress to summary format (without boss arrays)
    const summaryProgress = guildObj.progress.map((p) => {
      // Find current boss (first unkilled boss) to get best pull info
      const currentBoss = p.bosses.find((b) => b.kills === 0);

      // Find the last killed boss to get the most recent kill timestamp
      const killedBosses = p.bosses.filter((b) => b.kills > 0 && b.firstKillTime);
      const lastKilledBoss =
        killedBosses.length > 0 ? killedBosses.reduce((latest, boss) => (new Date(boss.firstKillTime!) > new Date(latest.firstKillTime!) ? boss : latest)) : null;

      return {
        raidId: p.raidId,
        raidName: p.raidName,
        difficulty: p.difficulty,
        bossesDefeated: p.bossesDefeated,
        totalBosses: p.totalBosses,
        totalTimeSpent: p.totalTimeSpent,
        currentBossPulls: currentBoss?.pullCount || 0,
        bestPullPercent: currentBoss?.bestPercent || 0,
        bestPullPhase: currentBoss?.bestPullPhase,
        lastKillTime: lastKilledBoss?.firstKillTime || null,
        worldRank: p.worldRank,
        worldRankColor: p.worldRankColor,
        guildRank: p.guildRank,
      };
    });

    return {
      _id: guildObj._id,
      name: guildObj.name,
      realm: guildObj.realm,
      region: guildObj.region,
      faction: guildObj.faction,
      isCurrentlyRaiding: guildObj.isCurrentlyRaiding,
      lastFetched: guildObj.lastFetched,
      progress: summaryProgress,
    };
  }

  // Get full guild profile with all raid progress including boss details
  async getGuildFullProfile(guildId: string): Promise<any | null> {
    const guild = await Guild.findById(guildId);

    if (!guild) {
      return null;
    }

    const guildObj = guild.toObject();

    // Return full guild with all progress data
    return {
      _id: guildObj._id,
      name: guildObj.name,
      realm: guildObj.realm,
      region: guildObj.region,
      faction: guildObj.faction,
      isCurrentlyRaiding: guildObj.isCurrentlyRaiding,
      lastFetched: guildObj.lastFetched,
      progress: guildObj.progress, // Full progress with boss arrays
    };
  }

  // Get guilds that need updating (haven't been updated in a while)
  async getGuildsNeedingUpdate(maxAge: number = 5 * 60 * 1000): Promise<IGuild[]> {
    const cutoff = new Date(Date.now() - maxAge);
    return await Guild.find({
      $or: [{ lastFetched: { $exists: false } }, { lastFetched: null }, { lastFetched: { $lt: cutoff } }],
    });
  }

  // Get guilds that are currently raiding (for frequent polling)
  async getGuildsCurrentlyRaiding(): Promise<IGuild[]> {
    return await Guild.find({ isCurrentlyRaiding: true });
  }

  // Generate WarcraftLogs URL for a specific kill
  getKillLogUrl(reportCode: string, fightId: number): string {
    return `https://www.warcraftlogs.com/reports/${reportCode}#fight=${fightId}`;
  }
}

export default new GuildService();
