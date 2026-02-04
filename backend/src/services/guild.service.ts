import Guild, { IGuild, IRaidProgress, IBossProgress } from "../models/Guild";
import Event from "../models/Event";
import Raid, { IRaid } from "../models/Raid";
import Report from "../models/Report";
import Fight from "../models/Fight";
import TierList from "../models/TierList";
import GuildProcessingQueue from "../models/GuildProcessingQueue";
import wclService from "./warcraftlogs.service";
import blizzardService from "./blizzard.service";
import raiderIOService from "./raiderio.service";
import cacheService from "./cache.service";
import backgroundGuildProcessor from "./background-guild-processor.service";
import { GUILDS_DEV, TRACKED_RAIDS, CURRENT_RAID_IDS, DIFFICULTIES, GUILDS_PROD, MANUAL_RAID_DATES } from "../config/guilds";
import { filterUniqueGuilds } from "../utils/filterUniqueGuilds";
import mongoose from "mongoose";
import logger, { getGuildLogger } from "../utils/logger";

class GuildService {
  // Configuration for death events fetching
  private fetchDeathEvents: boolean = process.env.FETCH_DEATH_EVENTS === "true";

  // Sync raid information from WarcraftLogs to database
  async syncRaidsFromWCL(): Promise<void> {
    logger.info("Syncing raid data from WarcraftLogs...");

    try {
      // Check if we have any raids in the database
      const existingRaidCount = await Raid.countDocuments();
      logger.info(`Found ${existingRaidCount} raids in database`);

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
          logger.info(`Missing tracked raid IDs in database: ${missingRaidIds.join(", ")}`);
          logger.info("Triggering full zone refetch...");
          needsFullFetch = true;
        } else {
          logger.info("All tracked raids already exist in database, skipping zone fetch");
          return;
        }
      } else {
        logger.info("Database is empty, fetching all zones for initial setup");
      }

      // Only fetch zones if needed (first time or missing tracked raids)
      if (needsFullFetch) {
        // Fetch achievements from Blizzard API (same trigger as zones)
        logger.info("Fetching achievements from Blizzard API...");
        await blizzardService.updateAchievements();

        // Fetch all zones from WarcraftLogs
        const result = await wclService.getZones();
        const zones = result.worldData?.zones;

        if (!zones || zones.length === 0) {
          logger.warn("No zones data returned from WarcraftLogs");
          return;
        }

        logger.info(`Found ${zones.length} zones from WarcraftLogs`);

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
              logger.warn(`No detailed data found for zone ${zone.id} (${zone.name})`);
              continue;
            }

            logger.info(`Zone ${zone.id} data:`, JSON.stringify(zoneData, null, 2));

            // Check if encounters exist
            if (!zoneData.encounters || zoneData.encounters.length === 0) {
              logger.warn(`Zone ${zone.id} (${zoneData.name}) has no encounters, skipping...`);
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

            logger.info(`Syncing zone ${zone.id} (${expansionName}) with ${bosses.length} encounters`);

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
              { upsert: true, new: true },
            );

            logger.info(`Synced raid: ${zoneData.name} (${expansionName}, ${bosses.length} bosses)`);
          } catch (error) {
            logger.error(`Error syncing zone ${zone.id}:`, error);
          }
        }

        // Batch fetch all raid and boss icons from Blizzard
        logger.info("Fetching raid and boss icons from Blizzard API...");
        const raidIconMap = await blizzardService.getRaidIconUrls(allRaidNames);
        const bossIconMap = await blizzardService.getBossIconUrls(allBossNames);

        // Fetch raid dates from Raider.IO
        logger.info("Fetching raid start/end dates from Raider.IO API...");
        const raidDatesMap = await raiderIOService.fetchAllRaidDates();

        // Update raids with icons and dates using cached zone data
        logger.info("Updating raids with icon URLs and start/end dates...");
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
              logger.info(`✅ Found Raider.IO dates for: ${zoneData.name}`);

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
              // Check if we have manual dates for this raid
              const manualRaidData = MANUAL_RAID_DATES.find((r) => r.id === zoneId);

              if (manualRaidData) {
                logger.info(`✅ Using manual dates for: ${zoneData.name}`);

                // Apply manual EU dates
                updateData.starts = {
                  eu: new Date(manualRaidData.euStartDate),
                };

                updateData.ends = {
                  eu: new Date(manualRaidData.euEndDate),
                };
              } else {
                logger.info(`⚠️  No Raider.IO or manual dates found for: ${zoneData.name}`);
              }
            }

            // Update raid with icons and dates
            await Raid.findOneAndUpdate(
              { id: zoneId },
              {
                $set: updateData,
              },
            );

            const hasManualDates = MANUAL_RAID_DATES.some((r) => r.id === zoneId);
            const datesSource = raiderIOMatch ? "Raider.IO" : hasManualDates ? "Manual" : "None";
            logger.info(`Updated raid: ${zoneData.name} (icon: ${raidIconUrl ? "✅" : "❌"}, dates: ${datesSource})`);
          } catch (error) {
            logger.error(`Error updating raid data for zone ${zoneId}:`, error);
          }
        }

        logger.info("Raid sync completed");
      }
    } catch (error) {
      logger.error("Error syncing raids from WarcraftLogs:", error);
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

    logger.info(`Loaded ${validBossIds.size} valid boss encounter IDs from ${TRACKED_RAIDS.length} tracked raids`);
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

  // Get valid boss encounter IDs for all current raids
  private async getValidBossEncounterIdsForCurrentRaids(): Promise<Set<number>> {
    const validBossIds = new Set<number>();

    for (const raidId of CURRENT_RAID_IDS) {
      const raid = await this.getRaidData(raidId);
      if (raid && raid.bosses) {
        for (const boss of raid.bosses) {
          validBossIds.add(boss.id);
        }
      }
    }

    return validBossIds;
  }

  // Check if a fight is a duplicate based on unique characteristics with tolerance
  // A fight is considered duplicate if it has the same:
  // - encounterID (exact match)
  // - difficulty (exact match)
  // - bossPercentage (within 0.1%)
  // - fightPercentage (within 0.1%)
  // - duration (within 1 second)
  // This indicates the same log uploaded multiple times by different users
  // Returns the canonical fight (first occurrence by timestamp) if this is a duplicate
  private isDuplicateFightInMemory(fight: any, allFights: any[], seenFights: Map<string, any>): { isDuplicate: boolean; canonical?: any } {
    // Tolerance values for fuzzy matching
    const PERCENTAGE_TOLERANCE = 0.01; //0.1; // 0.1% tolerance for percentages
    const DURATION_TOLERANCE = 100; //1000; // 1 second (1000ms) tolerance for duration

    // Check against all previously seen fights for this encounter+difficulty
    const lookupKey = `${fight.encounterID}-${fight.difficulty}`;
    const candidateFights = seenFights.get(lookupKey) || [];

    for (const seenFight of candidateFights) {
      // Check if percentages and duration are within tolerance
      const bossPercentageDiff = Math.abs((fight.bossPercentage || 0) - (seenFight.bossPercentage || 0));
      const fightPercentageDiff = Math.abs((fight.fightPercentage || 0) - (seenFight.fightPercentage || 0));
      const durationDiff = Math.abs((fight.duration || 0) - (seenFight.duration || 0));

      if (bossPercentageDiff <= PERCENTAGE_TOLERANCE && fightPercentageDiff <= PERCENTAGE_TOLERANCE && durationDiff <= DURATION_TOLERANCE) {
        // This is a duplicate
        return { isDuplicate: true, canonical: seenFight };
      }
    }

    // Not a duplicate - add to the list of seen fights for this encounter+difficulty
    candidateFights.push(fight);
    seenFights.set(lookupKey, candidateFights);
    return { isDuplicate: false };
  }

  // Initialize all guilds from config
  // New guilds are queued for background processing instead of blocking
  async initializeGuilds(): Promise<void> {
    logger.info("Initializing guilds from config...");

    const rawGuilds = process.env.NODE_ENV === "production" ? GUILDS_PROD : GUILDS_DEV;
    const guildsToTrack = filterUniqueGuilds(rawGuilds);
    logger.info(`Environment: ${process.env.NODE_ENV}, Tracking ${guildsToTrack.length} unique guilds (from ${rawGuilds.length} total)`);

    let newGuildsCount = 0;
    let existingGuildsCount = 0;

    for (const guildConfig of guildsToTrack) {
      const existing = await Guild.findOne({
        name: guildConfig.name,
        realm: guildConfig.realm,
        region: guildConfig.region,
      });

      if (!existing) {
        // Fetch guild crest data from Blizzard API
        // Use parent_guild name if it exists, as that's the actual guild in Blizzard's system
        const blizzardGuildName = guildConfig.parent_guild || guildConfig.name;
        logger.info(`Fetching crest data for: ${blizzardGuildName} - ${guildConfig.realm}${guildConfig.parent_guild ? ` (parent guild for ${guildConfig.name})` : ""}`);
        let crestData = undefined;
        let faction = undefined;

        try {
          const guildData = await blizzardService.getGuildData(blizzardGuildName, guildConfig.realm.toLowerCase(), guildConfig.region);
          if (guildData) {
            crestData = guildData.crest;
            faction = guildData.faction;
            logger.info(`✅ Retrieved crest data for: ${blizzardGuildName}`);
          } else {
            logger.warn(`⚠️  Could not fetch crest data for: ${blizzardGuildName}`);
          }
        } catch (error) {
          logger.error(`Error fetching crest data for ${blizzardGuildName}:`, error instanceof Error ? error.message : "Unknown error");
        }

        const newGuild = await Guild.create({
          name: guildConfig.name,
          realm: guildConfig.realm,
          region: guildConfig.region,
          faction,
          crest: crestData,
          parent_guild: guildConfig.parent_guild,
          progress: [],
        });
        logger.info(`Created guild: ${guildConfig.name} - ${guildConfig.realm}`);

        // Queue for background processing instead of immediate blocking fetch
        try {
          await backgroundGuildProcessor.queueGuild(newGuild, 10);
          logger.info(`Queued guild for background processing: ${guildConfig.name} - ${guildConfig.realm}`);
          newGuildsCount++;
        } catch (error) {
          logger.error(`Error queueing guild for processing: ${guildConfig.name} - ${guildConfig.realm}:`, error instanceof Error ? error.message : "Unknown error");
        }
      } else {
        existingGuildsCount++;

        // Check if this existing guild needs to be queued for initial fetch
        // (i.e., it exists in DB but has no reports - maybe a previous fetch failed)
        const hasReports = await Report.exists({ guildId: existing._id });
        if (!hasReports) {
          // Skip guilds that don't exist on WarcraftLogs (marked as not_found)
          if (existing.wclStatus === "not_found") {
            logger.debug(`Skipping guild ${existing.name} - marked as not found on WarcraftLogs`);
            continue;
          }

          // Skip guilds that already completed their initial fetch (they just have no reports on WCL)
          if (existing.initialFetchCompleted) {
            logger.debug(`Skipping guild ${existing.name} - initial fetch already completed (no reports on WCL)`);
            continue;
          }

          // Check if already in queue
          const inQueue = await GuildProcessingQueue.findOne({ guildId: existing._id });
          if (!inQueue || inQueue.status === "failed") {
            logger.info(`Existing guild ${existing.name} has no reports, queueing for background fetch`);
            await backgroundGuildProcessor.queueGuild(existing, 10);
          }
        }
      }
    }

    logger.info(`Guild initialization complete: ${newGuildsCount} new guilds queued, ${existingGuildsCount} existing guilds`);
  }

  // Sync guild config data (parent_guild and streamers) from config to database
  // This runs on startup to ensure config changes are reflected in the database
  async syncGuildConfigData(): Promise<void> {
    logger.info("Syncing guild config data (parent_guild, streamers)...");

    const rawGuilds = process.env.NODE_ENV === "production" ? GUILDS_PROD : GUILDS_DEV;
    const guildsToTrack = filterUniqueGuilds(rawGuilds);

    for (const guildConfig of guildsToTrack) {
      try {
        const guild = await Guild.findOne({
          name: guildConfig.name,
          realm: guildConfig.realm,
          region: guildConfig.region,
        });

        if (!guild) {
          // Guild doesn't exist yet, will be created by initializeGuilds
          continue;
        }

        // Check if we need to update parent_guild
        const needsParentUpdate = guild.parent_guild !== guildConfig.parent_guild;

        // Check if we need to update streamers
        let needsStreamersUpdate = false;
        const configStreamers = guildConfig.streamers || [];
        const existingStreamers = guild.streamers || [];

        // Compare streamer arrays
        if (configStreamers.length !== existingStreamers.length) {
          needsStreamersUpdate = true;
        } else {
          const existingChannelNames = new Set(existingStreamers.map((s) => s.channelName.toLowerCase()));
          const configChannelNames = new Set(configStreamers.map((s) => s.toLowerCase()));

          // Check if sets are equal
          needsStreamersUpdate = configChannelNames.size !== existingChannelNames.size || ![...configChannelNames].every((name) => existingChannelNames.has(name));
        }

        // Update if needed
        if (needsParentUpdate || needsStreamersUpdate) {
          const updates: any = {};

          if (needsParentUpdate) {
            updates.parent_guild = guildConfig.parent_guild;
            logger.info(`  ${guild.name}: Updating parent_guild to "${guildConfig.parent_guild || "none"}"`);
          }

          if (needsStreamersUpdate) {
            // Convert config streamers to streamer objects
            updates.streamers = configStreamers.map((channelName) => ({
              channelName: channelName.toLowerCase(),
              isLive: false,
              lastChecked: undefined,
            }));
            logger.info(`  ${guild.name}: Updating streamers to [${configStreamers.join(", ")}]`);
          }

          await Guild.updateOne(
            {
              name: guildConfig.name,
              realm: guildConfig.realm,
              region: guildConfig.region,
            },
            { $set: updates },
          );
        }
      } catch (error) {
        logger.error(`Error syncing config for ${guildConfig.name}:`, error instanceof Error ? error.message : "Unknown error");
      }
    }

    logger.info("Guild config sync completed");
  }

  // Recalculate statistics for existing guilds on startup
  // This is used when CALCULATE_GUILD_STATISTICS_ON_STARTUP is set to true
  async recalculateExistingGuildStatistics(currentTierOnly: boolean = true): Promise<void> {
    logger.info("Recalculating statistics for existing guilds...");
    logger.info(`Mode: ${currentTierOnly ? "Current tier only" : "All tracked raids"}`);

    try {
      // Get all guilds from database
      const guilds = await Guild.find();

      if (guilds.length === 0) {
        logger.info("No guilds found in database, skipping statistics recalculation");
        return;
      }

      logger.info(`Found ${guilds.length} guilds to recalculate statistics for`);

      // Process each guild
      for (const guild of guilds) {
        try {
          // Check if guild has any reports (i.e., has already been initialized with data)
          const hasReports = await Report.exists({ guildId: guild._id });

          if (!hasReports) {
            getGuildLogger(guild.name, guild.realm).info("No reports found, skipping statistics recalculation");
            continue;
          }

          getGuildLogger(guild.name, guild.realm).info("Recalculating statistics...");

          // Recalculate statistics based on the mode
          if (currentTierOnly) {
            // Only recalculate for current raids
            for (const raidId of CURRENT_RAID_IDS) {
              await this.calculateGuildStatistics(guild, raidId);
            }
          } else {
            // Recalculate for all tracked raids
            await this.calculateGuildStatistics(guild, null);
          }

          // Save the guild with updated statistics
          await guild.save();
          getGuildLogger(guild.name, guild.realm).info("Statistics recalculation complete and saved");
        } catch (error) {
          getGuildLogger(guild.name, guild.realm).error("Error recalculating statistics:", error instanceof Error ? error.message : "Unknown error");
          // Continue with next guild even if one fails
        }
      }

      logger.info("Finished recalculating statistics for all guilds");
    } catch (error) {
      logger.error("Error in recalculateExistingGuildStatistics:", error);
      throw error;
    }
  }

  // Migrate existing guilds to add WarcraftLogs guild ID
  // This checks all guilds and fetches the WCL guild ID for any that are missing it
  async migrateGuildsWarcraftLogsId(): Promise<void> {
    logger.info("Migrating guilds to add WarcraftLogs guild ID...");

    try {
      // Find all guilds that don't have a warcraftlogsId
      const guildsWithoutWclId = await Guild.find({
        $or: [{ warcraftlogsId: { $exists: false } }, { warcraftlogsId: null }],
      });

      if (guildsWithoutWclId.length === 0) {
        logger.info("All guilds already have WarcraftLogs guild ID, no migration needed");
        return;
      }

      logger.info(`Found ${guildsWithoutWclId.length} guilds missing WarcraftLogs guild ID`);

      // Process each guild
      for (const guild of guildsWithoutWclId) {
        try {
          getGuildLogger(guild.name, guild.realm).info("Fetching WarcraftLogs guild ID...");

          const guildDetails = await wclService.getGuildDetails(guild.name, guild.realm.toLowerCase().replace(/\s+/g, "-"), guild.region.toLowerCase());

          if (guildDetails.guildData?.guild?.id) {
            guild.warcraftlogsId = guildDetails.guildData.guild.id;
            getGuildLogger(guild.name, guild.realm).info(`✅ WarcraftLogs guild ID: ${guild.warcraftlogsId}`);

            // Also update faction if available and not already set
            if (guildDetails.guildData.guild.faction?.name && !guild.faction) {
              guild.faction = guildDetails.guildData.guild.faction.name;
              getGuildLogger(guild.name, guild.realm).info(`Updated faction: ${guild.faction}`);
            }

            // Save the guild with the updated ID
            await guild.save();
            getGuildLogger(guild.name, guild.realm).info("Saved successfully");
          } else {
            getGuildLogger(guild.name, guild.realm).warn("⚠️  Could not fetch WarcraftLogs guild ID from API");
          }
        } catch (error) {
          getGuildLogger(guild.name, guild.realm).error("Error fetching WarcraftLogs guild ID:", error instanceof Error ? error.message : "Unknown error");
          // Continue with next guild even if one fails
        }
      }

      logger.info("Finished migrating guilds WarcraftLogs guild IDs");
    } catch (error) {
      logger.error("Error in migrateGuildsWarcraftLogsId:", error);
      throw error;
    }
  }

  // Fetch and update a single guild's progress
  async updateGuildProgress(guildId: string): Promise<IGuild | null> {
    const guild = await Guild.findById(guildId);
    if (!guild) {
      logger.error(`Guild not found: ${guildId}`);
      return null;
    }

    getGuildLogger(guild.name, guild.realm).info("Updating guild progress");

    try {
      // Determine if this is an initial fetch by checking if guild has any reports at all
      const hasAnyReports = await Report.exists({ guildId: guild._id });
      const isInitialFetch = !hasAnyReports;

      // Fetch reports and process - scope depends on whether initial or update
      // Note: performUpdate now handles raiding status internally
      const hasNewData = await this.fetchAndProcessReports(guild, isInitialFetch);

      // For initial fetch, ensure raiding status is set to false
      if (isInitialFetch) {
        guild.isCurrentlyRaiding = false;
      }

      guild.lastFetched = new Date();
      await guild.save();

      // Update world rankings only if there was new data and only for current raid
      if (hasNewData && isInitialFetch) {
        // Initial fetch: update ranks for all raids with progress, then calculate guild rankings
        await this.updateGuildWorldRankings(guildId);
        await this.calculateGuildRankingsForAllRaids();
      } else if (hasNewData && !isInitialFetch) {
        // Update: only update rank for current raids if not completed
        await this.updateCurrentRaidsWorldRanking(guildId);
        for (const raidId of CURRENT_RAID_IDS) {
          await this.calculateGuildRankingsForRaid(raidId);
        }
      }

      getGuildLogger(guild.name, guild.realm).info("Successfully updated guild progress");
      return guild;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      getGuildLogger(guild.name, guild.realm).error("Error updating guild:", errorMessage);

      // Classify the error for better handling
      const { classifyError, ErrorType } = require("../utils/error-classifier");
      const classifiedError = classifyError(errorMessage);

      // If guild not found on WarcraftLogs, mark it and don't retry automatically
      if (classifiedError.type === ErrorType.GUILD_NOT_FOUND) {
        getGuildLogger(guild.name, guild.realm).warn("Guild not found on WarcraftLogs, marking as not_found");
        await Guild.findByIdAndUpdate(guild._id, {
          wclStatus: "not_found",
          wclStatusUpdatedAt: new Date(),
          $inc: { wclNotFoundCount: 1 },
        });
      }

      return null;
    }
  }

  // Fetch and log guild zone rankings for debugging
  async fetchGuildZoneRankings(guildId: string, zoneId?: number): Promise<void> {
    const guild = await Guild.findById(guildId);
    if (!guild) {
      logger.error(`Guild not found: ${guildId}`);
      return;
    }

    const guildLog = getGuildLogger(guild.name, guild.realm);
    guildLog.info(`\n========== FETCHING ZONE RANKINGS ==========`);

    // If no zoneId specified, use the first current raid
    const targetZoneId = zoneId || CURRENT_RAID_IDS[0];

    try {
      // Get raid info
      const raid = await this.getRaidData(targetZoneId);
      if (!raid) {
        logger.error(`Raid not found for zone ID: ${targetZoneId}`);
        return;
      }

      guildLog.info(`Raid: ${raid.name} (Zone ID: ${targetZoneId})`);
      guildLog.info(`Bosses: ${raid.bosses?.length || 0}\n`);

      try {
        const result = await wclService.getGuildZoneRanking(guild.name, guild.realm.toLowerCase().replace(/\s+/g, "-"), guild.region.toLowerCase(), targetZoneId);

        // Debug: Log the entire result structure
        guildLog.info(`Full API Response:`);
        guildLog.info(JSON.stringify(result, null, 2));

        // Access the ranking data
        const zoneRanking = result.guildData?.guild?.zoneRanking;

        if (zoneRanking?.progress?.worldRank) {
          const worldRank = zoneRanking.progress.worldRank;
          guildLog.info(`\n✅ World Progress Rank: #${worldRank.number} (${worldRank.color})`);
        } else {
          guildLog.info(`\n⚠️  No world rank data found`);
        }
      } catch (error) {
        guildLog.error(`Error fetching rankings:`, error);
      }

      guildLog.info(`\n========== END ZONE RANKINGS ==========\n`);
    } catch (error) {
      guildLog.error(`Error in fetchGuildZoneRankings:`, error);
    }
  }

  // Update world rankings for all raids the guild has progress in
  async updateGuildWorldRankings(guildId: string): Promise<void> {
    const guild = await Guild.findById(guildId);
    if (!guild) {
      logger.error(`Guild not found: ${guildId}`);
      return;
    }

    const guildLog = getGuildLogger(guild.name, guild.realm);
    guildLog.info("Updating world rankings...");

    // Only update rankings for raids where the guild has made progress
    // Progress is counted if either mythic or heroic bosses have been defeated
    const raidsWithProgress = guild.progress.filter((p) => (p.difficulty === "mythic" || p.difficulty === "heroic") && p.bossesDefeated > 0);

    if (raidsWithProgress.length === 0) {
      guildLog.info("No raids with progress, skipping world rank update");
      return;
    }

    for (const raidProgress of raidsWithProgress) {
      try {
        guildLog.info(`Fetching world rank for ${raidProgress.raidName}...`);

        const result = await wclService.getGuildZoneRanking(guild.name, guild.realm.toLowerCase().replace(/\s+/g, "-"), guild.region.toLowerCase(), raidProgress.raidId);

        const worldRank = result.guildData?.guild?.zoneRanking?.progress?.worldRank;

        if (worldRank?.number) {
          // Update the world rank in the guild's progress
          raidProgress.worldRank = worldRank.number;
          raidProgress.worldRankColor = worldRank.color;
          guildLog.info(`${raidProgress.raidName}: World Rank #${worldRank.number} (${worldRank.color})`);
        } else {
          guildLog.info(`${raidProgress.raidName}: No world rank data available`);
        }
      } catch (error) {
        guildLog.error(`Error fetching world rank for ${raidProgress.raidName}:`, error);
      }
    }

    // Save the updated guild with world rankings
    await guild.save();
    guildLog.info("World rankings updated and saved");
  }

  // Update world rankings for all current raids
  // Skip if guild has completed the raid (all mythic bosses defeated)
  async updateCurrentRaidsWorldRanking(guildId: string): Promise<void> {
    const guild = await Guild.findById(guildId);
    if (!guild) {
      logger.error(`Guild not found: ${guildId}`);
      return;
    }

    const guildLog = getGuildLogger(guild.name, guild.realm);
    guildLog.info("Updating world ranks for current raids...");

    for (const raidId of CURRENT_RAID_IDS) {
      // Find the raid data to get total boss count
      const raidData = await this.getRaidData(raidId);
      if (!raidData) {
        guildLog.warn(`Raid data not found (ID: ${raidId}), skipping world rank update`);
        continue;
      }

      // Find mythic progress for this raid
      const mythicProgress = guild.progress.find((p) => p.raidId === raidId && p.difficulty === "mythic");

      if (!mythicProgress) {
        guildLog.info(`No mythic progress for raid ${raidId}, skipping world rank update`);
        continue;
      }

      // Check if guild has completed all mythic bosses
      const hasCompletedMythic = mythicProgress.bossesDefeated >= raidData.bosses.length;

      if (hasCompletedMythic) {
        guildLog.info(`Has completed raid ${raidId} mythic (${mythicProgress.bossesDefeated}/${raidData.bosses.length}), world rank is final - skipping update`);
        continue;
      }

      guildLog.info(`Updating world rank for raid ${raidId} (${mythicProgress.raidName})...`);

      try {
        const result = await wclService.getGuildZoneRanking(guild.name, guild.realm.toLowerCase().replace(/\s+/g, "-"), guild.region.toLowerCase(), raidId);

        const worldRank = result.guildData?.guild?.zoneRanking?.progress?.worldRank;

        if (worldRank?.number) {
          // Update the world rank in mythic progress
          mythicProgress.worldRank = worldRank.number;
          mythicProgress.worldRankColor = worldRank.color;
          guildLog.info(`${mythicProgress.raidName}: World Rank #${worldRank.number} (${worldRank.color})`);
        } else {
          guildLog.info(`${mythicProgress.raidName}: No world rank data available`);
        }
      } catch (error) {
        guildLog.error(`Error fetching world rank for raid ${raidId}:`, error);
      }
    }

    // Save the updated guild
    await guild.save();
    guildLog.info("Current raids world ranks updated");
  }

  // Calculate guild rankings for all tracked raids
  async calculateGuildRankingsForAllRaids(): Promise<void> {
    logger.info("Calculating guild rankings for all tracked raids...");

    for (const raidId of TRACKED_RAIDS) {
      await this.calculateGuildRankingsForRaid(raidId);
    }

    logger.info("Guild rankings calculation complete for all raids");
  }

  // Calculate guild rankings for a specific raid
  // Rankings are calculated per difficulty (mythic and heroic separately)
  async calculateGuildRankingsForRaid(raidId: number): Promise<void> {
    logger.info(`Calculating guild rankings for raid ${raidId}...`);

    // Get all guilds (need documents to save, so no .lean())
    const guilds = await Guild.find();

    if (guilds.length === 0) {
      logger.info("No guilds found, skipping ranking calculation");
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
        logger.info(`No guilds with progress for raid ${raidId} ${difficulty}, skipping ranking`);
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

      logger.info(`Ranked ${sortedPairs.length} guilds for raid ${raidId} ${difficulty}`);
    }
  }

  // Fetch reports for a guild and process both Mythic and Heroic from the same data
  // Returns true if new data was found and processed
  private async fetchAndProcessReports(guild: IGuild, isInitialFetch: boolean): Promise<boolean> {
    let hasNewData = false;

    if (isInitialFetch) {
      // Initial fetch: Get ALL reports across all content, filter by tracked raid bosses
      getGuildLogger(guild.name, guild.realm).info("INITIAL FETCH - fetching all historical reports");
      hasNewData = await this.performInitialFetch(guild);

      // Calculate statistics from database fights for ALL tracked raids (initial setup)
      await this.calculateGuildStatistics(guild, null);
    } else {
      // Update: Only check the current raids for new reports
      getGuildLogger(guild.name, guild.realm).info(`UPDATE - checking only current raids (IDs: ${CURRENT_RAID_IDS.join(", ")})`);
      hasNewData = await this.performUpdate(guild);

      // Only recalculate statistics for the current raids if we found new data
      if (hasNewData) {
        for (const raidId of CURRENT_RAID_IDS) {
          await this.calculateGuildStatistics(guild, raidId);
        }
      } else {
        getGuildLogger(guild.name, guild.realm).info("No new data for current raids, skipping statistics recalculation");
      }
    }

    return hasNewData;
  }

  // Initial fetch: Get ALL reports for guild (no zone filter), save to DB
  // Returns true if any data was found and saved
  private async performInitialFetch(guild: IGuild): Promise<boolean> {
    const guildLog = getGuildLogger(guild.name, guild.realm);
    guildLog.info("Performing initial fetch of all reports");

    // Fetch WarcraftLogs guild ID (only during initial fetch)
    if (!guild.warcraftlogsId) {
      guildLog.info("Fetching WarcraftLogs guild ID...");
      try {
        const guildDetails = await wclService.getGuildDetails(guild.name, guild.realm.toLowerCase().replace(/\s+/g, "-"), guild.region.toLowerCase());

        if (guildDetails.guildData?.guild?.id) {
          guild.warcraftlogsId = guildDetails.guildData.guild.id;
          guildLog.info(`WarcraftLogs guild ID: ${guild.warcraftlogsId}`);

          // Also update faction if available
          if (guildDetails.guildData.guild.faction?.name && !guild.faction) {
            guild.faction = guildDetails.guildData.guild.faction.name;
            guildLog.info(`Updated faction: ${guild.faction}`);
          }
        } else {
          guildLog.warn("Could not fetch WarcraftLogs guild ID");
        }
      } catch (error) {
        guildLog.error("Error fetching WarcraftLogs guild ID:", error instanceof Error ? error.message : "Unknown error");
      }
    }

    // Get valid boss encounter IDs from all tracked raids
    const validBossIds = await this.getValidBossEncounterIds();
    guildLog.info(`Tracking ${validBossIds.size} boss encounters across ${TRACKED_RAIDS.length} raids`);

    const reportsPerPage = 10;
    let page = 1;
    const maxPages = 500; // Fetch up to 5000 reports maximum
    let totalReportsFetched = 0;
    let totalFightsSaved = 0;

    while (page <= maxPages) {
      const data = await wclService.getGuildReportsWithFights(guild.name, guild.realm.toLowerCase().replace(/\s+/g, "-"), guild.region.toLowerCase(), reportsPerPage, page, true);

      if (!data.reportData?.reports?.data || data.reportData.reports.data.length === 0) {
        guildLog.info(`No more reports found at page ${page}`);
        break;
      }

      // Update guild faction if available (only on first page)
      if (page === 1 && data.guildData?.guild?.faction?.name) {
        guild.faction = data.guildData.guild.faction.name;
      }

      const pageReports = data.reportData.reports.data;
      guildLog.info(`Page ${page}: fetched ${pageReports.length} reports`);

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
          { upsert: true, new: true },
        );

        totalReportsFetched++;

        // Process fights in this report
        if (report.fights && report.fights.length > 0) {
          const encounterPhases = report.phases || [];

          // Get fight IDs for tracked raid bosses only
          const trackedFightIds: number[] = [];
          for (const fight of report.fights) {
            if (validBossIds.has(fight.encounterID)) {
              trackedFightIds.push(fight.id);
            }
          }

          // Fetch death events for all tracked fights in this report (single API call)
          let deathsByFight = new Map<number, any[]>();
          if (this.fetchDeathEvents && trackedFightIds.length > 0) {
            try {
              const deathData = await wclService.getDeathEventsForReport(report.code, trackedFightIds);
              if (deathData.reportData?.report) {
                const actors = deathData.reportData.report.masterData?.actors || [];
                deathsByFight = wclService.parseDeathEventsByFight(deathData.reportData.report, actors, report.fights);
              }
            } catch (error: any) {
              guildLog.warn(`Failed to fetch deaths for report ${report.code}: ${error.message}`);
            }
          }

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

            // Get deaths for this fight
            const deaths = deathsByFight.get(fight.id) || [];

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
                deaths: deaths,
                reportStartTime: report.startTime,
                reportEndTime: report.endTime || 0,
                fightStartTime: fight.startTime,
                fightEndTime: fight.endTime,
                duration: duration,
                timestamp: fightTimestamp,
              },
              { upsert: true, new: true },
            );

            totalFightsSaved++;
          }
        }
      }

      if (pageReports.length < reportsPerPage) {
        guildLog.info(`Reached last page at page ${page}`);
        break;
      }

      page++;
    }

    // Update the guild's lastLogEndTime from the database (find most recent report)
    const mostRecentReport = await Report.findOne({ guildId: guild._id }).sort({ endTime: -1 }).limit(1);

    if (mostRecentReport && mostRecentReport.endTime) {
      guild.lastLogEndTime = new Date(mostRecentReport.endTime);
      guildLog.info(`Set lastLogEndTime to ${guild.lastLogEndTime.toISOString()}`);
    }

    guildLog.info(`Initial fetch complete: ${totalReportsFetched} reports, ${totalFightsSaved} fights saved`);
    return totalFightsSaved > 0;
  }

  // Thoroughly refetch the 3 newest reports to ensure all fights are captured
  // This is called when a guild stops raiding to catch any fights that were missed during live polling
  private async thoroughlyRefetchNewestReports(guild: IGuild): Promise<number> {
    const guildLog = getGuildLogger(guild.name, guild.realm);
    guildLog.info("⚠️  THOROUGHLY REFETCHING 3 newest reports to ensure completeness...");

    let totalNewFights = 0;

    // Get the 3 most recent reports WITHOUT filtering by zone
    // This is critical because WCL might tag a report with a different zone than we expect
    const checkData = await wclService.getRecentReports(guild.name, guild.realm.toLowerCase().replace(/\s+/g, "-"), guild.region.toLowerCase(), 3);

    if (!checkData.reportData?.reports?.data || checkData.reportData.reports.data.length === 0) {
      guildLog.info("No reports found");
      return 0;
    }

    const recentReports = checkData.reportData.reports.data;
    guildLog.info(`Thoroughly refetching ${recentReports.length} reports...`);

    // Get valid boss encounter IDs for all current raids
    const validBossIds = await this.getValidBossEncounterIdsForCurrentRaids();

    for (const reportSummary of recentReports) {
      const code = reportSummary.code;

      // Fetch the full report with all fights
      const reportData = await wclService.getReportByCodeAllDifficulties(code);

      if (!reportData.reportData?.report) {
        guildLog.info(`Failed to fetch report ${code}`);
        continue;
      }

      const report = reportData.reportData.report;
      const currentTime = Date.now();
      const reportEndTime = report.endTime || 0;
      const THIRTY_MINUTES_MS = 30 * 60 * 1000;
      const isLive = reportEndTime && currentTime - reportEndTime < THIRTY_MINUTES_MS;

      // Get existing fights for this report
      const existingFights = await Fight.find({
        reportCode: report.code,
        guildId: guild._id,
      }).select("fightId");

      const existingFightIds = new Set(existingFights.map((f) => f.fightId));
      const totalFightsInReport = report.fights?.length || 0;

      guildLog.info(`Report ${code}: ${existingFightIds.size} fights in DB, ${totalFightsInReport} fights in report`);

      // Determine the zone/raid ID from the fights in the report
      // We'll use the first boss encounter we find to determine the zone
      let reportZoneId = 0;
      if (report.fights && report.fights.length > 0) {
        for (const fight of report.fights) {
          if (validBossIds.has(fight.encounterID)) {
            // Find which raid this boss belongs to
            for (const raidId of CURRENT_RAID_IDS) {
              const raidBossIds = await this.getValidBossEncounterIdsForRaid(raidId);
              if (raidBossIds.has(fight.encounterID)) {
                reportZoneId = raidId;
                break;
              }
            }
            if (reportZoneId) break;
          }
        }
      }

      // Update report metadata with accurate fight count
      await Report.findOneAndUpdate(
        { code: report.code },
        {
          code: report.code,
          guildId: guild._id,
          zoneId: reportZoneId, // Use the zone we detected from fights
          startTime: report.startTime,
          endTime: reportEndTime,
          isOngoing: isLive,
          fightCount: totalFightsInReport,
          lastProcessed: new Date(),
        },
        { upsert: true, new: true },
      );

      // Process all fights from the report
      if (report.fights && report.fights.length > 0) {
        const encounterPhases = report.phases || [];
        let newFightsInThisReport = 0;

        // Get fight IDs for tracked raid bosses only
        const trackedFightIds: number[] = [];
        for (const fight of report.fights) {
          if (validBossIds.has(fight.encounterID)) {
            trackedFightIds.push(fight.id);
          }
        }

        // Fetch death events for all tracked fights in this report (single API call)
        let deathsByFight = new Map<number, any[]>();
        if (this.fetchDeathEvents && trackedFightIds.length > 0) {
          try {
            const deathData = await wclService.getDeathEventsForReport(report.code, trackedFightIds);
            if (deathData.reportData?.report) {
              const actors = deathData.reportData.report.masterData?.actors || [];
              deathsByFight = wclService.parseDeathEventsByFight(deathData.reportData.report, actors, report.fights);
            }
          } catch (error: any) {
            guildLog.warn(`Failed to fetch deaths for report ${report.code}: ${error.message}`);
          }
        }

        for (const fight of report.fights) {
          const encounterId = fight.encounterID;

          // Only save fights for current raid bosses
          if (!validBossIds.has(encounterId)) {
            continue;
          }

          // Determine which raid this fight belongs to
          let fightZoneId = 0;
          for (const raidId of CURRENT_RAID_IDS) {
            const raidBossIds = await this.getValidBossEncounterIdsForRaid(raidId);
            if (raidBossIds.has(encounterId)) {
              fightZoneId = raidId;
              break;
            }
          }

          if (!fightZoneId) {
            continue; // Skip if we can't determine the zone
          }

          // Skip if we already have this fight
          if (existingFightIds.has(fight.id)) {
            continue;
          }

          const bossPercent = fight.bossPercentage || 0;
          const fightPercent = fight.fightPercentage || 0;
          const duration = fight.endTime - fight.startTime;
          const difficulty = fight.difficulty;

          // Determine phase information
          const phaseInfo = wclService.determinePhaseInfo(fight, encounterPhases);

          // Get deaths for this fight
          const deaths = deathsByFight.get(fight.id) || [];

          // Save fight to database
          const fightTimestamp = new Date(report.startTime + fight.startTime);
          await Fight.findOneAndUpdate(
            { reportCode: report.code, fightId: fight.id },
            {
              reportCode: report.code,
              guildId: guild._id,
              fightId: fight.id,
              zoneId: fightZoneId, // Use the zone we detected for this specific fight
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
              deaths: deaths,
              reportStartTime: report.startTime,
              reportEndTime: reportEndTime,
              fightStartTime: fight.startTime,
              fightEndTime: fight.endTime,
              duration: duration,
              timestamp: fightTimestamp,
            },
            { upsert: true, new: true },
          );

          newFightsInThisReport++;
          totalNewFights++;
        }

        if (newFightsInThisReport > 0) {
          guildLog.info(`Report ${code}: saved ${newFightsInThisReport} NEW fights that were previously missing`);
        }
      }
    }

    guildLog.info(`Thorough refetch complete: ${totalNewFights} total new fights recovered`);

    // Always recalculate statistics to ensure accuracy, even if no new fights were found
    guildLog.info("Recalculating statistics for all current raids...");
    for (const raidId of CURRENT_RAID_IDS) {
      await this.calculateGuildStatistics(guild, raidId);
    }
    guildLog.info("Statistics recalculated");

    return totalNewFights;
  }

  // Refetch recent reports for all active guilds in current raid tiers
  // This is useful to catch any fights that might have been missed during live polling
  async refetchRecentReportsForAllActiveGuilds(): Promise<void> {
    logger.info("[Refetch/Recent] Starting refetch of recent reports for all active guilds...");

    try {
      // Get all active guilds (excluding guilds not found on WCL)
      const guilds = await Guild.find({
        activityStatus: "active",
        wclStatus: { $ne: "not_found" },
      });

      if (guilds.length === 0) {
        logger.info("[Refetch/Recent] No active guilds found");
        return;
      }

      logger.info(`[Refetch/Recent] Refetching recent reports for ${guilds.length} active guild(s)...`);

      let totalRecoveredFights = 0;

      for (let i = 0; i < guilds.length; i++) {
        const guild = guilds[i];
        const guildLog = getGuildLogger(guild.name, guild.realm);
        logger.info(`[Refetch/Recent] Guild ${i + 1}/${guilds.length}: ${guild.name}`);

        try {
          const recoveredFights = await this.thoroughlyRefetchNewestReports(guild);

          if (recoveredFights > 0) {
            guildLog.info(`✅ Recovered ${recoveredFights} missing fights`);
            totalRecoveredFights += recoveredFights;
          } else {
            guildLog.info("No missing fights found (statistics still recalculated)");
          }

          // Small delay to avoid overwhelming the API
          if (i < guilds.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        } catch (error) {
          guildLog.error(`Failed to refetch recent reports:`, error);
          // Continue with next guild even if one fails
        }
      }

      logger.info(`[Refetch/Recent] Completed: ${totalRecoveredFights} total fights recovered across all guilds`);
    } catch (error) {
      logger.error("[Refetch/Recent] Error:", error);
    }
  }

  // Update: Check only the current raids for new reports
  // Returns true if new data was found and saved
  private async performUpdate(guild: IGuild): Promise<boolean> {
    const guildLog = getGuildLogger(guild.name, guild.realm);
    guildLog.info("Checking for updates...");

    // Get valid boss encounter IDs for all current raids
    const validBossIds = await this.getValidBossEncounterIdsForCurrentRaids();
    guildLog.info(`Current raids have ${validBossIds.size} total bosses to track`);

    let hasLiveLog = false;
    const allReportsToFetch: Array<{ code: string }> = [];
    const currentTime = Date.now();
    const THIRTY_MINUTES_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

    // Get the 3 most recent reports WITHOUT filtering by zone
    // This is critical because WCL might tag a report with a different zone than we expect
    const checkData = await wclService.getRecentReports(guild.name, guild.realm.toLowerCase().replace(/\s+/g, "-"), guild.region.toLowerCase(), 3);

    if (!checkData.reportData?.reports?.data || checkData.reportData.reports.data.length === 0) {
      guildLog.info("No reports found");
      return false;
    }

    const recentReports = checkData.reportData.reports.data;

    // Determine which reports are "live" (endTime within 30 minutes) or new
    for (const report of recentReports) {
      const reportCode = report.code;
      const endTime = report.endTime;
      const startTime = report.startTime;

      // Check if we already have this report in our database
      const existingReport = await Report.findOne({
        code: reportCode,
        guildId: guild._id,
      });

      // If endTime is within 30 minutes of now, it's a live log
      const isLive = endTime && currentTime - endTime < THIRTY_MINUTES_MS;

      if (isLive) {
        hasLiveLog = true;
        guildLog.info(`Report ${reportCode} is LIVE (endTime: ${new Date(endTime).toISOString()}, ${Math.round((currentTime - endTime) / 1000)}s ago)`);
        allReportsToFetch.push({ code: reportCode });
      } else if (!existingReport) {
        // New report we haven't seen before
        guildLog.info(`Report ${reportCode} is NEW (not in database)`);
        allReportsToFetch.push({ code: reportCode });
      } else if (existingReport) {
        // For existing reports, check multiple conditions that might indicate new data:
        let shouldRefetch = false;
        let reason = "";

        // 1. Check if endTime has changed (report was extended)
        const lastKnownEndTime = existingReport.endTime || 0;
        if (endTime && endTime > lastKnownEndTime) {
          shouldRefetch = true;
          reason = `endTime changed from ${new Date(lastKnownEndTime).toISOString()} to ${new Date(endTime).toISOString()}`;
        }

        // 2. Check if we might be missing fights by comparing stored count with actual fights in DB
        // This catches cases where we fetched a live report before all fights were uploaded
        if (!shouldRefetch && existingReport.fightCount) {
          const actualFightsInDb = await Fight.countDocuments({
            reportCode: reportCode,
            guildId: guild._id,
            encounterID: { $in: Array.from(validBossIds) }, // Only count fights for current raids
          });

          // If we have fewer fights in DB than the report claimed to have, refetch
          // Allow a small margin (fights from other content might be filtered out)
          if (actualFightsInDb < existingReport.fightCount - 5) {
            shouldRefetch = true;
            reason = `possible missing fights (${actualFightsInDb} in DB vs ${existingReport.fightCount} reported)`;
          }
        }

        if (shouldRefetch) {
          guildLog.info(`Report ${reportCode} needs REFETCH: ${reason}`);
          allReportsToFetch.push({ code: reportCode });
        }
      }
    }

    // Update guild raiding status based on whether we found a live log
    const wasRaiding = guild.isCurrentlyRaiding;
    guild.isCurrentlyRaiding = hasLiveLog;
    if (wasRaiding !== guild.isCurrentlyRaiding) {
      guildLog.info(`Raiding status changed: ${guild.isCurrentlyRaiding ? "STARTED" : "STOPPED"} raiding`);

      // CRITICAL FIX: When guild stops raiding, do a thorough refetch of the 3 newest reports
      // This ensures we catch any fights that were missed during live polling
      if (!guild.isCurrentlyRaiding && wasRaiding) {
        guildLog.info("⚠️  Guild just STOPPED raiding - performing thorough refetch of newest reports...");
        const recoveredFights = await this.thoroughlyRefetchNewestReports(guild);

        if (recoveredFights > 0) {
          guildLog.info(`✅ Recovered ${recoveredFights} missing fights (statistics already recalculated)`);
          return true; // We found and processed new data
        } else {
          guildLog.info("No missing fights found (statistics already recalculated)");
        }
      }
    }

    if (allReportsToFetch.length === 0) {
      guildLog.info("No new or live reports to process");
      return false;
    }

    guildLog.info(`Found ${allReportsToFetch.length} reports to process`);

    let totalFightsSaved = 0;

    // Fetch and save each report
    for (const { code } of allReportsToFetch) {
      const reportData = await wclService.getReportByCodeAllDifficulties(code);

      if (!reportData.reportData?.report) {
        guildLog.info(`Failed to fetch report ${code}`);
        continue;
      }

      const report = reportData.reportData.report;
      const reportEndTime = report.endTime || 0;
      const isLive = reportEndTime && currentTime - reportEndTime < THIRTY_MINUTES_MS;

      // Get existing fights for this report to avoid duplicates
      const existingFights = await Fight.find({
        reportCode: report.code,
        guildId: guild._id,
      }).select("fightId");

      const existingFightIds = new Set(existingFights.map((f) => f.fightId));

      const totalFightsInReport = report.fights?.length || 0;
      guildLog.info(`Report ${code}: ${existingFightIds.size} fights already in database, ${totalFightsInReport} fights in report`);

      // Determine the zone/raid ID from the fights in the report
      let reportZoneId = 0;
      if (report.fights && report.fights.length > 0) {
        for (const fight of report.fights) {
          if (validBossIds.has(fight.encounterID)) {
            // Find which raid this boss belongs to
            for (const raidId of CURRENT_RAID_IDS) {
              const raidBossIds = await this.getValidBossEncounterIdsForRaid(raidId);
              if (raidBossIds.has(fight.encounterID)) {
                reportZoneId = raidId;
                break;
              }
            }
            if (reportZoneId) break;
          }
        }
      }

      // Save report metadata with accurate fight count for later comparison
      await Report.findOneAndUpdate(
        { code: report.code },
        {
          code: report.code,
          guildId: guild._id,
          zoneId: reportZoneId, // Use the zone we detected from fights
          startTime: report.startTime,
          endTime: reportEndTime,
          isOngoing: isLive,
          fightCount: totalFightsInReport, // Store total fight count to detect missing fights later
          lastProcessed: new Date(),
        },
        { upsert: true, new: true },
      );

      // Process fights
      if (report.fights && report.fights.length > 0) {
        const encounterPhases = report.phases || [];
        let newFightsInThisReport = 0;

        // Get fight IDs for tracked raid bosses only
        const trackedFightIds: number[] = [];
        for (const fight of report.fights) {
          if (validBossIds.has(fight.encounterID)) {
            trackedFightIds.push(fight.id);
          }
        }

        // Fetch death events for all tracked fights in this report (single API call)
        let deathsByFight = new Map<number, any[]>();
        if (this.fetchDeathEvents && trackedFightIds.length > 0) {
          try {
            const deathData = await wclService.getDeathEventsForReport(report.code, trackedFightIds);
            if (deathData.reportData?.report) {
              const actors = deathData.reportData.report.masterData?.actors || [];
              deathsByFight = wclService.parseDeathEventsByFight(deathData.reportData.report, actors, report.fights);
            }
          } catch (error: any) {
            guildLog.warn(`Failed to fetch deaths for report ${report.code}: ${error.message}`);
          }
        }

        for (const fight of report.fights) {
          const encounterId = fight.encounterID;

          // Only save fights for current raid bosses
          if (!validBossIds.has(encounterId)) {
            continue;
          }

          // Determine which raid this fight belongs to
          let fightZoneId = 0;
          for (const raidId of CURRENT_RAID_IDS) {
            const raidBossIds = await this.getValidBossEncounterIdsForRaid(raidId);
            if (raidBossIds.has(encounterId)) {
              fightZoneId = raidId;
              break;
            }
          }

          if (!fightZoneId) {
            continue; // Skip if we can't determine the zone
          }

          // Skip if we already have this fight
          if (existingFightIds.has(fight.id)) {
            continue;
          }

          const bossPercent = fight.bossPercentage || 0;
          const fightPercent = fight.fightPercentage || 0;
          const duration = fight.endTime - fight.startTime;
          const difficulty = fight.difficulty;

          // Determine phase information
          const phaseInfo = wclService.determinePhaseInfo(fight, encounterPhases);

          // Get deaths for this fight
          const deaths = deathsByFight.get(fight.id) || [];

          // Save fight to database
          const fightTimestamp = new Date(report.startTime + fight.startTime);
          await Fight.findOneAndUpdate(
            { reportCode: report.code, fightId: fight.id },
            {
              reportCode: report.code,
              guildId: guild._id,
              fightId: fight.id,
              zoneId: fightZoneId, // Use the zone we detected for this specific fight
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
              deaths: deaths,
              reportStartTime: report.startTime,
              reportEndTime: reportEndTime,
              fightStartTime: fight.startTime,
              fightEndTime: fight.endTime,
              duration: duration,
              timestamp: fightTimestamp,
            },
            { upsert: true, new: true },
          );

          newFightsInThisReport++;
          totalFightsSaved++;
        }

        guildLog.info(`Report ${code}: saved ${newFightsInThisReport} new fights`);
      }
    }

    // Update the guild's lastLogEndTime with the most recent report's end time across all raids
    const mostRecentReport = await Report.findOne({ guildId: guild._id }).sort({ endTime: -1 }).limit(1);

    if (mostRecentReport && mostRecentReport.endTime) {
      const newLastLogEndTime = new Date(mostRecentReport.endTime);

      // Only update if it's newer than what we have
      if (!guild.lastLogEndTime || newLastLogEndTime > guild.lastLogEndTime) {
        guild.lastLogEndTime = newLastLogEndTime;
        guildLog.info(`Updated lastLogEndTime to ${newLastLogEndTime.toISOString()}`);
      }
    }

    guildLog.info(`Update complete: ${allReportsToFetch.length} reports processed, ${totalFightsSaved} new fights saved`);
    return totalFightsSaved > 0;
  }

  // Calculate guild statistics from database fights
  // If raidId is provided, only calculate for that raid (used during updates)
  // If raidId is null, calculate for all tracked raids (used during initial fetch)
  async calculateGuildStatistics(guild: IGuild, raidId: number | null): Promise<void> {
    const guildLog = getGuildLogger(guild.name, guild.realm);
    if (raidId !== null) {
      guildLog.info(`Calculating statistics for current raid only (ID: ${raidId})`);

      const raidData = await this.getRaidData(raidId);
      if (!raidData) {
        guildLog.warn(`Raid data not found for zone ${raidId}, skipping`);
        return;
      }

      // Calculate for both difficulties
      await this.calculateRaidStatistics(guild, raidData, "mythic");
      await this.calculateRaidStatistics(guild, raidData, "heroic");
    } else {
      guildLog.info("Calculating statistics from database fights for all tracked raids");

      // Process each tracked raid
      for (const trackedRaidId of TRACKED_RAIDS) {
        const raidData = await this.getRaidData(trackedRaidId);
        if (!raidData) {
          guildLog.warn(`Raid data not found for zone ${trackedRaidId}, skipping`);
          continue;
        }

        // Calculate for both difficulties
        await this.calculateRaidStatistics(guild, raidData, "mythic");
        await this.calculateRaidStatistics(guild, raidData, "heroic");
      }
    }

    guildLog.info("Statistics calculation complete");

    // Calculate raiding schedule only when working with the current raid tier
    // For initial fetch (raidId === null), we calculate for all current raids after all stats
    // For updates (raidId in CURRENT_RAID_IDS), we calculate after current raid stats
    // This ensures schedules are always updated but only for the current tier
    const isCurrentRaid = raidId !== null && CURRENT_RAID_IDS.includes(raidId);
    if (raidId === null || isCurrentRaid) {
      // Calculate schedule for the first current raid (most recent)
      await this.calculateRaidingSchedule(guild, CURRENT_RAID_IDS[0]);
    }
  }

  // Calculate the guild's raiding schedule (days and hours) for the current raid tier
  private async calculateRaidingSchedule(guild: IGuild, raidId: number): Promise<void> {
    const guildLog = getGuildLogger(guild.name, guild.realm);
    guildLog.info(`Calculating raiding schedule for raid ID: ${raidId}`);

    try {
      // Get raid data to get the boss encounter IDs and date range
      const raidData = await this.getRaidData(raidId);
      if (!raidData) {
        guildLog.warn(`Raid data not found for zone ${raidId}, skipping schedule calculation`);
        return;
      }

      // Get valid boss encounter IDs for this raid
      const validBossIds = await this.getValidBossEncounterIdsForRaid(raidData.id);

      // Get the raid's date range for the guild's region
      const guildRegion = guild.region.toLowerCase();
      const raidStartDate = raidData.starts?.[guildRegion as keyof typeof raidData.starts];
      const raidEndDate = raidData.ends?.[guildRegion as keyof typeof raidData.ends];

      if (!raidStartDate && !raidEndDate) {
        guildLog.info(`No date range available for ${raidData.name}, skipping schedule calculation`);
        return;
      }

      // Get all fights for this raid's bosses only
      const fights = await Fight.find({
        guildId: guild._id as mongoose.Types.ObjectId,
        zoneId: raidData.id,
        encounterID: { $in: Array.from(validBossIds) },
      }).sort({ timestamp: 1 });

      if (fights.length === 0) {
        guildLog.info(`No fights found for ${raidData.name}, skipping schedule calculation`);
        return;
      }

      // Filter fights by date range
      let filteredFights = fights.filter((fight) => {
        const fightTimestamp = fight.timestamp;
        if (raidStartDate && fightTimestamp < raidStartDate) return false;
        if (raidEndDate && fightTimestamp > raidEndDate) return false;
        return true;
      });

      if (filteredFights.length === 0) {
        guildLog.info(`No fights in date range for ${raidData.name}, skipping schedule calculation`);
        return;
      }

      guildLog.info(`Processing ${filteredFights.length} fights for schedule calculation`);

      // Group fights by report to calculate accurate raid session times
      const reportSessions = new Map<
        string,
        {
          reportCode: string;
          reportStartTime: number;
          fights: typeof filteredFights;
        }
      >();

      for (const fight of filteredFights) {
        if (!reportSessions.has(fight.reportCode)) {
          reportSessions.set(fight.reportCode, {
            reportCode: fight.reportCode,
            reportStartTime: fight.reportStartTime,
            fights: [],
          });
        }
        reportSessions.get(fight.reportCode)!.fights.push(fight);
      }

      guildLog.info(`Found ${reportSessions.size} unique raid sessions (reports)`);

      // Helper function to convert UTC Date to Helsinki timezone components
      // Returns { hours, minutes, day } in Helsinki time
      const getHelsinkiTimeComponents = (date: Date): { hours: number; minutes: number; day: number } => {
        // Format the date in Helsinki timezone
        const helsinkiDateString = date.toLocaleString("en-US", {
          timeZone: "Europe/Helsinki",
          hour: "2-digit",
          minute: "2-digit",
          weekday: "short",
          hour12: false,
        });

        // Parse the formatted string to extract components
        // Format will be like "Thu, 19:00" or "Mon, 16:30"
        const parts = helsinkiDateString.split(" ");
        const dayName = parts[0]; // "Thu", "Mon", etc.
        const timeParts = parts[1].split(":");
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);

        // Convert day name to day number (0 = Sunday, 1 = Monday, etc.)
        const dayMap: { [key: string]: number } = {
          Sun: 0,
          Mon: 1,
          Tue: 2,
          Wed: 3,
          Thu: 4,
          Fri: 5,
          Sat: 6,
        };
        const day = dayMap[dayName];

        return { hours, minutes, day };
      };

      // Helper function to round time to nearest half hour in Helsinki timezone
      const roundToNearestHalfHour = (date: Date): number => {
        const { hours, minutes } = getHelsinkiTimeComponents(date);

        // Convert to decimal hours (e.g., 18:45 = 18.75)
        const decimalHours = hours + minutes / 60;

        // Round to nearest 0.5
        const rounded = Math.round(decimalHours * 2) / 2;

        return rounded;
      };

      // Calculate actual start and end times for each report
      interface RaidSession {
        startTime: Date;
        endTime: Date;
        day: string;
        startHour: number;
        endHour: number;
      }

      const raidSessions: RaidSession[] = [];

      for (const [reportCode, session] of reportSessions.entries()) {
        // Find earliest fightStartTime and latest fightEndTime in this report
        let earliestFightStart = Number.MAX_SAFE_INTEGER;
        let latestFightEnd = 0;

        for (const fight of session.fights) {
          if (fight.fightStartTime < earliestFightStart) {
            earliestFightStart = fight.fightStartTime;
          }
          if (fight.fightEndTime > latestFightEnd) {
            latestFightEnd = fight.fightEndTime;
          }
        }

        // Calculate actual start and end times
        // reportStartTime is in unix milliseconds
        // fightStartTime and fightEndTime are in milliseconds relative to report start
        const actualStartTime = new Date(session.reportStartTime + earliestFightStart);
        const actualEndTime = new Date(session.reportStartTime + latestFightEnd);

        // Get day of week and round hours to nearest half hour (in Helsinki timezone)
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const { day: dayIndex } = getHelsinkiTimeComponents(actualStartTime);
        const day = dayNames[dayIndex];
        const startHour = roundToNearestHalfHour(actualStartTime);
        const endHour = roundToNearestHalfHour(actualEndTime);

        raidSessions.push({
          startTime: actualStartTime,
          endTime: actualEndTime,
          day,
          startHour,
          endHour,
        });

        // Format hours for display (e.g., 18.5 -> "18:30", 19 -> "19:00")
        const formatHour = (hour: number): string => {
          const h = Math.floor(hour);
          const m = (hour % 1) * 60;
          return `${h}:${m.toString().padStart(2, "0")}`;
        };

        guildLog.info(`Report ${reportCode}: ${day} ${formatHour(startHour)}-${formatHour(endHour)} (${actualStartTime.toISOString()} to ${actualEndTime.toISOString()})`);
      }

      // Analyze raiding patterns - find most common day/time combinations
      interface DayTimeSlot {
        day: string;
        startHour: number;
        endHour: number;
        count: number;
      }

      const dayTimeMap = new Map<string, DayTimeSlot>();

      for (const session of raidSessions) {
        // Create a key for this day/time combination
        const key = `${session.day}:${session.startHour}:${session.endHour}`;

        if (!dayTimeMap.has(key)) {
          dayTimeMap.set(key, {
            day: session.day,
            startHour: session.startHour,
            endHour: session.endHour,
            count: 0,
          });
        }

        dayTimeMap.get(key)!.count++;
      }

      // Convert to array and sort by count (most common first)
      const allDayTimeSlots = Array.from(dayTimeMap.values()).sort((a, b) => b.count - a.count);

      guildLog.info(`Found ${allDayTimeSlots.length} unique day/time patterns:`);
      allDayTimeSlots.forEach((slot) => {
        const formatHour = (hour: number): string => {
          const h = Math.floor(hour);
          const m = (hour % 1) * 60;
          return `${h}:${m.toString().padStart(2, "0")}`;
        };
        guildLog.info(`  ${slot.day} ${formatHour(slot.startHour)}-${formatHour(slot.endHour)} (${slot.count} occurrences)`);
      });

      // Filter to get only the most likely days (no duplicates)
      // Keep only the most common time slot for each unique day
      const seenDays = new Set<string>();
      const mostLikelyDays: DayTimeSlot[] = [];

      for (const slot of allDayTimeSlots) {
        if (!seenDays.has(slot.day)) {
          seenDays.add(slot.day);
          mostLikelyDays.push(slot);
        }
      }

      guildLog.info(`Most likely raiding days (${mostLikelyDays.length} unique days):`);
      mostLikelyDays.forEach((slot) => {
        const formatHour = (hour: number): string => {
          const h = Math.floor(hour);
          const m = (hour % 1) * 60;
          return `${h}:${m.toString().padStart(2, "0")}`;
        };
        guildLog.info(`  ${slot.day} ${formatHour(slot.startHour)}-${formatHour(slot.endHour)} (${slot.count} occurrences)`);
      });

      // Filter out outliers based on relative raid count
      // Days with significantly fewer raids compared to the top days should be excluded
      let filteredDays = mostLikelyDays;

      if (mostLikelyDays.length > 0) {
        const maxRaidCount = mostLikelyDays[0].count; // Highest raid count (already sorted)

        // Calculate a threshold: keep days that have at least 40% of the max raid count
        // This helps filter out one-off or infrequent raid days
        const threshold = maxRaidCount * 0.4;

        const beforeFilterCount = mostLikelyDays.length;
        filteredDays = mostLikelyDays.filter((slot) => slot.count >= threshold);

        if (filteredDays.length < beforeFilterCount) {
          guildLog.info(
            `Filtered out ${beforeFilterCount - filteredDays.length} outlier day(s) with raid count < ${threshold.toFixed(1)} (${((threshold / maxRaidCount) * 100).toFixed(
              0,
            )}% of max ${maxRaidCount})`,
          );
          guildLog.info("Final raiding days after outlier filtering:");
          filteredDays.forEach((slot) => {
            const formatHour = (hour: number): string => {
              const h = Math.floor(hour);
              const m = (hour % 1) * 60;
              return `${h}:${m.toString().padStart(2, "0")}`;
            };
            guildLog.info(`  ${slot.day} ${formatHour(slot.startHour)}-${formatHour(slot.endHour)} (${slot.count} occurrences)`);
          });
        } else {
          guildLog.info("No outliers detected - all days have similar raid counts");
        }
      }

      // Additional filter: remove days with very low absolute raid counts (< 2)
      // This helps filter out guilds with irregular schedules that don't have a consistent raiding pattern
      const beforeAbsoluteFilterCount = filteredDays.length;
      filteredDays = filteredDays.filter((slot) => slot.count >= 2);

      if (filteredDays.length < beforeAbsoluteFilterCount) {
        guildLog.info(`Filtered out ${beforeAbsoluteFilterCount - filteredDays.length} day(s) with absolute raid count < 2 (irregular schedule)`);
        if (filteredDays.length === 0) {
          guildLog.info("No consistent raiding schedule detected - guild raids irregularly");
        } else {
          guildLog.info("Final raiding days after absolute count filtering:");
          filteredDays.forEach((slot) => {
            const formatHour = (hour: number): string => {
              const h = Math.floor(hour);
              const m = (hour % 1) * 60;
              return `${h}:${m.toString().padStart(2, "0")}`;
            };
            guildLog.info(`  ${slot.day} ${formatHour(slot.startHour)}-${formatHour(slot.endHour)} (${slot.count} occurrences)`);
          });
        }
      }

      // Save the raiding schedule (only most likely days, no duplicates, no outliers)
      guild.raidSchedule = {
        days: filteredDays.map((slot) => ({
          day: slot.day,
          startHour: slot.startHour,
          endHour: slot.endHour,
          raidCount: slot.count,
        })),
        lastCalculated: new Date(),
      };

      guild.markModified("raidSchedule");

      guildLog.info(`Raiding schedule calculated: ${filteredDays.length} unique days from ${raidSessions.length} raid sessions`);
    } catch (error) {
      guildLog.error("Error calculating raiding schedule:", error);
    }
  }

  // Calculate statistics for a specific raid and difficulty from database fights
  // IMPORTANT: This method now properly filters fights by the raid's boss encounter IDs
  // to prevent unrelated bosses from being included in the statistics
  private async calculateRaidStatistics(guild: IGuild, raidData: IRaid, difficulty: "mythic" | "heroic"): Promise<void> {
    const guildLog = getGuildLogger(guild.name, guild.realm);
    const difficultyId = difficulty === "mythic" ? DIFFICULTIES.MYTHIC : DIFFICULTIES.HEROIC;

    // Get valid boss encounter IDs for this specific raid
    const validBossIds = await this.getValidBossEncounterIdsForRaid(raidData.id);
    guildLog.info(`Valid boss IDs for ${raidData.name}: ${Array.from(validBossIds).join(", ")}`);

    // Get all fights from database for this guild, raid, and difficulty
    // IMPORTANT: Also filter by encounterID to ensure we only get bosses that belong to this raid
    const fights = await Fight.find({
      guildId: guild._id as mongoose.Types.ObjectId,
      zoneId: raidData.id,
      difficulty: difficultyId,
      encounterID: { $in: Array.from(validBossIds) }, // Only include fights for bosses in this raid
    }).sort({ timestamp: 1 }); // Sort by timestamp (oldest first) for proper kill order tracking

    if (fights.length === 0) {
      guildLog.info(`No ${difficulty} fights found for ${raidData.name}`);
      return;
    }

    guildLog.info(`Calculating ${difficulty} statistics from ${fights.length} fights for ${raidData.name}`);

    // Filter fights by raid's "current content" date range for the guild's region
    const guildRegion = guild.region.toLowerCase();
    let raidStartDate = raidData.starts?.[guildRegion as keyof typeof raidData.starts];
    let raidEndDate = raidData.ends?.[guildRegion as keyof typeof raidData.ends];

    // For older raids (pre-Legion) that don't have start/end dates in Raider.IO,
    // use very permissive dates so all fights are included
    if (!raidStartDate && !raidEndDate) {
      raidStartDate = new Date("1970-01-01T00:00:00Z"); // Very old date
      raidEndDate = new Date("2100-12-31T23:59:59Z"); // Very far future date
      guildLog.info(`No dates available for ${raidData.name} - using permissive date range (all fights included)`);
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
        guildLog.info(
          `Filtered out ${dateFilteredCount} ${difficulty} fights outside raid's current content window (${raidStartDate?.toISOString() || "no start"} to ${
            raidEndDate?.toISOString() || "no end"
          }) for region ${guildRegion}`,
        );
      }
    }

    if (filteredFights.length === 0) {
      guildLog.info(`No ${difficulty} fights remaining after date filtering for ${raidData.name}`);
      return;
    }

    guildLog.info(`Processing ${filteredFights.length} ${difficulty} fights (after date filtering) for ${raidData.name}`);

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
        bestPullReportCode?: string;
        bestPullFightId?: number;
        pullHistory: Array<{
          pullNumber: number;
          fightPercentage: number;
          phase?: string;
          isKill: boolean;
        }>;
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
        guildLog.info(
          `Skipping duplicate ${difficulty} fight: ${fight.encounterName} (${fight.reportCode}#${fight.fightId}) - duplicate of (${duplicateCheck.canonical.reportCode}#${duplicateCheck.canonical.fightId})`,
        );
        continue;
      }

      uniqueFights.push(fight);
    }

    if (duplicateCount > 0) {
      guildLog.info(`Filtered out ${duplicateCount} duplicate ${difficulty} fights for ${raidData.name}`);
    }

    guildLog.info(`Processing ${uniqueFights.length} unique ${difficulty} fights for ${raidData.name}`);

    // SECOND PASS: Identify first kill times for each boss
    const firstKillTimes = new Map<number, Date>();

    for (const fight of uniqueFights) {
      if (fight.isKill && !firstKillTimes.has(fight.encounterID)) {
        firstKillTimes.set(fight.encounterID, fight.timestamp);
      }
    }

    guildLog.info(
      `First kill times identified for ${difficulty}:`,
      Array.from(firstKillTimes.entries()).map(([id, time]) => `Boss ${id}: ${time.toISOString()}`),
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
          bestPullReportCode: undefined,
          bestPullFightId: undefined,
          pullHistory: [],
        });
      }

      const bossData = bossDataMap.get(encounterId)!;

      // Only count pulls and time up to (and including) the first kill
      const firstKillTime = firstKillTimes.get(encounterId);
      const shouldCountPull = !firstKillTime || fight.timestamp <= firstKillTime;

      if (shouldCountPull) {
        bossData.pulls++;
        bossData.totalTime += duration;

        // Add to pull history for progress chart
        // Convert phase name to short format (e.g., "Stage Three" -> "P3", "Intermission One" -> "I1")
        let phaseShort: string | undefined;
        if (fight.lastPhaseName) {
          const phaseName = fight.lastPhaseName.toLowerCase();

          // Helper to convert word numbers to digits
          const wordToNumber: { [key: string]: string } = {
            one: "1",
            two: "2",
            three: "3",
            four: "4",
            five: "5",
            six: "6",
            seven: "7",
            eight: "8",
            nine: "9",
            ten: "10",
          };

          // Extract number from phase name (supports both "Stage 3" and "Stage Three")
          const extractNumber = (name: string): string => {
            // First try numeric match
            const numMatch = name.match(/\b(\d+)\b/);
            if (numMatch) return numMatch[1];

            // Then try word match
            for (const [word, num] of Object.entries(wordToNumber)) {
              if (name.includes(word)) return num;
            }
            return "1"; // Default to 1 if no number found
          };

          if (phaseName.includes("intermission")) {
            phaseShort = `I${extractNumber(phaseName)}`;
          } else if (phaseName.includes("stage") || phaseName.includes("phase")) {
            phaseShort = `P${extractNumber(phaseName)}`;
          } else {
            // Fallback: try to extract any number, treat as phase
            phaseShort = `P${extractNumber(phaseName)}`;
          }
        }

        bossData.pullHistory.push({
          pullNumber: bossData.pulls,
          fightPercentage: isKill ? 0 : fightPercent,
          phase: phaseShort,
          isKill: isKill,
        });
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
          // Store the report code and fight ID for the best pull
          bossData.bestPullReportCode = fight.reportCode;
          bossData.bestPullFightId = fight.fightId;

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
      guildLog.info(`No ${difficulty} encounters found - bossDataMap is empty`);
      return;
    }

    guildLog.info(
      `Found ${bossDataMap.size} unique bosses for ${difficulty}:`,
      Array.from(bossDataMap.keys()).map((id) => {
        const boss = bossDataMap.get(id)!;
        return `${boss.name} (${boss.kills} kills, ${boss.pulls} pulls)`;
      }),
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
      guildLog.info(`Created new ${difficulty} progress entry for ${raidData.name}`);
    }

    // First, remove any bosses that don't belong to this raid (cleanup old invalid data)
    const initialBossCount = raidProgress.bosses.length;
    raidProgress.bosses = raidProgress.bosses.filter((b) => validBossIds.has(b.bossId));
    if (raidProgress.bosses.length < initialBossCount) {
      guildLog.info(`Removed ${initialBossCount - raidProgress.bosses.length} invalid boss(es) that don't belong to ${raidData.name} (${difficulty})`);
    }

    // Process each boss from our calculated data
    for (const [encounterId, bossInfo] of bossDataMap.entries()) {
      // Double-check this boss belongs to the raid (should always be true due to earlier filtering)
      if (!validBossIds.has(encounterId)) {
        guildLog.warn(`Skipping boss ${bossInfo.name} (ID: ${encounterId}) - not in raid ${raidData.name}'s boss list`);
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
        bestPullReportCode: bossInfo.kills > 0 ? undefined : bossInfo.bestPullReportCode,
        bestPullFightId: bossInfo.kills > 0 ? undefined : bossInfo.bestPullFightId,
        pullHistory: bossInfo.pullHistory,
        lastUpdated: new Date(),
      };

      if (bossProgress) {
        // Check if we should create events
        await this.checkAndCreateEvents(guild, raidProgress, bossProgress, bossData);

        // Update existing boss progress
        Object.assign(bossProgress, bossData);
      } else {
        // New boss progress
        guildLog.info(`Adding new boss to ${difficulty} progress: ${bossData.bossName} (${bossData.kills} kills, ${bossData.pullCount} pulls)`);
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

    guildLog.info(`Before markModified - ${difficulty} progress has ${raidProgress.bosses.length} bosses in array`);

    // Mark the specific progress subdocument as modified
    const progressIndex = guild.progress.findIndex((p) => p.raidId === raidData.id && p.difficulty === difficulty);
    if (progressIndex !== -1) {
      guild.markModified(`progress.${progressIndex}.bosses`);
      guild.markModified(`progress.${progressIndex}.bossesDefeated`);
      guild.markModified(`progress.${progressIndex}.totalTimeSpent`);
    }

    // Also mark the entire progress array as modified
    guild.markModified("progress");

    guildLog.info(`Processed ${difficulty} progress: ${defeatedCount}/${raidData.bosses.length} bosses defeated, ${raidProgress.bosses.length} bosses tracked`);
  }

  private async checkAndCreateEvents(guild: IGuild, raidProgress: IRaidProgress, oldBoss: IBossProgress, newBoss: IBossProgress): Promise<void> {
    let eventCreated = false;

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

      eventCreated = true;

      // Update world rank after boss kill event (only for current raids)
      if (CURRENT_RAID_IDS.includes(raidProgress.raidId) && raidProgress.difficulty === "mythic") {
        getGuildLogger(guild.name, guild.realm).info("Boss kill event created, updating world rank for current raids...");
        await this.updateCurrentRaidsWorldRanking((guild._id as mongoose.Types.ObjectId).toString());
        await this.calculateGuildRankingsForRaid(raidProgress.raidId);
      }
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

      eventCreated = true;

      // Update world rank after significant progress event (only for current raids)
      if (CURRENT_RAID_IDS.includes(raidProgress.raidId) && raidProgress.difficulty === "mythic") {
        getGuildLogger(guild.name, guild.realm).info("Best pull event created, updating world rank for current raids...");
        await this.updateCurrentRaidsWorldRanking((guild._id as mongoose.Types.ObjectId).toString());
        await this.calculateGuildRankingsForRaid(raidProgress.raidId);

        // Invalidate event caches if any event was created
        if (eventCreated) {
          await cacheService.invalidateEventCaches();
        }
      }
    }
  }

  // Check if guild has ongoing reports (currently raiding)
  // NOTE: This method is now deprecated in favor of the live log detection in performUpdate()
  // which checks if report endTime is within 30 minutes of current time
  // Keeping this for backward compatibility and manual status checks
  async updateRaidingStatus(guild: IGuild): Promise<void> {
    const currentTime = Date.now();
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    // Check if there are any reports with endTime within 30 minutes for this guild
    const recentReports = await Report.find({
      guildId: guild._id,
      zoneId: { $in: TRACKED_RAIDS },
    })
      .sort({ endTime: -1 })
      .limit(5);

    let hasLiveLog = false;
    for (const report of recentReports) {
      if (report.endTime && currentTime - report.endTime < THIRTY_MINUTES_MS) {
        hasLiveLog = true;
        break;
      }
    }

    const wasRaiding = guild.isCurrentlyRaiding;
    guild.isCurrentlyRaiding = hasLiveLog;

    if (wasRaiding !== guild.isCurrentlyRaiding) {
      getGuildLogger(guild.name, guild.realm).info(`Raiding status changed: ${guild.isCurrentlyRaiding ? "STARTED" : "STOPPED"} raiding`);
      // Don't save here - let the caller save to avoid overwriting changes
    }
  }

  // Helper function to calculate raid schedule summary
  private calculateScheduleSummary(raidSchedule?: any): { totalDays: number; averageHours: number } | null {
    if (!raidSchedule || !raidSchedule.days || raidSchedule.days.length === 0) {
      return null;
    }

    const totalDays = raidSchedule.days.length;
    const averageHours =
      raidSchedule.days.reduce((sum: number, day: any) => {
        return sum + (day.endHour - day.startHour);
      }, 0) / totalDays;

    return {
      totalDays,
      averageHours: Math.round(averageHours), // Round to nearest hour
    };
  }

  // Get all guilds with only their raid schedules (for calendar/timetable view)
  async getAllGuildSchedules(): Promise<any[]> {
    const guilds = await Guild.find().select("_id name realm region parent_guild raidSchedule").lean();

    // Filter out guilds without raid schedules and remove raidCount from days
    return guilds
      .filter((guild) => guild.raidSchedule && guild.raidSchedule.days && guild.raidSchedule.days.length > 0)
      .map((guild) => ({
        _id: guild._id,
        name: guild.name,
        realm: guild.realm,
        region: guild.region,
        parent_guild: guild.parent_guild,
        raidSchedule: {
          days: guild.raidSchedule!.days.map((day: any) => ({
            day: day.day,
            startHour: day.startHour,
            endHour: day.endHour,
          })),
          lastCalculated: guild.raidSchedule!.lastCalculated,
        },
      }));
  }

  // Get minimal guild list for directory page (only essential fields)
  async getGuildListMinimal(): Promise<any[]> {
    const guilds = await Guild.find().select("name realm region parent_guild warcraftlogsId isCurrentlyRaiding -_id").sort({ name: 1 }).lean();
    return guilds;
  }

  // Get all guilds sorted by progress
  async getAllGuilds(): Promise<IGuild[]> {
    const guilds = await Guild.find().sort({ "progress.bossesDefeated": -1 }).lean();
    return guilds as IGuild[];
  }

  // Get all guilds with progress filtered by raidId (minimal data for leaderboard)
  // Optimized with MongoDB aggregation pipeline for better performance
  async getAllGuildsForRaid(raidId: number): Promise<any[]> {
    // Use aggregation pipeline to filter, project, and sort at database level
    const guilds = await Guild.aggregate([
      // Stage 1: Match only guilds that have progress for this raid with at least 1 boss kill
      {
        $match: {
          progress: {
            $elemMatch: {
              raidId: raidId,
              bossesDefeated: { $gt: 0 },
            },
          },
        },
      },
      // Stage 2: Project only the fields we need (exclude heavy nested data like pullHistory)
      {
        $project: {
          _id: 1,
          name: 1,
          realm: 1,
          region: 1,
          faction: 1,
          warcraftlogsId: 1,
          crest: 1,
          parent_guild: 1,
          isCurrentlyRaiding: 1,
          lastFetched: 1,
          // Filter progress array to only include the specified raid
          progress: {
            $filter: {
              input: "$progress",
              as: "p",
              cond: { $eq: ["$$p.raidId", raidId] },
            },
          },
          // Include raidSchedule for schedule summary calculation
          raidSchedule: 1,
          // Include streamers to check isLive status (only need isLive field)
          streamers: {
            $map: {
              input: { $ifNull: ["$streamers", []] },
              as: "s",
              in: { isLive: "$$s.isLive" },
            },
          },
        },
      },
      // Stage 3: Add computed fields for sorting
      {
        $addFields: {
          // Get mythic progress for sorting
          mythicProgress: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$progress",
                  as: "p",
                  cond: { $eq: ["$$p.difficulty", "mythic"] },
                },
              },
              0,
            ],
          },
          // Get heroic progress for sorting (fallback)
          heroicProgress: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$progress",
                  as: "p",
                  cond: { $eq: ["$$p.difficulty", "heroic"] },
                },
              },
              0,
            ],
          },
        },
      },
      // Stage 4: Add sort rank field (mythic rank preferred, then heroic)
      {
        $addFields: {
          sortRank: {
            $ifNull: ["$mythicProgress.guildRank", { $ifNull: ["$heroicProgress.guildRank", 999] }],
          },
        },
      },
      // Stage 5: Sort by guild rank at database level
      {
        $sort: { sortRank: 1 },
      },
      // Stage 6: Remove temporary sort fields
      {
        $project: {
          mythicProgress: 0,
          heroicProgress: 0,
          sortRank: 0,
        },
      },
    ]);

    // Transform to minimal structure (still needed for boss-level calculations)
    return guilds.map((guildObj) => {
      // Transform progress to minimal structure
      const minimalProgress = guildObj.progress.map((p: any) => {
        // Find current boss (first unkilled boss) to get best pull info
        const currentBoss = p.bosses?.find((b: any) => b.kills === 0);

        // Find the last killed boss to get the most recent kill timestamp
        const killedBosses = p.bosses?.filter((b: any) => b.kills > 0 && b.firstKillTime) || [];
        const lastKilledBoss =
          killedBosses.length > 0 ? killedBosses.reduce((latest: any, boss: any) => (new Date(boss.firstKillTime!) > new Date(latest.firstKillTime!) ? boss : latest)) : null;

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

      // Calculate schedule summary
      const scheduleSummary = this.calculateScheduleSummary(guildObj.raidSchedule);

      // Check if any streamers are live
      const isStreaming = guildObj.streamers && guildObj.streamers.length > 0 ? guildObj.streamers.some((s: any) => s.isLive) : false;

      // Return minimal guild structure
      return {
        _id: guildObj._id,
        name: guildObj.name,
        realm: guildObj.realm,
        region: guildObj.region,
        faction: guildObj.faction,
        warcraftlogsId: guildObj.warcraftlogsId,
        crest: guildObj.crest,
        parent_guild: guildObj.parent_guild,
        isCurrentlyRaiding: guildObj.isCurrentlyRaiding,
        isStreaming: isStreaming,
        lastFetched: guildObj.lastFetched,
        progress: minimalProgress,
        scheduleDisplay: scheduleSummary,
      };
    });
  }

  // Get detailed boss progress for a specific raid (returns only progress array, not guild info)
  // Excludes pullHistory to reduce payload size
  async getGuildBossProgressForRaid(guildId: string, raidId: number): Promise<any[] | null> {
    const guild = await Guild.findById(guildId).select("progress").lean();

    if (!guild) {
      return null;
    }

    // Return only the progress array for the specified raid, excluding pullHistory
    const raidProgress = guild.progress
      .filter((p) => p.raidId === raidId)
      .map((progress) => ({
        ...progress,
        bosses: progress.bosses.map((boss) => {
          const { pullHistory, ...bossWithoutHistory } = boss;
          return bossWithoutHistory;
        }),
      }));

    return raidProgress;
  }

  // Get detailed boss progress for a specific raid by realm and name (returns only progress array)
  // Excludes pullHistory to reduce payload size
  async getGuildBossProgressForRaidByRealmName(realm: string, name: string, raidId: number): Promise<any[] | null> {
    const guild = await Guild.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") }, // Case-insensitive exact match
      realm: { $regex: new RegExp(`^${realm}$`, "i") }, // Case-insensitive exact match
    })
      .select("progress")
      .lean();

    if (!guild) {
      return null;
    }

    // Return only the progress array for the specified raid, excluding pullHistory
    const raidProgress = guild.progress
      .filter((p) => p.raidId === raidId)
      .map((progress) => ({
        ...progress,
        bosses: progress.bosses.map((boss) => {
          const { pullHistory, ...bossWithoutHistory } = boss;
          return bossWithoutHistory;
        }),
      }));

    return raidProgress;
  }

  // Get pull history for a specific boss (on-demand fetching)
  async getBossPullHistory(realm: string, name: string, raidId: number, bossId: number, difficulty: "mythic" | "heroic"): Promise<any | null> {
    const guild = await Guild.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") }, // Case-insensitive exact match
      realm: { $regex: new RegExp(`^${realm}$`, "i") }, // Case-insensitive exact match
    })
      .select("progress")
      .lean();

    if (!guild) {
      return null;
    }

    // Find the specific raid progress (guild is already plain object from .lean())
    const raidProgress = guild.progress.find((p: any) => p.raidId === raidId && p.difficulty === difficulty);

    if (!raidProgress) {
      return null;
    }

    // Find the specific boss
    const boss = raidProgress.bosses.find((b: any) => b.bossId === bossId);

    if (!boss) {
      return null;
    }

    const pullHistory = boss.pullHistory || [];

    // Calculate phase distribution (pullHistory already stores phases as P1, P2, I1, I2 format)
    const phaseCount = new Map<string, number>();
    pullHistory.forEach((pull: any) => {
      if (pull.phase) {
        const count = phaseCount.get(pull.phase) || 0;
        phaseCount.set(pull.phase, count + 1);
      }
    });

    // Sort by pull count (descending)
    const phaseDistribution = Array.from(phaseCount.entries())
      .map(([phase, count]) => ({ phase, count }))
      .sort((a, b) => b.count - a.count);

    // Return both pull history and phase distribution
    return {
      pullHistory,
      phaseDistribution,
    };
  }

  // Get single guild by ID
  async getGuildById(id: string): Promise<IGuild | null> {
    return await Guild.findById(id);
  }

  // Get single guild by realm and name
  async getGuildByRealmName(realm: string, name: string): Promise<IGuild | null> {
    return await Guild.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") }, // Case-insensitive exact match
      realm: { $regex: new RegExp(`^${realm}$`, "i") }, // Case-insensitive exact match
    });
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

    // Calculate schedule summary and prepare full schedule data
    const scheduleSummary = this.calculateScheduleSummary(guildObj.raidSchedule);
    const raidSchedule = guildObj.raidSchedule
      ? {
          days: guildObj.raidSchedule.days.map((day: any) => ({
            day: day.day,
            startHour: day.startHour,
            endHour: day.endHour,
          })),
          lastCalculated: guildObj.raidSchedule.lastCalculated,
        }
      : undefined;

    return {
      _id: guildObj._id,
      name: guildObj.name,
      realm: guildObj.realm,
      region: guildObj.region,
      faction: guildObj.faction,
      crest: guildObj.crest,
      parent_guild: guildObj.parent_guild,
      isCurrentlyRaiding: guildObj.isCurrentlyRaiding,
      lastFetched: guildObj.lastFetched,
      progress: summaryProgress,
      scheduleDisplay: scheduleSummary,
      raidSchedule: raidSchedule,
    };
  }

  // Get guild summary by realm and name with progress summaries (without boss arrays)
  async getGuildSummaryByRealmName(realm: string, name: string): Promise<any | null> {
    const guild = await Guild.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") }, // Case-insensitive exact match
      realm: { $regex: new RegExp(`^${realm}$`, "i") }, // Case-insensitive exact match
    });

    if (!guild) {
      return null;
    }

    const guildObj = guild.toObject() as IGuild & { _id: mongoose.Types.ObjectId };

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

    // Calculate schedule summary and prepare full schedule data
    const scheduleSummary = this.calculateScheduleSummary(guildObj.raidSchedule);
    const raidSchedule = guildObj.raidSchedule
      ? {
          days: guildObj.raidSchedule.days.map((day: any) => ({
            day: day.day,
            startHour: day.startHour,
            endHour: day.endHour,
          })),
          lastCalculated: guildObj.raidSchedule.lastCalculated,
        }
      : undefined;

    // Include streamer data if available
    const streamers = guildObj.streamers
      ? guildObj.streamers.map((s: any) => ({
          channelName: s.channelName,
          isLive: s.isLive,
        }))
      : undefined;

    // Get tier list scores for this guild (overall + current raids only)
    const tierScores = await this.getGuildTierScores(guildObj._id.toString());

    return {
      _id: guildObj._id,
      name: guildObj.name,
      realm: guildObj.realm,
      region: guildObj.region,
      faction: guildObj.faction,
      warcraftlogsId: guildObj.warcraftlogsId,
      crest: guildObj.crest,
      parent_guild: guildObj.parent_guild,
      isCurrentlyRaiding: guildObj.isCurrentlyRaiding,
      lastFetched: guildObj.lastFetched,
      progress: summaryProgress,
      scheduleDisplay: scheduleSummary,
      raidSchedule: raidSchedule,
      streamers: streamers,
      tierScores: tierScores,
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
      warcraftlogsId: guildObj.warcraftlogsId,
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

  // Update guild crests for all guilds from Blizzard API
  async updateAllGuildCrests(): Promise<void> {
    logger.info("[Guild Crests] Starting guild crest update for all guilds...");

    try {
      // Get all guilds from database
      const guilds = await Guild.find();

      if (guilds.length === 0) {
        logger.info("[Guild Crests] No guilds found in database");
        return;
      }

      logger.info(`[Guild Crests] Found ${guilds.length} guild(s) to update`);

      let successCount = 0;
      let failureCount = 0;

      // Update each guild's crest
      for (let i = 0; i < guilds.length; i++) {
        const guild = guilds[i];

        // Use parent_guild name if it exists, as that's the actual guild in Blizzard's system
        const blizzardGuildName = guild.parent_guild || guild.name;
        logger.info(
          `[Guild Crests] [${i + 1}/${guilds.length}] Fetching crest for: ${blizzardGuildName} - ${guild.realm}${guild.parent_guild ? ` (parent guild for ${guild.name})` : ""}`,
        );

        try {
          const guildData = await blizzardService.getGuildData(blizzardGuildName, guild.realm.toLowerCase(), guild.region);

          if (guildData) {
            // Update the guild's crest and faction in database
            guild.crest = guildData.crest;
            guild.markModified("crest");
            if (guildData.faction) {
              guild.faction = guildData.faction;
            }
            await guild.save();

            successCount++;
            logger.info(`[Guild Crests] ✅ Updated crest for: ${blizzardGuildName}`);
          } else {
            failureCount++;
            logger.warn(`[Guild Crests] ⚠️  Could not fetch crest data for: ${blizzardGuildName}`);
          }
        } catch (error) {
          failureCount++;
          logger.error(`[Guild Crests] ❌ Error fetching crest for ${blizzardGuildName}:`, error instanceof Error ? error.message : "Unknown error");
        }

        // Sleep for 1 second between requests to avoid rate limiting
        if (i < guilds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      logger.info(`[Guild Crests] Update complete: ${successCount} successful, ${failureCount} failed`);
    } catch (error) {
      logger.error("[Guild Crests] Error during guild crest update:", error);
      throw error;
    }
  }

  // Get all live streamers with their guild info
  async getLiveStreamers(): Promise<any[]> {
    try {
      const guilds = await Guild.find({
        streamers: { $exists: true, $ne: [] },
      })
        .select("name realm region progress streamers")
        .lean();

      const liveStreamers: any[] = [];

      for (const guild of guilds) {
        if (!guild.streamers || guild.streamers.length === 0) continue;

        // Filter only live streamers
        const liveStreamsForGuild = guild.streamers.filter((s) => s.isLive);

        if (liveStreamsForGuild.length > 0) {
          // Get current raid mythic progress for this guild
          const currentRaidId = CURRENT_RAID_IDS[0];
          const mythicProgress = guild.progress.find((p) => p.raidId === currentRaidId && p.difficulty === "mythic");

          // Find current boss (first unkilled boss) to get best pull info
          let bestPull = null;
          if (mythicProgress) {
            const currentBoss = mythicProgress.bosses.find((b) => b.kills === 0);
            if (currentBoss && currentBoss.pullCount > 0) {
              bestPull = {
                bossName: currentBoss.bossName,
                pullCount: currentBoss.pullCount,
                bestPercent: currentBoss.bestPercent,
                bestPullPhase: currentBoss.bestPullPhase,
              };
            }
          }

          liveStreamsForGuild.forEach((streamer) => {
            liveStreamers.push({
              channelName: streamer.channelName,
              isLive: streamer.isLive,
              isPlayingWoW: streamer.isPlayingWoW,
              gameName: streamer.gameName,
              guild: {
                name: guild.name,
                realm: guild.realm,
                region: guild.region,
                parent_guild: guild.parent_guild,
              },
              bestPull: bestPull,
            });
          });
        }
      }

      return liveStreamers;
    } catch (error) {
      logger.error("Error fetching live streamers:", error);
      return [];
    }
  }

  // Get tier list scores for a specific guild (overall + current raids)
  async getGuildTierScores(guildId: string): Promise<{
    overall: { overallScore: number; speedScore: number; efficiencyScore: number } | null;
    raids: { raidId: number; raidName: string; overallScore: number; speedScore: number; efficiencyScore: number }[];
  } | null> {
    try {
      const tierList = await TierList.findOne().sort({ calculatedAt: -1 });
      if (!tierList) return null;

      // Find this guild's overall scores
      const overallEntry = tierList.overall.find((g) => g.guildId.toString() === guildId);
      const overall = overallEntry
        ? {
            overallScore: overallEntry.overallScore,
            speedScore: overallEntry.speedScore,
            efficiencyScore: overallEntry.efficiencyScore,
          }
        : null;

      // Find this guild's scores for current raids only
      const raidScores: { raidId: number; raidName: string; overallScore: number; speedScore: number; efficiencyScore: number }[] = [];

      for (const raidId of CURRENT_RAID_IDS) {
        const raidTierList = tierList.raids.find((r) => r.raidId === raidId);
        if (raidTierList) {
          const guildEntry = raidTierList.guilds.find((g) => g.guildId.toString() === guildId);
          if (guildEntry) {
            raidScores.push({
              raidId: raidTierList.raidId,
              raidName: raidTierList.raidName,
              overallScore: guildEntry.overallScore,
              speedScore: guildEntry.speedScore,
              efficiencyScore: guildEntry.efficiencyScore,
            });
          }
        }
      }

      return { overall, raids: raidScores };
    } catch (error) {
      logger.error("Error fetching guild tier scores:", error);
      return null;
    }
  }
}

export default new GuildService();
