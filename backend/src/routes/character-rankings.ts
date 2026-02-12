import { Router, Request, Response } from "express";
import characterService from "../services/character.service";
import { CURRENT_RAID_IDS } from "../config/guilds";

const router = Router();

const ALLOWED_ROLES = new Set(["dps", "healer", "tank"] as const);

const parseNumberQuery = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseStringQuery = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  const parsed = String(value).trim();
  return parsed.length > 0 ? parsed : undefined;
};

router.get("/", async (req: Request, res: Response) => {
  try {
    const zoneId = CURRENT_RAID_IDS[0];
    if (!Number.isFinite(zoneId)) {
      return res.status(400).json({ error: "Invalid zone ID" });
    }

    const encounterId = parseNumberQuery(req.query.encounterId);
    const classId = parseNumberQuery(req.query.classId);
    const page = parseNumberQuery(req.query.page);
    const limit = parseNumberQuery(req.query.limit);
    const partition = parseNumberQuery(req.query.partition);
    const characterName = parseStringQuery(req.query.characterName);

    const specNameRaw = parseStringQuery(req.query.specName);
    const specName = specNameRaw?.toLowerCase();

    const roleRaw = parseStringQuery(req.query.role)?.toLowerCase();
    const role = roleRaw as "dps" | "healer" | "tank" | undefined;

    if (encounterId !== undefined && !Number.isFinite(encounterId)) {
      return res.status(400).json({ error: "Invalid encounterId" });
    }
    if (classId !== undefined && !Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid classId" });
    }
    if (page !== undefined && (!Number.isFinite(page) || page < 1)) {
      return res.status(400).json({ error: "Invalid page" });
    }
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
      return res.status(400).json({ error: "Invalid limit" });
    }
    if (
      partition !== undefined &&
      (!Number.isFinite(partition) || partition < 1)
    ) {
      return res.status(400).json({ error: "Invalid partition" });
    }
    if (role !== undefined && !ALLOWED_ROLES.has(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    if (characterName !== undefined && characterName.length > 64) {
      return res.status(400).json({ error: "Invalid characterName" });
    }

    const rankings = await characterService.getCharacterRankings({
      zoneId,
      encounterId,
      classId,
      specName,
      role,
      partition,
      page,
      limit,
      characterName,
    });

    res.json(rankings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch character rankings" });
  }
});

export default router;
