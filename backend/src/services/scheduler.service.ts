import cron from "node-cron";
import mongoose from "mongoose";
import Guild from "../models/Guild";
import guildService from "./guild.service";
import { CURRENT_RAID_ID } from "../config/guilds";

class UpdateScheduler {
  private hotHoursActiveInterval: NodeJS.Timeout | null = null;
  private hotHoursRaidingInterval: NodeJS.Timeout | null = null;
  private offHoursActiveInterval: NodeJS.Timeout | null = null;
  private offHoursDailyInterval: NodeJS.Timeout | null = null;
  private isUpdatingHotActive: boolean = false;
  private isUpdatingHotRaiding: boolean = false;
  private isUpdatingOffActive: boolean = false;
  private isUpdatingOffInactive: boolean = false;
  private isUpdatingNightlyWorldRanks: boolean = false;
  private isUpdatingGuildCrests: boolean = false;

  // Finnish timezone offset check
  private isHotHours(): boolean {
    // Finnish time is EET (UTC+2) or EEST (UTC+3) in summer
    // Hot hours: 16:00 - 01:00 (4 PM - 1 AM Finnish time)
    const now = new Date();

    // Convert to Finnish time (using Europe/Helsinki timezone)
    const finnishTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));

    const hour = finnishTime.getHours();

    // Hot hours: 16:00 (4 PM) to 01:00 (1 AM)
    // This means: hour >= 16 OR hour < 1
    return hour >= 16 || hour < 1;
  }

  // Start the background update process
  start(): void {
    console.log("Starting intelligent background update scheduler...");
    console.log("Finnish time hot hours: 16:00 - 01:00 (4 PM - 1 AM)");
    console.log("Off hours: 01:00 - 16:00 (1 AM - 4 PM)");

    // HOT HOURS - Active guilds: Check every 15 minutes
    this.hotHoursActiveInterval = setInterval(async () => {
      if (!this.isHotHours()) return; // Skip if not hot hours

      if (this.isUpdatingHotActive) {
        console.log("[Hot/Active] Previous update still in progress, skipping...");
        return;
      }
      await this.updateActiveGuilds();
    }, 15 * 60 * 1000); // 15 minutes

    // HOT HOURS - Currently raiding guilds: Check every 5 minutes
    this.hotHoursRaidingInterval = setInterval(async () => {
      if (!this.isHotHours()) return; // Skip if not hot hours

      if (this.isUpdatingHotRaiding) {
        console.log("[Hot/Raiding] Previous update still in progress, skipping...");
        return;
      }
      await this.updateRaidingGuilds();
    }, 5 * 60 * 1000); // 5 minutes

    // OFF HOURS - Active guilds: Check every hour
    this.offHoursActiveInterval = setInterval(async () => {
      if (this.isHotHours()) return; // Skip if hot hours

      if (this.isUpdatingOffActive) {
        console.log("[Off/Active] Previous update still in progress, skipping...");
        return;
      }
      await this.updateActiveGuildsOffHours();
    }, 60 * 60 * 1000); // 1 hour

    // OFF HOURS - Inactive guilds: Check once per day (at 10 AM Finnish time)
    cron.schedule(
      "0 10 * * *",
      async () => {
        if (this.isUpdatingOffInactive) {
          console.log("[Daily/Inactive] Previous update still in progress, skipping...");
          return;
        }
        await this.updateInactiveGuilds();
      },
      {
        timezone: "Europe/Helsinki",
      }
    );

    // NIGHTLY: Update all guilds' world ranks for current raid (at 4 AM European time)
    // WCL sometimes updates world ranks with a delay, so this ensures we catch those updates
    cron.schedule(
      "0 4 * * *",
      async () => {
        if (this.isUpdatingNightlyWorldRanks) {
          console.log("[Nightly/WorldRanks] Previous update still in progress, skipping...");
          return;
        }
        await this.updateAllGuildsWorldRanks();
      },
      {
        timezone: "Europe/Helsinki",
      }
    );

    // NIGHTLY: Update all guild crests (at 4 AM Finnish time)
    // Guild crests can be changed by guilds or sometimes fail to fetch initially
    cron.schedule(
      "0 4 * * *",
      async () => {
        if (this.isUpdatingGuildCrests) {
          console.log("[Nightly/GuildCrests] Previous update still in progress, skipping...");
          return;
        }
        await this.updateAllGuildCrests();
      },
      {
        timezone: "Europe/Helsinki",
      }
    );

    console.log("Background scheduler started:");
    console.log("  - Hot hours (16:00-01:00):");
    console.log("    * Active guilds: every 15 minutes");
    console.log("    * Raiding guilds: every 5 minutes");
    console.log("  - Off hours (01:00-16:00):");
    console.log("    * Active guilds: every 60 minutes");
    console.log("    * Inactive guilds: once daily at 10:00");
    console.log("  - Nightly jobs:");
    console.log("    * World ranks update: daily at 04:00");
    console.log("    * Guild crests update: daily at 04:00");

    // Do an initial update based on current time
    if (this.isHotHours()) {
      console.log("Currently HOT HOURS - starting initial active guild check");
      this.updateActiveGuilds();
    } else {
      console.log("Currently OFF HOURS - starting initial active guild check");
      this.updateActiveGuildsOffHours();
    }
  }

  // Stop the background process
  stop(): void {
    if (this.hotHoursActiveInterval) {
      clearInterval(this.hotHoursActiveInterval);
      this.hotHoursActiveInterval = null;
    }
    if (this.hotHoursRaidingInterval) {
      clearInterval(this.hotHoursRaidingInterval);
      this.hotHoursRaidingInterval = null;
    }
    if (this.offHoursActiveInterval) {
      clearInterval(this.offHoursActiveInterval);
      this.offHoursActiveInterval = null;
    }
    console.log("Background scheduler stopped");
  }

  // Update activity status for all guilds based on their last log time
  private async updateGuildActivityStatus(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Mark guilds as inactive if no logs in 30+ days
      await Guild.updateMany(
        {
          $or: [{ lastLogEndTime: { $lt: thirtyDaysAgo } }, { lastLogEndTime: { $exists: false } }],
        },
        { $set: { activityStatus: "inactive" } }
      );

      // Mark guilds as active if they have logs within 30 days
      await Guild.updateMany({ lastLogEndTime: { $gte: thirtyDaysAgo } }, { $set: { activityStatus: "active" } });
    } catch (error) {
      console.error("[Activity Status] Error updating guild activity status:", error);
    }
  }

  // HOT HOURS: Update active guilds (every 15 minutes during 16:00-01:00)
  private async updateActiveGuilds(): Promise<void> {
    this.isUpdatingHotActive = true;

    try {
      // First, update activity statuses
      await this.updateGuildActivityStatus();

      // Get active guilds that are NOT currently raiding (raiding guilds handled separately)
      const guilds = await Guild.find({
        activityStatus: "active",
        isCurrentlyRaiding: { $ne: true },
      });

      if (guilds.length === 0) {
        console.log("[Hot/Active] No active guilds to update");
        this.isUpdatingHotActive = false;
        return;
      }

      console.log(`[Hot/Active] Updating ${guilds.length} active guild(s)...`);

      // Update all active guilds sequentially
      for (let i = 0; i < guilds.length; i++) {
        console.log(`[Hot/Active] Guild ${i + 1}/${guilds.length}: ${guilds[i].name}`);
        await guildService.updateGuildProgress((guilds[i]._id as mongoose.Types.ObjectId).toString());
      }

      console.log(`[Hot/Active] Completed updating ${guilds.length} guild(s)`);
    } catch (error) {
      console.error("[Hot/Active] Error:", error);
    } finally {
      this.isUpdatingHotActive = false;
    }
  }

  // HOT HOURS: Update currently raiding guilds (every 5 minutes during 16:00-01:00)
  private async updateRaidingGuilds(): Promise<void> {
    this.isUpdatingHotRaiding = true;

    try {
      // Get guilds that are currently raiding
      const raidingGuilds = await guildService.getGuildsCurrentlyRaiding();

      if (raidingGuilds.length === 0) {
        // No raiding guilds, nothing to do
        this.isUpdatingHotRaiding = false;
        return;
      }

      console.log(`[Hot/Raiding] Updating ${raidingGuilds.length} actively raiding guild(s)...`);

      // Update all raiding guilds sequentially
      for (let i = 0; i < raidingGuilds.length; i++) {
        console.log(`[Hot/Raiding] Guild ${i + 1}/${raidingGuilds.length}: ${raidingGuilds[i].name}`);
        await guildService.updateGuildProgress((raidingGuilds[i]._id as mongoose.Types.ObjectId).toString());
      }

      console.log(`[Hot/Raiding] Completed updating ${raidingGuilds.length} guild(s)`);
    } catch (error) {
      console.error("[Hot/Raiding] Error:", error);
    } finally {
      this.isUpdatingHotRaiding = false;
    }
  }

  // OFF HOURS: Update active guilds (every hour during 01:00-16:00)
  private async updateActiveGuildsOffHours(): Promise<void> {
    this.isUpdatingOffActive = true;

    try {
      // First, update activity statuses
      await this.updateGuildActivityStatus();

      // Get active guilds (not currently raiding during off hours is unlikely, but check anyway)
      const guilds = await Guild.find({
        activityStatus: "active",
        isCurrentlyRaiding: { $ne: true },
      });

      if (guilds.length === 0) {
        console.log("[Off/Active] No active guilds to update");
        this.isUpdatingOffActive = false;
        return;
      }

      console.log(`[Off/Active] Updating ${guilds.length} active guild(s)...`);

      // Update all active guilds sequentially
      for (let i = 0; i < guilds.length; i++) {
        console.log(`[Off/Active] Guild ${i + 1}/${guilds.length}: ${guilds[i].name}`);
        await guildService.updateGuildProgress((guilds[i]._id as mongoose.Types.ObjectId).toString());
      }

      console.log(`[Off/Active] Completed updating ${guilds.length} guild(s)`);
    } catch (error) {
      console.error("[Off/Active] Error:", error);
    } finally {
      this.isUpdatingOffActive = false;
    }
  }

  // OFF HOURS: Update inactive guilds (once daily at 10:00)
  private async updateInactiveGuilds(): Promise<void> {
    this.isUpdatingOffInactive = true;

    try {
      // First, update activity statuses
      await this.updateGuildActivityStatus();

      // Get inactive guilds
      const guilds = await Guild.find({ activityStatus: "inactive" });

      if (guilds.length === 0) {
        console.log("[Daily/Inactive] No inactive guilds to update");
        this.isUpdatingOffInactive = false;
        return;
      }

      console.log(`[Daily/Inactive] Updating ${guilds.length} inactive guild(s)...`);

      // Update all inactive guilds sequentially with a small delay between each
      for (let i = 0; i < guilds.length; i++) {
        console.log(`[Daily/Inactive] Guild ${i + 1}/${guilds.length}: ${guilds[i].name}`);
        await guildService.updateGuildProgress((guilds[i]._id as mongoose.Types.ObjectId).toString());

        // Small delay to avoid overwhelming the API
        if (i < guilds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      console.log(`[Daily/Inactive] Completed updating ${guilds.length} guild(s)`);
    } catch (error) {
      console.error("[Daily/Inactive] Error:", error);
    } finally {
      this.isUpdatingOffInactive = false;
    }
  }

  // Manually trigger update of all guilds
  async updateAllGuilds(): Promise<void> {
    console.log("Starting full update of all guilds...");
    const guilds = await Guild.find();

    for (let i = 0; i < guilds.length; i++) {
      const guild = guilds[i];
      console.log(`Updating ${i + 1}/${guilds.length}: ${guild.name}`);

      try {
        await guildService.updateGuildProgress((guild._id as mongoose.Types.ObjectId).toString());
        // Small delay between guilds to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Failed to update ${guild.name}:`, error);
      }
    }

    console.log("Full update completed");
  }

  // NIGHTLY: Update world ranks for all guilds for the current raid (at 4 AM European time)
  // WCL sometimes updates world ranks with a delay, so this ensures we catch those updates
  private async updateAllGuildsWorldRanks(): Promise<void> {
    this.isUpdatingNightlyWorldRanks = true;

    try {
      // Get all guilds
      const guilds = await Guild.find();

      if (guilds.length === 0) {
        console.log("[Nightly/WorldRanks] No guilds to update");
        this.isUpdatingNightlyWorldRanks = false;
        return;
      }

      console.log(`[Nightly/WorldRanks] Updating world ranks for current raid for ${guilds.length} guild(s)...`);

      // Update world ranks for all guilds sequentially with a small delay between each
      for (let i = 0; i < guilds.length; i++) {
        const guild = guilds[i];
        console.log(`[Nightly/WorldRanks] Guild ${i + 1}/${guilds.length}: ${guild.name}`);

        try {
          await guildService.updateCurrentRaidWorldRanking((guild._id as mongoose.Types.ObjectId).toString());

          // Small delay to avoid overwhelming the API (3 seconds between guilds)
          if (i < guilds.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        } catch (error) {
          console.error(`[Nightly/WorldRanks] Failed to update world rank for ${guild.name}:`, error);
          // Continue with next guild even if one fails
        }
      }

      // Recalculate guild rankings after all world ranks are updated
      console.log(`[Nightly/WorldRanks] Recalculating guild rankings for current raid...`);
      await guildService.calculateGuildRankingsForRaid(CURRENT_RAID_ID);

      console.log(`[Nightly/WorldRanks] Completed updating world ranks for ${guilds.length} guild(s)`);
    } catch (error) {
      console.error("[Nightly/WorldRanks] Error:", error);
    } finally {
      this.isUpdatingNightlyWorldRanks = false;
    }
  }

  // NIGHTLY: Update all guild crests (at 4 AM Finnish time)
  // Guild crests can be changed by guilds or sometimes fail to fetch initially
  private async updateAllGuildCrests(): Promise<void> {
    this.isUpdatingGuildCrests = true;

    try {
      console.log("[Nightly/GuildCrests] Starting guild crest update...");
      await guildService.updateAllGuildCrests();
      console.log("[Nightly/GuildCrests] Guild crest update completed");
    } catch (error) {
      console.error("[Nightly/GuildCrests] Error:", error);
    } finally {
      this.isUpdatingGuildCrests = false;
    }
  }
}

export default new UpdateScheduler();
