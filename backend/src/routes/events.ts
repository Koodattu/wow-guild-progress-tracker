import { Router, Request, Response } from "express";
import Event from "../models/Event";
import Guild from "../models/Guild";
import logger from "../utils/logger";
import cacheService from "../services/cache.service";
import { cacheMiddleware } from "../middleware/cache.middleware";

const router = Router();

// Get recent events with pagination
router.get(
  "/",
  cacheMiddleware(
    (req) => {
      const limit = parseInt(req.query.limit as string) || 50;
      return cacheService.getEventsKey(limit);
    },
    (req) => cacheService.getEventsTTL()
  ),
  async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const page = parseInt(req.query.page as string) || 1;
      const skip = (page - 1) * limit;

      const [events, totalCount] = await Promise.all([Event.find().sort({ timestamp: -1 }).skip(skip).limit(limit).select("-__v -createdAt -updatedAt"), Event.countDocuments()]);

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
      logger.error("Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  }
);

// Get events for a specific guild by realm and name
router.get("/guild/:realm/:name", async (req: Request, res: Response) => {
  try {
    const realm = decodeURIComponent(req.params.realm);
    const name = decodeURIComponent(req.params.name);
    const limit = parseInt(req.query.limit as string) || 50;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;

    // Find the guild by realm and name to get the guildId
    const guild = await Guild.findOne({ realm, name });

    if (!guild) {
      return res.status(404).json({ error: "Guild not found" });
    }

    const [events, totalCount] = await Promise.all([
      Event.find({ guildId: guild._id }).sort({ timestamp: -1 }).skip(skip).limit(limit).select("-__v -createdAt -updatedAt"),
      Event.countDocuments({ guildId: guild._id }),
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
    logger.error("Error fetching guild events:", error);
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
      Event.find({ guildId: req.params.guildId }).sort({ timestamp: -1 }).skip(skip).limit(limit).select("-__v -createdAt -updatedAt"),
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
    logger.error("Error fetching guild events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

export default router;
