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

router.get("/leaderboard", async (req, res) => {
  try {
    // zoneId (required)
    if (!req.query.zoneId) {
      return res.status(400).json({ error: "zoneId is required" });
    }
    const zoneId = Number(req.query.zoneId);
    if (Number.isNaN(zoneId)) {
      return res.status(400).json({ error: "zoneId must be a number" });
    }

    // encounterId (optional)
    let encounterId: number | undefined;
    if (req.query.encounterId !== undefined) {
      encounterId = Number(req.query.encounterId);
      if (Number.isNaN(encounterId)) {
        return res.status(400).json({ error: "encounterId must be a number" });
      }
    }

    // classID (optional)
    let classID: number | undefined;
    if (req.query.classID !== undefined) {
      classID = Number(req.query.classID);
      if (Number.isNaN(classID)) {
        return res.status(400).json({ error: "classID must be a number" });
      }
    }

    // spec (optional)
    const spec =
      typeof req.query.spec === "string" ? req.query.spec : undefined;

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
