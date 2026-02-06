import { Router, Request, Response } from "express";
import characterService from "../services/character.service";
import { CURRENT_RAID_IDS } from "../config/guilds";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const zoneId = CURRENT_RAID_IDS[0];
    if (!Number.isFinite(zoneId)) {
      return res.status(400).json({ error: "Invalid zone ID" });
    }

    const encounterId =
      req.query.encounterId !== undefined
        ? Number(req.query.encounterId)
        : undefined;
    const classId =
      req.query.classId !== undefined ? Number(req.query.classId) : undefined;
    const page =
      req.query.page !== undefined ? Number(req.query.page) : undefined;
    const limit =
      req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const partition =
      req.query.partition !== undefined
        ? Number(req.query.partition)
        : undefined;

    const specName =
      req.query.specName !== undefined ? String(req.query.specName) : undefined;

    const role =
      req.query.role !== undefined
        ? (String(req.query.role) as "dps" | "healer" | "tank")
        : undefined;

    const metric =
      req.query.metric !== undefined
        ? (String(req.query.metric) as "dps" | "hps")
        : undefined;

    if (encounterId !== undefined && Number.isNaN(encounterId)) {
      return res.status(400).json({ error: "Invalid encounterId" });
    }
    if (classId !== undefined && Number.isNaN(classId)) {
      return res.status(400).json({ error: "Invalid classId" });
    }
    if (page !== undefined && (Number.isNaN(page) || page < 1)) {
      return res.status(400).json({ error: "Invalid page" });
    }
    if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
      return res.status(400).json({ error: "Invalid limit" });
    }
    if (partition !== undefined && (Number.isNaN(partition) || partition < 1)) {
      return res.status(400).json({ error: "Invalid partition" });
    }

    const rankings = await characterService.getCharacterRankings({
      zoneId,
      encounterId,
      classId,
      specName,
      role,
      metric,
      partition,
      page,
      limit,
    });

    res.json(rankings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch character rankings" });
  }
});

export default router;
