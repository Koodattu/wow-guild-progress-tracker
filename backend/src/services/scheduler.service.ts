import cron from "node-cron";
import mongoose from "mongoose";
import Guild from "../models/Guild";
import guildService from "./guild.service";

class UpdateScheduler {
  private normalUpdateInterval: NodeJS.Timeout | null = null;
  private raidingUpdateInterval: NodeJS.Timeout | null = null;
  private isUpdatingNormal: boolean = false;
  private isUpdatingRaiding: boolean = false;

  // Start the background update process
  start(): void {
    console.log("Starting background update scheduler...");

    // Normal guilds: Update every 5 minutes
    this.normalUpdateInterval = setInterval(async () => {
      if (this.isUpdatingNormal) {
        console.log("Previous normal update still in progress, skipping...");
        return;
      }
      await this.updateNormalGuilds();
    }, 5 * 60 * 1000); // 5 minutes

    // Raiding guilds: Update every 1 minute
    this.raidingUpdateInterval = setInterval(async () => {
      if (this.isUpdatingRaiding) {
        console.log("Previous raiding update still in progress, skipping...");
        return;
      }
      await this.updateRaidingGuilds();
    }, 60 * 1000); // 1 minute

    console.log("Background scheduler started:");
    console.log("  - Normal guilds: every 5 minutes");
    console.log("  - Raiding guilds: every 1 minute");

    // Do an initial update
    this.updateNormalGuilds();
  }

  // Stop the background process
  stop(): void {
    if (this.normalUpdateInterval) {
      clearInterval(this.normalUpdateInterval);
      this.normalUpdateInterval = null;
    }
    if (this.raidingUpdateInterval) {
      clearInterval(this.raidingUpdateInterval);
      this.raidingUpdateInterval = null;
    }
    console.log("Background scheduler stopped");
  }

  private async updateNormalGuilds(): Promise<void> {
    this.isUpdatingNormal = true;

    try {
      // Get all guilds that are NOT currently raiding
      const guilds = await Guild.find({ isCurrentlyRaiding: { $ne: true } });

      if (guilds.length === 0) {
        console.log("[Normal Update] No guilds to update");
        this.isUpdatingNormal = false;
        return;
      }

      console.log(`[Normal Update] Updating ${guilds.length} guild(s)...`);

      // Update all normal guilds sequentially
      for (let i = 0; i < guilds.length; i++) {
        console.log(`[Normal Update] Guild ${i + 1}/${guilds.length}: ${guilds[i].name}`);
        await guildService.updateGuildProgress((guilds[i]._id as mongoose.Types.ObjectId).toString());
      }

      console.log(`[Normal Update] Completed updating ${guilds.length} guild(s)`);
    } catch (error) {
      console.error("[Normal Update] Error:", error);
    } finally {
      this.isUpdatingNormal = false;
    }
  }

  private async updateRaidingGuilds(): Promise<void> {
    this.isUpdatingRaiding = true;

    try {
      // Get guilds that are currently raiding
      const raidingGuilds = await guildService.getGuildsCurrentlyRaiding();

      if (raidingGuilds.length === 0) {
        // No raiding guilds, nothing to do
        this.isUpdatingRaiding = false;
        return;
      }

      console.log(`[Raiding Update] Updating ${raidingGuilds.length} actively raiding guild(s)...`);

      // Update all raiding guilds sequentially
      for (let i = 0; i < raidingGuilds.length; i++) {
        console.log(`[Raiding Update] Guild ${i + 1}/${raidingGuilds.length}: ${raidingGuilds[i].name}`);
        await guildService.updateGuildProgress((raidingGuilds[i]._id as mongoose.Types.ObjectId).toString());
      }

      console.log(`[Raiding Update] Completed updating ${raidingGuilds.length} guild(s)`);
    } catch (error) {
      console.error("[Raiding Update] Error:", error);
    } finally {
      this.isUpdatingRaiding = false;
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
}

export default new UpdateScheduler();
