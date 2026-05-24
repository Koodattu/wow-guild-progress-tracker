import { Router, Request, Response } from "express";
import compareService from "../services/compare.service";
import cacheService from "../services/cache.service";
import { cacheMiddleware } from "../middleware/cache.middleware";
import logger from "../utils/logger";

const router = Router();

router.get(
  "/:raidId",
  cacheMiddleware(
    (req) => cacheService.getCompareKey(parseInt(req.params.raidId)),
    (req) => cacheService.getTTLForRaid(parseInt(req.params.raidId)),
  ),
  async (req: Request, res: Response) => {
    try {
      const raidId = parseInt(req.params.raidId);

      if (Number.isNaN(raidId)) {
        return res.status(400).json({ error: "Invalid raid ID" });
      }

      const compare = await compareService.getRaidCompare(raidId);

      if (!compare) {
        return res.status(404).json({ error: "Raid not found" });
      }

      res.json(compare);
    } catch (error) {
      logger.error("Error fetching raid compare data:", error);
      res.status(500).json({ error: "Failed to fetch raid compare data" });
    }
  },
);

export default router;
