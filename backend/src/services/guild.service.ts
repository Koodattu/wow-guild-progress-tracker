import Guild, { IGuild, IRaidProgress, IBossProgress } from "../models/Guild";
import Event from "../models/Event";
import Raid, { IRaid } from "../models/Raid";
import Report from "../models/Report";
import Fight from "../models/Fight";
import wclService from "./warcraftlogs.service";
import { GUILDS, TRACKED_RAIDS, CURRENT_RAID_ID, DIFFICULTIES } from "../config/guilds";

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
        // Fetch all zones from WarcraftLogs
        const result = await wclService.getZones();
        const zones = result.worldData?.zones;

        if (!zones || zones.length === 0) {
          console.warn("No zones data returned from WarcraftLogs");
          return;
        }

        console.log(`Found ${zones.length} zones from WarcraftLogs`);

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

            // Get expansion name from the zone data
            const expansionName = zoneData.expansion?.name || "Unknown";

            // Convert encounters to bosses format
            const bosses = (zoneData.encounters || []).map((enc: any) => ({
              id: enc.id,
              name: enc.name,
              slug: enc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            }));

            console.log(`Syncing zone ${zone.id} (${expansionName}) with ${bosses.length} encounters`);

            // Update or create raid in database
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
      // Fetch reports once and process both difficulties from the same data
      // This is much more efficient than fetching separately for mythic and heroic
      await this.fetchAndProcessAllReports(guild);

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

      console.log(`Successfully updated: ${guild.name}`);
      return guild;
    } catch (error) {
      console.error(`Error updating guild ${guild.name}:`, error);
      return null;
    }
  }

  // Fetch all reports for a guild and process both Mythic and Heroic from the same data
  private async fetchAndProcessAllReports(guild: IGuild): Promise<void> {
    // Get raid data from database
    const raidData = await this.getRaidData(CURRENT_RAID_ID);
    if (!raidData) {
      console.error(`Raid data not found for zone ${CURRENT_RAID_ID}. Run syncRaidsFromWCL first!`);
      return;
    }

    console.log(`Using raid data: ${raidData.name} with ${raidData.bosses.length} bosses`);

    try {
      // Check if we have any reports for this guild/zone already
      const existingReports = await Report.find({
        guildId: guild._id,
        zoneId: CURRENT_RAID_ID,
      })
        .sort({ startTime: -1 })
        .limit(1);

      const hasExistingData = existingReports.length > 0;
      const latestReportTime = hasExistingData ? existingReports[0].startTime : 0;

      // EFFICIENT CHECK: Only fetch report codes/timestamps (lightweight query)
      const checkData = await wclService.checkForNewReports(
        guild.name,
        guild.realm.toLowerCase().replace(/\s+/g, "-"),
        guild.region.toLowerCase(),
        CURRENT_RAID_ID,
        5 // Only check the 5 most recent reports
      );

      if (!checkData.reportData?.reports?.data || checkData.reportData.reports.data.length === 0) {
        console.log(`No reports found for ${guild.name}`);
        return;
      }

      const recentReportsList = checkData.reportData.reports.data;

      // Find new reports that we haven't processed yet
      const newReportCodes = recentReportsList.filter((r: any) => r.startTime > latestReportTime).map((r: any) => r.code);

      // Find ongoing reports (no endTime)
      const ongoingReports = recentReportsList.filter((r: any) => !r.endTime || r.endTime === 0);

      if (newReportCodes.length === 0 && ongoingReports.length === 0) {
        console.log(`No new or ongoing reports for ${guild.name}`);
        return;
      }

      console.log(`Found ${newReportCodes.length} new reports and ${ongoingReports.length} ongoing reports for ${guild.name}`);

      // Fetch full details only for new reports and ongoing reports
      // We fetch reports WITHOUT difficulty filter to get ALL fights
      const reportsToProcess: any[] = [];

      if (!hasExistingData) {
        // First time fetch - get all historical data
        console.log(`No existing data for ${guild.name}, fetching all historical reports`);
        const reportsPerPage = 50;
        let page = 1;
        const maxPages = 10;
        let shouldContinue = true;

        while (shouldContinue && page <= maxPages) {
          const data = await wclService.getGuildReportsAllDifficulties(
            guild.name,
            guild.realm.toLowerCase().replace(/\s+/g, "-"),
            guild.region.toLowerCase(),
            CURRENT_RAID_ID,
            reportsPerPage,
            page
          );

          if (!data.reportData?.reports?.data || data.reportData.reports.data.length === 0) {
            break;
          }

          const pageReports = data.reportData.reports.data;
          reportsToProcess.push(...pageReports);
          console.log(`Fetched page ${page}: ${pageReports.length} reports for ${guild.name}`);

          // Update guild faction if available (only on first page)
          if (page === 1 && data.guildData?.guild?.faction?.name) {
            guild.faction = data.guildData.guild.faction.name;
          }

          if (pageReports.length < reportsPerPage) {
            break;
          }
          page++;
        }
      } else {
        // We have existing data - only fetch new and ongoing reports by code
        const codesToFetch = [...new Set([...newReportCodes, ...ongoingReports.map((r: any) => r.code)])];

        for (const code of codesToFetch) {
          const reportData = await wclService.getReportByCodeAllDifficulties(code);
          if (reportData.reportData?.report) {
            reportsToProcess.push(reportData.reportData.report);
            console.log(`Fetched report ${code} for ${guild.name}`);
          }
        }
      }

      if (reportsToProcess.length === 0) {
        console.log(`No reports to process for ${guild.name}`);
        return;
      }

      console.log(`Total reports to process: ${reportsToProcess.length} for ${guild.name}`);

      // Now process both Mythic and Heroic from the same report data
      await this.processReportsForDifficulty(guild, raidData, reportsToProcess, "mythic");
      await this.processReportsForDifficulty(guild, raidData, reportsToProcess, "heroic");

      // Save processed reports to database
      for (const report of reportsToProcess) {
        const fightCount = report.fights?.length || 0;
        const isOngoing = !report.endTime || report.endTime === 0;

        // Build encounter summary from fights
        const encounterFights: Record<number, { total: number; kills: number; wipes: number }> = {};
        if (report.fights) {
          for (const fight of report.fights) {
            const encounterID = fight.encounterID;
            if (!encounterFights[encounterID]) {
              encounterFights[encounterID] = { total: 0, kills: 0, wipes: 0 };
            }
            encounterFights[encounterID].total++;
            if (fight.kill) {
              encounterFights[encounterID].kills++;
            } else {
              encounterFights[encounterID].wipes++;
            }
          }
        }

        await Report.findOneAndUpdate(
          { code: report.code },
          {
            code: report.code,
            guildId: guild._id,
            zoneId: CURRENT_RAID_ID,
            startTime: report.startTime,
            endTime: report.endTime,
            isOngoing,
            fightCount,
            encounterFights,
            lastProcessed: new Date(),
          },
          { upsert: true, new: true }
        );
      }

      console.log(`Saved ${reportsToProcess.length} reports for ${guild.name}`);
    } catch (error) {
      console.error(`Error fetching reports for ${guild.name}:`, error);
      throw error;
    }
  }

  // Process reports for a specific difficulty from already-fetched report data
  private async processReportsForDifficulty(guild: IGuild, raidData: IRaid, allReports: any[], difficulty: "mythic" | "heroic"): Promise<void> {
    const difficultyId = difficulty === "mythic" ? DIFFICULTIES.MYTHIC : DIFFICULTIES.HEROIC;

    console.log(`[${guild.name}] Processing ${difficulty} (difficultyId: ${difficultyId}) with ${allReports.length} reports`);

    // Sort reports by start time (oldest first) to properly track kill order
    const reports = [...allReports].sort((a, b) => a.startTime - b.startTime);

    // Aggregate boss data from all fights across all reports
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
      }
    >();

    // Track kill order - which boss was killed first, second, etc.
    const killOrderTracker: Array<{ encounterId: number; killTime: Date }> = [];

    // Process all reports and filter fights by difficulty
    for (const report of reports) {
      if (!report.fights || report.fights.length === 0) {
        console.log(`[${guild.name}] Report ${report.code} has no fights`);
        continue;
      }

      console.log(`[${guild.name}] Report ${report.code} has ${report.fights.length} total fights`);

      // Filter fights by difficulty since we're fetching all difficulties
      const difficultyFights = report.fights.filter((fight: any) => fight.difficulty === difficultyId);

      console.log(`[${guild.name}] Report ${report.code} has ${difficultyFights.length} ${difficulty} fights (filtered from ${report.fights.length} total)`);

      if (difficultyFights.length > 0) {
        console.log(
          `[${guild.name}] Sample fight difficulties in this report:`,
          report.fights.slice(0, 3).map((f: any) => ({ name: f.name, difficulty: f.difficulty }))
        );
      }

      for (const fight of difficultyFights) {
        const encounterId = fight.encounterID;
        const isKill = fight.kill === true;
        const percent = fight.bossPercentage || 0;
        const duration = (fight.endTime - fight.startTime) / 1000; // Convert to seconds

        // SAVE INDIVIDUAL FIGHT TO DATABASE
        const fightTimestamp = new Date(report.startTime + fight.startTime);
        await Fight.findOneAndUpdate(
          { reportCode: report.code, fightId: fight.id },
          {
            reportCode: report.code,
            guildId: guild._id,
            fightId: fight.id,
            zoneId: raidData.id,
            encounterID: encounterId,
            encounterName: fight.name || `Boss ${encounterId}`,
            difficulty: difficultyId,
            isKill,
            bossPercentage: percent,
            fightPercentage: fight.fightPercentage || 0,
            reportStartTime: report.startTime,
            reportEndTime: report.endTime || 0,
            fightStartTime: fight.startTime,
            fightEndTime: fight.endTime,
            duration: fight.endTime - fight.startTime, // Duration in ms (combat time)
            timestamp: fightTimestamp,
          },
          { upsert: true, new: true }
        );

        if (!bossDataMap.has(encounterId)) {
          bossDataMap.set(encounterId, {
            encounterID: encounterId,
            name: fight.name || `Boss ${encounterId}`,
            kills: 0,
            pulls: 0,
            bestPercent: 100, // Start at 100 (worst), track lowest (best)
            totalTime: 0,
            firstKillTime: undefined,
            firstKillReportCode: undefined,
            firstKillFightId: undefined,
          });
        }

        const bossData = bossDataMap.get(encounterId)!;
        bossData.pulls++;
        bossData.totalTime += duration;

        if (isKill) {
          bossData.kills++;
          // Track first kill time and report/fight info
          if (!bossData.firstKillTime) {
            // Calculate actual kill time: report start + fight end time offset
            const killTime = new Date(report.startTime + fight.endTime);
            bossData.firstKillTime = killTime;
            bossData.firstKillReportCode = report.code;
            bossData.firstKillFightId = fight.id;

            // Add to kill order tracker
            killOrderTracker.push({ encounterId, killTime });
          }
        } else {
          // Track best pull percentage for non-kills
          // Lower boss health % = better progress (0% = dead, 100% = full health)
          if (percent < bossData.bestPercent) {
            bossData.bestPercent = percent;
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
      // Create a new progress entry by pushing to the array
      // This ensures Mongoose properly tracks it as a subdocument
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

      // Now get a reference to the newly added progress
      raidProgress = guild.progress[guild.progress.length - 1];
      console.log(`[${guild.name}] Created new ${difficulty} progress entry`);
    }

    // Process each boss
    let totalTime = 0;
    let defeatedCount = 0;

    for (const [encounterId, bossInfo] of bossDataMap.entries()) {
      let bossProgress = raidProgress.bosses.find((b) => b.bossId === encounterId);

      const isDefeated = bossInfo.kills > 0;
      if (isDefeated) defeatedCount++;

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
        lastUpdated: new Date(),
      };

      totalTime += bossData.timeSpent;

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

    raidProgress.bossesDefeated = defeatedCount;
    raidProgress.totalBosses = raidData.bosses.length; // Use boss count from database!
    raidProgress.totalTimeSpent = totalTime;
    raidProgress.lastUpdated = new Date();

    console.log(`[${guild.name}] Before markModified - ${difficulty} progress has ${raidProgress.bosses.length} bosses in array`);

    // Mark the specific progress subdocument as modified
    // Find the index of this progress entry
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
        },
        timestamp: new Date(),
      });
    }
  }

  // Check if guild has ongoing reports (currently raiding)
  async updateRaidingStatus(guild: IGuild): Promise<void> {
    // Check if there are any ongoing reports for this guild in the current raid
    const ongoingReports = await Report.countDocuments({
      guildId: guild._id,
      zoneId: CURRENT_RAID_ID,
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

  // Get single guild by ID
  async getGuildById(id: string): Promise<IGuild | null> {
    return await Guild.findById(id);
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
