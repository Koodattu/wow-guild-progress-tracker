import { Router, Request, Response } from "express";
import Raid from "../models/Raid";
import { TRACKED_RAIDS } from "../config/guilds";

const router = Router();

// Get all tracked raids
router.get("/", async (req: Request, res: Response) => {
  try {
    // Get only the tracked raids from the database
    const raids = await Raid.find({ id: { $in: TRACKED_RAIDS } }).sort({ id: -1 });
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

export default router;
