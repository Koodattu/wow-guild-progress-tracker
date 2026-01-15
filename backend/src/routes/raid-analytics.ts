import { Router, Request, Response } from "express";
import raidAnalyticsService from "../services/raid-analytics.service";
import cacheService from "../services/cache.service";
import { cacheMiddleware } from "../middleware/cache.middleware";
import logger from "../utils/logger";

const router = Router();

// Cache TTL for raid analytics (1 hour - data is calculated nightly)
const RAID_ANALYTICS_TTL = 60 * 60 * 1000;

/**
 * Get list of raids that have analytics available
 * GET /api/raid-analytics/raids
 */
router.get("/raids", async (req: Request, res: Response) => {
  try {
    const raids = await raidAnalyticsService.getAvailableRaids();
    res.json(raids);
  } catch (error) {
    logger.error("Error fetching available raids for analytics:", error);
    res.status(500).json({ error: "Failed to fetch available raids" });
  }
});

/**
 * Get analytics for a specific raid
 * GET /api/raid-analytics/:raidId
 */
router.get(
  "/:raidId",
  cacheMiddleware(
    (req) => `raid-analytics:${req.params.raidId}`,
    () => RAID_ANALYTICS_TTL
  ),
  async (req: Request, res: Response) => {
    try {
      const raidId = parseInt(req.params.raidId);

      if (isNaN(raidId)) {
        return res.status(400).json({ error: "Invalid raid ID" });
      }

      const analytics = await raidAnalyticsService.getRaidAnalytics(raidId);

      if (!analytics) {
        return res.status(404).json({ error: "No analytics found for this raid" });
      }

      res.json(analytics);
    } catch (error) {
      logger.error("Error fetching raid analytics:", error);
      res.status(500).json({ error: "Failed to fetch raid analytics" });
    }
  }
);

export default router;
