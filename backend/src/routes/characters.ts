import { Router, Request, Response } from "express";
import characterService from "../services/character.service";

const router = Router();

router.get(
  "/rankings/:characterId/zone/:zoneId",
  async (req: Request, res: Response) => {
    try {
      const characterId = req.params.characterId;
      const zoneId = req.params.zoneId;
      const rankings = await characterService.getCharacterRankingsByZone(
        zoneId,
        characterId,
      );
      res.json(rankings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch character rankings" });
    }
  },
);

router.get(
  "/rankings/:characterId/zone/:zoneId",
  async (req: Request, res: Response) => {
    try {
      const characterId = req.params.characterId;
      const zoneId = req.params.zoneId;
      const rankings = await characterService.getCharacterRankingsByZone(
        zoneId,
        characterId,
      );
      res.json(rankings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch character rankings" });
    }
  },
);

export default router;
