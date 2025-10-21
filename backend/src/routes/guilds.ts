import { Router, Request, Response } from "express";
import guildService from "../services/guild.service";
import scheduler from "../services/scheduler.service";

const router = Router();

// Get all guilds with their progress
router.get("/", async (req: Request, res: Response) => {
  try {
    const guilds = await guildService.getAllGuilds();
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

// Manually refresh a specific guild
router.post("/:id/refresh", async (req: Request, res: Response) => {
  try {
    const guild = await guildService.updateGuildProgress(req.params.id);

    if (!guild) {
      return res.status(404).json({ error: "Guild not found" });
    }

    res.json({ message: "Guild updated successfully", guild });
  } catch (error) {
    console.error("Error refreshing guild:", error);
    res.status(500).json({ error: "Failed to refresh guild" });
  }
});

// Refresh all guilds
router.post("/refresh-all", async (req: Request, res: Response) => {
  try {
    // Don't await - run in background
    scheduler.updateAllGuilds().catch((err) => {
      console.error("Background refresh error:", err);
    });

    res.json({ message: "Refresh started for all guilds" });
  } catch (error) {
    console.error("Error starting refresh:", error);
    res.status(500).json({ error: "Failed to start refresh" });
  }
});

export default router;
