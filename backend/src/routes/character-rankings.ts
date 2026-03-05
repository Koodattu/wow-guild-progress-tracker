import { Router, Request, Response } from "express";
import characterService from "../services/character.service";
import { CURRENT_RAID_IDS, TRACKED_RAIDS } from "../config/guilds";
import CharacterLeaderboard from "../models/CharacterLeaderboard";
import Raid from "../models/Raid";
import { cacheMiddleware } from "../middleware/cache.middleware";
import cacheService from "../services/cache.service";

const router = Router();

const ALLOWED_ROLES = new Set(["dps", "healer", "tank"] as const);
const MYTHIC_DIFFICULTY = 5;

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

router.get(
  "/options",
  cacheMiddleware(
    (_req) => cacheService.getCharacterRankingsOptionsKey(),
    (_req) => cacheService.STATIC_TTL,
  ),
  async (_req: Request, res: Response) => {
  try {
    const zoneIdsWithRankings = await CharacterLeaderboard.distinct("zoneId", {
      difficulty: MYTHIC_DIFFICULTY,
      zoneId: { $in: TRACKED_RAIDS },
    });

    const sortedZoneIds = zoneIdsWithRankings.filter((id): id is number => typeof id === "number").sort((a, b) => b - a);

    const partitionRows = await CharacterLeaderboard.aggregate<{
      _id: { zoneId: number; partition: number };
    }>([
      {
        $match: {
          difficulty: MYTHIC_DIFFICULTY,
          zoneId: { $in: sortedZoneIds },
          partition: { $ne: null },
        },
      },
      {
        $group: {
          _id: {
            zoneId: "$zoneId",
            partition: "$partition",
          },
        },
      },
    ]);

    const partitionIdsByZone = new Map<number, Set<number>>();
    for (const row of partitionRows) {
      const zoneId = row._id.zoneId;
      const partitionId = row._id.partition;
      if (!partitionIdsByZone.has(zoneId)) {
        partitionIdsByZone.set(zoneId, new Set<number>());
      }
      partitionIdsByZone.get(zoneId)!.add(partitionId);
    }

    const raids = await Raid.find({ id: { $in: sortedZoneIds } }).select("id name expansion iconUrl partitions -_id").lean();

    const raidById = new Map(raids.map((raid) => [raid.id, raid]));
    const orderedRaids = sortedZoneIds
      .map((zoneId) => raidById.get(zoneId))
      .filter((raid) => Boolean(raid)) as typeof raids;

    const raidOptions = orderedRaids.map((raid) => {
      const availablePartitionIds = partitionIdsByZone.get(raid.id) || new Set<number>();
      const configuredPartitions = (raid.partitions || []).filter((partition: any) => availablePartitionIds.has(partition.id)).sort((a: any, b: any) => a.id - b.id);

      const missingNamedPartitions = [...availablePartitionIds]
        .filter((partitionId) => !configuredPartitions.some((partition: any) => partition.id === partitionId))
        .sort((a, b) => a - b)
        .map((partitionId) => ({ id: partitionId, name: `Patch ${partitionId}` }));

      return {
        id: raid.id,
        name: raid.name,
        expansion: raid.expansion,
        iconUrl: raid.iconUrl,
        partitions: [...configuredPartitions, ...missingNamedPartitions],
      };
    });

    const defaultZoneId = raidOptions.some((raid) => raid.id === CURRENT_RAID_IDS[0]) ? CURRENT_RAID_IDS[0] : (raidOptions[0]?.id ?? CURRENT_RAID_IDS[0]);

    res.json({
      raids: raidOptions,
      defaultSelection: {
        zoneId: defaultZoneId,
        partition: null,
      },
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to fetch character ranking options: ${error instanceof Error ? error.message : "Unknown error"}` });
  }
  },
);

router.get("/", async (req: Request, res: Response) => {
  try {
    const zoneIdFromQuery = parseNumberQuery(req.query.zoneId);
    if (req.query.zoneId !== undefined && zoneIdFromQuery === undefined) {
      return res.status(400).json({ error: "Invalid zoneId" });
    }

    const zoneId = zoneIdFromQuery ?? CURRENT_RAID_IDS[0];
    if (!Number.isFinite(zoneId)) {
      return res.status(400).json({ error: "Invalid zone ID" });
    }

    const encounterId = parseNumberQuery(req.query.encounterId);
    const classId = parseNumberQuery(req.query.classId);
    const page = parseNumberQuery(req.query.page);
    const limit = parseNumberQuery(req.query.limit);
    const partition = parseNumberQuery(req.query.partition);
    const characterName = parseStringQuery(req.query.characterName);
    const guildName = parseStringQuery(req.query.guildName);

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
    if (partition !== undefined && (!Number.isFinite(partition) || partition < 1)) {
      return res.status(400).json({ error: "Invalid partition" });
    }
    if (role !== undefined && !ALLOWED_ROLES.has(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    if (characterName !== undefined && characterName.length > 64) {
      return res.status(400).json({ error: "Invalid characterName" });
    }
    if (guildName !== undefined && guildName.length > 64) {
      return res.status(400).json({ error: "Invalid guildName" });
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
      guildName,
    });

    res.json(rankings);
  } catch (error) {
    res.status(500).json({ error: `Failed to fetch character rankings: ${error instanceof Error ? error.message : "Unknown error"}` });
  }
});

export default router;
