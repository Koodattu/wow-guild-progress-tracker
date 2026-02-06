import { Router, Request, Response } from "express";
import tierListService from "../services/tierlist.service";
import cacheService from "../services/cache.service";
import { cacheMiddleware } from "../middleware/cache.middleware";
import logger from "../utils/logger";

const router = Router();

// Get the latest tier list (overall or for a specific raid)
// Query params:
// - raidId: number - get tier list for a specific raid
// - type: "overall" - get only overall tier list (no per-raid data)
// - No params: get full tier list (overall + all raids) - for backwards compatibility
router.get(
  "/",
  cacheMiddleware(
    (req) => {
      const raidId = req.query.raidId ? parseInt(req.query.raidId as string) : null;
      const type = req.query.type as string;

      if (raidId) {
        return cacheService.getTierListRaidKey(raidId);
      }
      if (type === "overall") {
        return cacheService.getTierListOverallKey();
      }
      return cacheService.getTierListFullKey();
    },
    () => cacheService.TIER_LIST_TTL,
  ),
  async (req: Request, res: Response) => {
    try {
      const raidId = req.query.raidId ? parseInt(req.query.raidId as string) : null;
      const type = req.query.type as string;

      // Get tier list for a specific raid
      if (raidId) {
        const raidTierList = await tierListService.getTierListForRaid(raidId);
        if (!raidTierList) {
          return res.status(404).json({ error: "Tier list not found for this raid" });
        }
        return res.json(raidTierList);
      }

      // Get only overall tier list
      if (type === "overall") {
        const overallTierList = await tierListService.getOverallTierList();
        if (!overallTierList) {
          return res.status(404).json({ error: "Tier list not found" });
        }
        return res.json(overallTierList);
      }

      // Get full tier list (backwards compatibility)
      const tierList = await tierListService.getTierList();
      if (!tierList) {
        return res.status(404).json({ error: "Tier list not found" });
      }

      res.json(tierList);
    } catch (error) {
      logger.error("Error fetching tier list:", error);
      res.status(500).json({ error: "Failed to fetch tier list" });
    }
  },
);

// Get available raids that have tier list data
router.get(
  "/raids",
  cacheMiddleware(
    () => cacheService.getTierListRaidsKey(),
    () => cacheService.TIER_LIST_TTL,
  ),
  async (req: Request, res: Response) => {
    try {
      const raids = await tierListService.getAvailableRaids();
      res.json(raids);
    } catch (error) {
      logger.error("Error fetching available raids:", error);
      res.status(500).json({ error: "Failed to fetch available raids" });
    }
  },
);

// Manually trigger tier list calculation (for testing/admin)
// Also invalidates the tier list caches
router.post("/calculate", async (req: Request, res: Response) => {
  try {
    await tierListService.calculateTierLists();
    // Invalidate tier list caches after recalculation
    await cacheService.invalidateTierListCaches();
    res.json({ message: "Tier list calculation completed" });
  } catch (error) {
    logger.error("Error calculating tier list:", error);
    res.status(500).json({ error: "Failed to calculate tier list" });
  }
});

export default router;
