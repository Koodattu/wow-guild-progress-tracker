import { Router, Request, Response } from "express";
import Raid from "../models/Raid";
import { TRACKED_RAIDS } from "../config/guilds";

const router = Router();

// Get all tracked raids (minimal data, without bosses or dates)
router.get("/", async (req: Request, res: Response) => {
  try {
    // Get only the tracked raids from the database, excluding unnecessary fields
    const raids = await Raid.find({ id: { $in: TRACKED_RAIDS } })
      .select("id name slug expansion iconUrl -_id")
      .sort({ id: -1 });
    res.json(raids);
  } catch (error) {
    console.error("Error fetching raids:", error);
    res.status(500).json({ error: "Failed to fetch raids" });
  }
});

// Get single raid by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const raidId = parseInt(req.params.id);
    const raid = await Raid.findOne({ id: raidId });

    if (!raid) {
      return res.status(404).json({ error: "Raid not found" });
    }

    res.json(raid);
  } catch (error) {
    console.error("Error fetching raid:", error);
    res.status(500).json({ error: "Failed to fetch raid" });
  }
});

// Get bosses for a specific raid
router.get("/:id/bosses", async (req: Request, res: Response) => {
  try {
    const raidId = parseInt(req.params.id);
    const raid = await Raid.findOne({ id: raidId }).select("bosses -_id");

    if (!raid) {
      return res.status(404).json({ error: "Raid not found" });
    }

    // Return only the bosses array without _id fields
    const bosses = raid.bosses.map((boss: any) => ({
      id: boss.id,
      name: boss.name,
      slug: boss.slug,
      iconUrl: boss.iconUrl,
    }));

    res.json(bosses);
  } catch (error) {
    console.error("Error fetching raid bosses:", error);
    res.status(500).json({ error: "Failed to fetch raid bosses" });
  }
});

// Get start/end dates for a specific raid
router.get("/:id/dates", async (req: Request, res: Response) => {
  try {
    const raidId = parseInt(req.params.id);
    const raid = await Raid.findOne({ id: raidId }).select("starts ends -_id");

    if (!raid) {
      return res.status(404).json({ error: "Raid not found" });
    }

    // Return only the dates
    res.json({
      starts: raid.starts,
      ends: raid.ends,
    });
  } catch (error) {
    console.error("Error fetching raid dates:", error);
    res.status(500).json({ error: "Failed to fetch raid dates" });
  }
});

export default router;
