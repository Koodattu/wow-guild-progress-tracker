import { Router, Request, Response } from "express";
import guildService from "../services/guild.service";
import eventService from "../services/guild.service";
import raidService from "../services/guild.service";
import logger from "../utils/logger";
import { CURRENT_RAID_IDS } from "../config/guilds";
import Raid from "../models/Raid";
import Event from "../models/Event";
import cacheService from "../services/cache.service";
import { cacheMiddleware } from "../middleware/cache.middleware";

const router = Router();

// Get all data needed for the home page in a single request
// Returns: current raid info, raid dates, sorted guilds with progress, and recent events
router.get(
  "/",
  cacheMiddleware(
    (req) => cacheService.getHomeKey(),
    (req) => cacheService.CURRENT_RAID_TTL
  ),
  async (req: Request, res: Response) => {
    try {
      const currentRaidId = CURRENT_RAID_IDS[0];

      // Fetch all necessary data in parallel
      const [guilds, events, raid, raidDatesDoc] = await Promise.all([
        guildService.getAllGuildsForRaid(currentRaidId),
        Event.find().sort({ timestamp: -1 }).limit(5).lean(),
        Raid.findOne({ id: currentRaidId }).lean(),
        Raid.findOne({ id: currentRaidId }).select("starts ends").lean(),
      ]);

      if (!raid) {
        return res.status(404).json({ error: "Current raid not found" });
      }

      // Sort guilds by backend-calculated guild rank (lower is better)
      const sortedGuilds = guilds.sort((a, b) => {
        const aMythic = a.progress.find((p: any) => p.difficulty === "mythic" && p.raidId === currentRaidId);
        const bMythic = b.progress.find((p: any) => p.difficulty === "mythic" && p.raidId === currentRaidId);
        const aHeroic = a.progress.find((p: any) => p.difficulty === "heroic" && p.raidId === currentRaidId);
        const bHeroic = b.progress.find((p: any) => p.difficulty === "heroic" && p.raidId === currentRaidId);

        // Get the effective progress (mythic if exists, otherwise heroic)
        const aProgress = aMythic || aHeroic;
        const bProgress = bMythic || bHeroic;

        // Guilds without progress go to the end
        if (!aProgress && !bProgress) return 0;
        if (!aProgress) return 1;
        if (!bProgress) return -1;

        // Use backend-calculated guildRank (lower is better)
        const aRank = aProgress.guildRank ?? 999;
        const bRank = bProgress.guildRank ?? 999;

        return aRank - bRank;
      });

      // Prepare response
      const response = {
        raid: {
          id: raid.id,
          name: raid.name,
          slug: raid.slug,
          expansion: raid.expansion,
          iconUrl: raid.iconUrl,
        },
        dates: {
          starts: raidDatesDoc?.starts,
          ends: raidDatesDoc?.ends,
        },
        guilds: sortedGuilds,
        events: events,
      };

      res.json(response);
    } catch (error) {
      logger.error("Error fetching home page data:", error);
      res.status(500).json({ error: "Failed to fetch home page data" });
    }
  }
);

export default router;
