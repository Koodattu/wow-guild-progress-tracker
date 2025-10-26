import { Router, Request, Response } from "express";
import Event from "../models/Event";

const router = Router();

// Get recent events with pagination
router.get("/", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;

    const [events, totalCount] = await Promise.all([Event.find().sort({ timestamp: -1 }).skip(skip).limit(limit), Event.countDocuments()]);

    res.json({
      events,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// Get events for a specific guild
router.get("/guild/:guildId", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;

    const [events, totalCount] = await Promise.all([
      Event.find({ guildId: req.params.guildId }).sort({ timestamp: -1 }).skip(skip).limit(limit),
      Event.countDocuments({ guildId: req.params.guildId }),
    ]);

    res.json({
      events,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching guild events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

export default router;
