import Guild, { IGuild, IRaidProgress, IBossProgress } from "../models/Guild";
import Event from "../models/Event";
import Raid from "../models/Raid";
import Report from "../models/Report";
import wclService from "./warcraftlogs.service";
import { GUILDS, CURRENT_RAID, DIFFICULTIES } from "../config/guilds";

class GuildService {
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
      await this.updateRaidingStatus(guildId);

      guild.lastFetched = new Date();
      await guild.save();

      console.log(`Successfully updated: ${guild.name}`);
      return guild;
    } catch (error) {
      console.error(`Error updating guild ${guild.name}:`, error);
      return null;
    }
  }

  // Fetch all reports for a guild and process both Mythic and Heroic from the same data
  private async fetchAndProcessAllReports(guild: IGuild): Promise<void> {
    try {
      // Check if we have any reports for this guild/zone already
      const existingReports = await Report.find({
        guildId: guild._id,
        zoneId: CURRENT_RAID.id,
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
        CURRENT_RAID.id,
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
            CURRENT_RAID.id,
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
      await this.processReportsForDifficulty(guild, reportsToProcess, "mythic");
      await this.processReportsForDifficulty(guild, reportsToProcess, "heroic");

      // Save processed reports to database
      for (const report of reportsToProcess) {
        const fightCount = report.fights?.length || 0;
        const isOngoing = !report.endTime || report.endTime === 0;

        await Report.findOneAndUpdate(
          { code: report.code },
          {
            code: report.code,
            guildId: guild._id,
            zoneId: CURRENT_RAID.id,
            startTime: report.startTime,
            endTime: report.endTime,
            isOngoing,
            fightCount,
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
  private async processReportsForDifficulty(guild: IGuild, allReports: any[], difficulty: "mythic" | "heroic"): Promise<void> {
    const difficultyId = difficulty === "mythic" ? DIFFICULTIES.MYTHIC : DIFFICULTIES.HEROIC;

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
      if (!report.fights || report.fights.length === 0) continue;

      // Filter fights by difficulty since we're fetching all difficulties
      const difficultyFights = report.fights.filter((fight: any) => fight.difficulty === difficultyId);

      for (const fight of difficultyFights) {
        const encounterId = fight.encounterID;
        const isKill = fight.kill === true;
        const percent = fight.bossPercentage || 0;
        const duration = (fight.endTime - fight.startTime) / 1000; // Convert to seconds

        if (!bossDataMap.has(encounterId)) {
          bossDataMap.set(encounterId, {
            encounterID: encounterId,
            name: fight.name || `Boss ${encounterId}`,
            kills: 0,
            pulls: 0,
            bestPercent: 0,
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
            const killTime = new Date(fight.startTime);
            bossData.firstKillTime = killTime;
            bossData.firstKillReportCode = report.code;
            bossData.firstKillFightId = fight.id;

            // Add to kill order tracker
            killOrderTracker.push({ encounterId, killTime });
          }
        } else {
          // Track best pull percentage for non-kills
          const progressPercent = 100 - percent;
          if (progressPercent > bossData.bestPercent) {
            bossData.bestPercent = progressPercent;
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
      console.log(`No ${difficulty} encounters found for ${guild.name}`);
      return;
    }

    // Update or create raid progress entry
    let raidProgress = guild.progress.find((p) => p.raidId === CURRENT_RAID.id && p.difficulty === difficulty);

    if (!raidProgress) {
      raidProgress = {
        raidId: CURRENT_RAID.id,
        raidName: CURRENT_RAID.name,
        difficulty,
        bossesDefeated: 0,
        totalBosses: bossDataMap.size,
        totalTimeSpent: 0,
        bosses: [],
        lastUpdated: new Date(),
      } as IRaidProgress;
      guild.progress.push(raidProgress);
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
        raidProgress.bosses.push(bossData);
      }
    }

    raidProgress.bossesDefeated = defeatedCount;
    raidProgress.totalBosses = bossDataMap.size;
    raidProgress.totalTimeSpent = totalTime;
    raidProgress.lastUpdated = new Date();

    console.log(`Processed ${difficulty} progress for ${guild.name}: ${defeatedCount}/${bossDataMap.size} bosses`);
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

    // Check for new best pull (improvement of at least 5%)
    if (newBoss.bestPercent > oldBoss.bestPercent + 5 && newBoss.kills === 0) {
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
  async updateRaidingStatus(guildId: string): Promise<void> {
    const guild = await Guild.findById(guildId);
    if (!guild) return;

    // Check if there are any ongoing reports for this guild in the current raid
    const ongoingReports = await Report.countDocuments({
      guildId: guild._id,
      zoneId: CURRENT_RAID.id,
      isOngoing: true,
    });

    const wasRaiding = guild.isCurrentlyRaiding;
    guild.isCurrentlyRaiding = ongoingReports > 0;

    if (wasRaiding !== guild.isCurrentlyRaiding) {
      console.log(`${guild.name} raiding status changed: ${guild.isCurrentlyRaiding ? "STARTED" : "STOPPED"} raiding`);
      await guild.save();
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
