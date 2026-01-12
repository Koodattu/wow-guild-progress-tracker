import { Router, Request, Response } from "express";
import guildService from "../services/guild.service";
import logger from "../utils/logger";

const router = Router();

// Get all guilds with their progress for a specific raid
// Required query param: raidId - returns progress for that raid
router.get("/", async (req: Request, res: Response) => {
  try {
    const raidId = req.query.raidId ? parseInt(req.query.raidId as string) : null;

    if (!raidId) {
      return res.status(400).json({ error: "raidId query parameter is required" });
    }

    const guilds = await guildService.getAllGuildsForRaid(raidId);
    res.json(guilds);
  } catch (error) {
    logger.error("Error fetching raid progress:", error);
    res.status(500).json({ error: "Failed to fetch raid progress" });
  }
});

export default router;
