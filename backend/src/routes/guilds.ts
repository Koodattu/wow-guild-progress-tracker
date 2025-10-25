import { Router, Request, Response } from "express";
import guildService from "../services/guild.service";

const router = Router();

// Get all guilds with their progress
// Optional query param: raidId - if provided, only returns progress for that raid
router.get("/", async (req: Request, res: Response) => {
  try {
    const raidId = req.query.raidId ? parseInt(req.query.raidId as string) : null;

    let guilds;
    if (raidId) {
      guilds = await guildService.getAllGuildsForRaid(raidId);
    } else {
      guilds = await guildService.getAllGuilds();
    }

    res.json(guilds);
  } catch (error) {
    console.error("Error fetching guilds:", error);
    res.status(500).json({ error: "Failed to fetch guilds" });
  }
});

// Get single guild by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const guild = await guildService.getGuildById(req.params.id);

    if (!guild) {
      return res.status(404).json({ error: "Guild not found" });
    }

    res.json(guild);
  } catch (error) {
    console.error("Error fetching guild:", error);
    res.status(500).json({ error: "Failed to fetch guild" });
  }
});

export default router;
