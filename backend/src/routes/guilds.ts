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

// Get detailed boss progress for a specific guild and raid (returns only progress array)
router.get("/:id/raids/:raidId/bosses", async (req: Request, res: Response) => {
  try {
    const guildId = req.params.id;
    const raidId = parseInt(req.params.raidId);

    const bossProgress = await guildService.getGuildBossProgressForRaid(guildId, raidId);

    if (!bossProgress) {
      return res.status(404).json({ error: "Guild not found" });
    }

    res.json(bossProgress);
  } catch (error) {
    console.error("Error fetching guild boss progress:", error);
    res.status(500).json({ error: "Failed to fetch guild boss progress" });
  }
});

// Get single guild by ID with summary progress (without boss details)
router.get("/:id/summary", async (req: Request, res: Response) => {
  try {
    const guildId = req.params.id;
    const summary = await guildService.getGuildSummary(guildId);

    if (!summary) {
      return res.status(404).json({ error: "Guild not found" });
    }

    res.json(summary);
  } catch (error) {
    console.error("Error fetching guild summary:", error);
    res.status(500).json({ error: "Failed to fetch guild summary" });
  }
});

// Get single guild by ID with full progress for all raids
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

// Get full guild profile with all raid progress (including boss details)
router.get("/:id/profile", async (req: Request, res: Response) => {
  try {
    const guildId = req.params.id;
    const fullProfile = await guildService.getGuildFullProfile(guildId);

    if (!fullProfile) {
      return res.status(404).json({ error: "Guild not found" });
    }

    res.json(fullProfile);
  } catch (error) {
    console.error("Error fetching guild profile:", error);
    res.status(500).json({ error: "Failed to fetch guild profile" });
  }
});

export default router;
