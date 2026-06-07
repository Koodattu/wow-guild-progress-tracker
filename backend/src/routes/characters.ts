import { Router, Request, Response } from "express";
import characterService from "../services/character.service";
import logger from "../utils/logger";

const router = Router();

router.get("/search", async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 10;

    const characters = await characterService.searchCharacters(query, Number.isFinite(limit) ? limit : 10);
    res.json({ characters });
  } catch (error) {
    logger.error("Error searching characters:", error);
    res.status(500).json({ error: "Failed to search characters" });
  }
});

router.get("/:realm/:name", async (req: Request, res: Response) => {
  try {
    const realm = decodeURIComponent(req.params.realm);
    const name = decodeURIComponent(req.params.name);

    const profile = await characterService.getCharacterProfileByRealmName(realm, name);
    if (!profile) {
      return res.status(404).json({ error: "Character not found" });
    }

    res.json(profile);
  } catch (error) {
    logger.error("Error fetching character profile:", error);
    res.status(500).json({ error: "Failed to fetch character profile" });
  }
});

export default router;
