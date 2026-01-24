import { Router, Request, Response } from "express";
import characterService from "../services/character.service";

const router = Router();

router.get("/rankings/zone/:zoneId", async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.zoneId;
    const rankings = await characterService.getRankingsByZone(zoneId);
    res.json(rankings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch character rankings" });
  }
});

router.get("/leaderboard", async (req: Request, res: Response) => {
  try {
    const zoneId = Number(req.query.zoneId);
    const encounterId = req.query.encounterId
      ? Number(req.query.encounterId)
      : undefined;
    const spec = req.query.spec as string | undefined;
    const classID = req.query.classID ? Number(req.query.classID) : undefined;

    if (!zoneId) {
      return res.status(400).json({ error: "zoneId is required" });
    }

    /*
    const rankings = await characterService.getLeaderboard({
      zoneId,
      encounterId,
      spec,
      classID,
    });
    
    res.json(rankings);
    */
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
