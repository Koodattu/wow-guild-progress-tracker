import { Router, Request, Response } from "express";
import tierListService from "../services/tierlist.service";
import logger from "../utils/logger";

const router = Router();

// Get the latest tier list (overall or for a specific raid)
router.get("/", async (req: Request, res: Response) => {
  try {
    const raidId = req.query.raidId ? parseInt(req.query.raidId as string) : null;

    if (raidId) {
      const raidTierList = await tierListService.getTierListForRaid(raidId);
      if (!raidTierList) {
        return res.status(404).json({ error: "Tier list not found for this raid" });
      }
      return res.json(raidTierList);
    }

    const tierList = await tierListService.getTierList();
    if (!tierList) {
      return res.status(404).json({ error: "Tier list not found" });
    }

    res.json(tierList);
  } catch (error) {
    logger.error("Error fetching tier list:", error);
    res.status(500).json({ error: "Failed to fetch tier list" });
  }
});

// Manually trigger tier list calculation (for testing/admin)
router.post("/calculate", async (req: Request, res: Response) => {
  try {
    await tierListService.calculateTierLists();
    res.json({ message: "Tier list calculation completed" });
  } catch (error) {
    logger.error("Error calculating tier list:", error);
    res.status(500).json({ error: "Failed to calculate tier list" });
  }
});

export default router;
