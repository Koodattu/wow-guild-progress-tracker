import { Router, Request, Response } from "express";
import characterService from "../services/character.service";
import { CURRENT_RAID_IDS } from "../config/guilds";
import Ranking from "../models/Ranking";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const zoneId = CURRENT_RAID_IDS[0];
    if (isNaN(zoneId)) {
      return res.status(400).json({ error: "Invalid zone ID" });
    }

    const { encounter, classId, spec, specKey } = req.query;
    const options = {
      zoneId,
      encounterId: encounter ? parseInt(encounter as string) : undefined,
      classId: classId ? parseInt(classId as string) : undefined,
      spec: spec as string,
      specKey: specKey as string,
    };

    const rankings = await characterService.getZoneRankings(options);
    res.json(rankings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch zone rankings" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const zoneId = parseInt(req.params.id);
    if (isNaN(zoneId)) {
      return res.status(400).json({ error: "Invalid zone ID" });
    }

    const { encounter, classId, spec, specKey } = req.query;
    const options = {
      zoneId,
      encounterId: encounter ? parseInt(encounter as string) : undefined,
      classId: classId ? parseInt(classId as string) : undefined,
      spec: spec as string,
      specKey: specKey as string,
    };

    const rankings = await characterService.getZoneRankings(options);
    res.json(rankings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch zone rankings" });
  }
});

export default router;
