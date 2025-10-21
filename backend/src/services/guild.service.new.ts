import Guild, { IGuild, IRaidProgress, IBossProgress } from "../models/Guild";
import Report from "../models/Report";
import Event from "../models/Event";
import Raid from "../models/Raid";
import wclService from "./warcraftlogs.service";
import { GUILDS, CURRENT_RAID, DIFFICULTIES } from "../config/guilds";

interface FightData {
  encounterID: number;
  name: string;
  kill: boolean;
  bossPercentage: number;
  fightPercentage: number;
  startTime: number;
  endTime: number;
}

interface ReportData {
  code: string;
  startTime: number;
  endTime?: number;
  fights: FightData[];
}

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
          isCurrentlyRaiding: false,
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
      // Fetch for both Mythic and Heroic
      await this.fetchProgressForDifficulty(guild, "mythic");
      await this.fetchProgressForDifficulty(guild, "heroic");

      guild.lastFetched = new Date();
      await guild.save();

      console.log(`Successfully updated: ${guild.name}`);
      return guild;
    } catch (error) {
      console.error(`Error updating guild ${guild.name}:`, error);
      return null;
    }
  }

  // Update only ongoing reports for guilds currently raiding
  async updateOngoingReports(guildId: string): Promise<void> {
    const guild = await Guild.findById(guildId);
    if (!guild || !guild.isCurrentlyRaiding) return;

    console.log(`Updating ongoing reports for: ${guild.name}`);

    try {
      // Fetch only the most recent report to check if it's still ongoing
      const data = await wclService.getGuildReports(
        guild.name,
        guild.realm.toLowerCase().replace(/\s+/g, "-"),
        guild.region.toLowerCase(),
        CURRENT_RAID.id,
        DIFFICULTIES.MYTHIC, // Check mythic first
        1,
        1
      );

      if (data.reportData?.reports?.data && data.reportData.reports.data.length > 0) {
        const latestReport = data.reportData.reports.data[0];

        // If report has no end time, it's ongoing
        if (!latestReport.endTime) {
          await this.processReport(guild, latestReport, "mythic");
        } else {
          // No longer raiding
          guild.isCurrentlyRaiding = false;
          await guild.save();
        }
      }
    } catch (error) {
      console.error(`Error updating ongoing reports for ${guild.name}:`, error);
    }
  }

  private async fetchProgressForDifficulty(guild: IGuild, difficulty: "mythic" | "heroic"): Promise<void> {
    const difficultyId = difficulty === "mythic" ? DIFFICULTIES.MYTHIC : DIFFICULTIES.HEROIC;

    try {
      // Fetch reports in batches (50 at a time, up to 100 total)
      const reportsToFetch = 100;
      const batchSize = 50;
      const batches = Math.ceil(reportsToFetch / batchSize);

      let allReports: ReportData[] = [];

      for (let page = 1; page <= batches; page++) {
        const data = await wclService.getGuildReports(
          guild.name,
          guild.realm.toLowerCase().replace(/\s+/g, "-"),
          guild.region.toLowerCase(),
          CURRENT_RAID.id,
          difficultyId,
          batchSize,
          page
        );

        if (!data.reportData?.reports?.data) {
          break;
        }

        // Update guild faction if available
        if (page === 1 && data.guildData?.guild?.faction?.name) {
          guild.faction = data.guildData.guild.faction.name;
        }

        const reports = data.reportData.reports.data;
        allReports.push(...reports);

        // If we got less than batch size, we've reached the end
        if (reports.length < batchSize) {
          break;
        }
      }

      if (allReports.length === 0) {
        console.log(`No report data found for ${guild.name} (${difficulty})`);
        return;
      }

      // Process each report
      for (const report of allReports) {
        await this.processReport(guild, report, difficulty);
      }

      // Check if currently raiding (most recent report has no endTime)
      const mostRecent = allReports[0];
      guild.isCurrentlyRaiding = !mostRecent.endTime;

      // Rebuild statistics from all processed reports
      await this.rebuildStatistics(guild, CURRENT_RAID.id, difficulty);
    } catch (error) {
      console.error(`Error fetching ${difficulty} progress for ${guild.name}:`, error);
      throw error;
    }
  }

  private async processReport(guild: IGuild, reportData: ReportData, difficulty: "mythic" | "heroic"): Promise<void> {
    // Check if we've already processed this report
    const existingReport = await Report.findOne({ code: reportData.code });

    if (existingReport && existingReport.endTime) {
      // Report is complete and already processed, skip
      return;
    }

    // Create or update report record
    const report = await Report.findOneAndUpdate(
      { code: reportData.code },
      {
        code: reportData.code,
        guildId: guild._id,
        zoneId: CURRENT_RAID.id,
        startTime: reportData.startTime,
        endTime: reportData.endTime,
        isOngoing: !reportData.endTime,
        fightCount: reportData.fights?.length || 0,
        lastProcessed: new Date(),
      },
      { upsert: true, new: true }
    );

    // No fights to process
    if (!reportData.fights || reportData.fights.length === 0) {
      return;
    }

    // Update guild's progress based on fights in this report
    // (This will be aggregated later in rebuildStatistics)
  }

  private async rebuildStatistics(guild: IGuild, zoneId: number, difficulty: "mythic" | "heroic"): Promise<void> {
    // Get all reports for this guild and zone
    const reports = await Report.find({
      guildId: guild._id,
      zoneId: zoneId,
    }).sort({ startTime: 1 });

    if (reports.length === 0) {
      return;
    }

    // Fetch all fights from all reports and aggregate
    const bossDataMap = new Map<
      number,
      {
        encounterID: number;
        name: string;
        kills: number;
        pulls: number;
        bestPercent: number;
        bestFightPercent: number;
        totalTime: number;
        firstKillTime?: Date;
      }
    >();

    // Re-fetch fight data for each report
    // (In a production system, you'd store fight data separately)
    // For now, we'll rely on the last fetch

    // Update or create raid progress entry
    let raidProgress = guild.progress.find((p) => p.raidId === zoneId && p.difficulty === difficulty);

    if (!raidProgress) {
      raidProgress = {
        raidId: zoneId,
        raidName: CURRENT_RAID.name,
        difficulty,
        bossesDefeated: 0,
        totalBosses: 0,
        totalTimeSpent: 0,
        bosses: [],
        lastUpdated: new Date(),
      } as IRaidProgress;
      guild.progress.push(raidProgress);
    }

    raidProgress.lastUpdated = new Date();
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

  // Get guilds currently raiding
  async getGuildsCurrentlyRaiding(): Promise<IGuild[]> {
    return await Guild.find({ isCurrentlyRaiding: true });
  }
}

export default new GuildService();
