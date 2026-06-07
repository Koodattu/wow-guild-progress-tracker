import { Router, Request, Response } from "express";
import Guild from "../models/Guild";
import characterService from "../services/character.service";
import logger from "../utils/logger";

const router = Router();

type SearchResultType = "guild" | "character";

type SearchResult = {
  name: string;
  realm: string;
  type: SearchResultType;
  href: string;
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.get("/", async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const requestedLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : 5;
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 5, 1), 5);

    if (query.length < 2) {
      return res.json({ results: [] });
    }

    const namePrefix = new RegExp(`^${escapeRegex(query)}`, "i");
    const perTypeLimit = limit;

    const [guilds, characters] = await Promise.all([
      Guild.find({ name: namePrefix }).sort({ name: 1, realm: 1 }).limit(perTypeLimit).select("name realm -_id").lean(),
      characterService.searchCharacters(query, perTypeLimit),
    ]);

    const results: SearchResult[] = [
      ...guilds.map((guild) => ({
        name: guild.name,
        realm: guild.realm,
        type: "guild" as const,
        href: `/guilds/${encodeURIComponent(guild.realm)}/${encodeURIComponent(guild.name)}`,
      })),
      ...characters.map((character) => ({
        name: character.matchedName ?? character.name,
        realm: character.matchedRealm ?? character.realm,
        type: "character" as const,
        href: `/characters/${encodeURIComponent(character.realm)}/${encodeURIComponent(character.name)}?class=${encodeURIComponent(String(character.classID))}`,
      })),
    ]
      .sort((a, b) => a.name.localeCompare(b.name) || a.realm.localeCompare(b.realm) || a.type.localeCompare(b.type))
      .slice(0, limit);

    res.json({ results });
  } catch (error) {
    logger.error("Error searching site:", error);
    res.status(500).json({ error: "Failed to search" });
  }
});

export default router;
