import { Router, Request, Response } from "express";
import Event from "../models/Event";

const router = Router();

// Get recent events
router.get("/", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const events = await Event.find().sort({ timestamp: -1 }).limit(limit);

    res.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// Get events for a specific guild
router.get("/guild/:guildId", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const events = await Event.find({ guildId: req.params.guildId }).sort({ timestamp: -1 }).limit(limit);

    res.json(events);
  } catch (error) {
    console.error("Error fetching guild events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

export default router;
