import { Router, Request, Response } from "express";
import guildService from "../services/guild.service";

const router = Router();

// Get all guilds with only their raid schedules (for calendar/timetable view)
router.get("/schedules", async (req: Request, res: Response) => {
  try {
    const schedules = await guildService.getAllGuildSchedules();
    res.json(schedules);
  } catch (error) {
    console.error("Error fetching guild schedules:", error);
    res.status(500).json({ error: "Failed to fetch guild schedules" });
  }
});

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

// Get detailed boss progress for a specific guild and raid by realm/name (returns only progress array)
router.get("/:realm/:name/raids/:raidId/bosses", async (req: Request, res: Response) => {
  try {
    const realm = decodeURIComponent(req.params.realm);
    const name = decodeURIComponent(req.params.name);
    const raidId = parseInt(req.params.raidId);

    const bossProgress = await guildService.getGuildBossProgressForRaidByRealmName(realm, name, raidId);

    if (!bossProgress) {
      return res.status(404).json({ error: "Guild not found" });
    }

    res.json(bossProgress);
  } catch (error) {
    console.error("Error fetching guild boss progress:", error);
    res.status(500).json({ error: "Failed to fetch guild boss progress" });
  }
});

// DEPRECATED: Get detailed boss progress by ObjectId (kept for backward compatibility)
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

// Get guild summary by realm/name (without boss details)
router.get("/:realm/:name/summary", async (req: Request, res: Response) => {
  try {
    const realm = decodeURIComponent(req.params.realm);
    const name = decodeURIComponent(req.params.name);
    const summary = await guildService.getGuildSummaryByRealmName(realm, name);

    if (!summary) {
      return res.status(404).json({ error: "Guild not found" });
    }

    res.json(summary);
  } catch (error) {
    console.error("Error fetching guild summary:", error);
    res.status(500).json({ error: "Failed to fetch guild summary" });
  }
});

// DEPRECATED: Get single guild by ID with summary progress (kept for backward compatibility)
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

// DEBUG: Fetch and log guild zone rankings for a specific zone
router.get("/:id/debug/rankings/:zoneId", async (req: Request, res: Response) => {
  try {
    const guildId = req.params.id;
    const zoneId = parseInt(req.params.zoneId);

    console.log(`\n[DEBUG ENDPOINT] Fetching zone rankings for guild ${guildId}, zone ${zoneId}`);

    await guildService.fetchGuildZoneRankings(guildId, zoneId);

    res.json({
      success: true,
      message: "Zone rankings fetched. Check server console logs for detailed output.",
    });
  } catch (error) {
    console.error("Error fetching guild zone rankings:", error);
    res.status(500).json({ error: "Failed to fetch guild zone rankings" });
  }
});

// DEBUG: Fetch and log guild zone rankings for current raid
router.get("/:id/debug/rankings", async (req: Request, res: Response) => {
  try {
    const guildId = req.params.id;

    console.log(`\n[DEBUG ENDPOINT] Fetching zone rankings for guild ${guildId} (current raid)`);

    await guildService.fetchGuildZoneRankings(guildId);

    res.json({
      success: true,
      message: "Zone rankings fetched. Check server console logs for detailed output.",
    });
  } catch (error) {
    console.error("Error fetching guild zone rankings:", error);
    res.status(500).json({ error: "Failed to fetch guild zone rankings" });
  }
});

export default router;
