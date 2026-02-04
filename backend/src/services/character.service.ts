import { CURRENT_RAID_IDS } from "../config/guilds";
import Character from "../models/Character";
import Ranking from "../models/Ranking";
import logger from "../utils/logger";
import { resolveRole } from "../utils/spec";
import wclService from "./warcraftlogs.service";

interface IWarcraftLogsAllStars {
  partition: number;
  spec: string;
  points: number;
  possiblePoints: number;
  rank: number;
  regionRank: number;
  serverRank: number;
  rankPercent: number;
  total: number;
  rankTooltip: string | null;
}

interface IWarcraftLogsRanking {
  encounter: {
    id: number;
    name: string;
  };
  rankPercent: number | null;
  medianPercent: number | null;
  lockedIn: boolean;
  totalKills: number;
  fastestKill: number;
  allStars: IWarcraftLogsAllStars | null;
  spec: string | null;
  bestSpec: string;
  bestAmount: number;
  rankTooltip: string | null;
  bestRank: {
    rank_id: number;
    class: number;
    spec: number;
    per_second_amount: number;
    ilvl: number;
    fight_metadata: number;
  };
}

interface IWarcraftLogsZoneRankings {
  bestPerformanceAverage: number;
  medianPerformanceAverage: number;
  difficulty: number;
  metric: string;
  partition: number;
  zone: number;
  size: number;
  allStars?: IWarcraftLogsAllStars[];
  rankings: IWarcraftLogsRanking[];
}

interface IWarcraftLogsCharacter {
  id: number;
  canonicalID: number;
  name: string;
  classID: number;
  level: number;
  hidden: boolean;
  server: {
    id: number;
    name: string;
    region: {
      name: string;
    };
  };
  zoneRankings: IWarcraftLogsZoneRankings | null;
}

interface IWarcraftLogsResponse {
  characterData: {
    character: IWarcraftLogsCharacter | null;
  };
}

export type CharacterRankingRow = {
  character: {
    wclCanonicalCharacterId: number;
    name: string;
    realm: string;
    region: string;
    classID: number;
  };
  context: {
    zoneId: number;
    encounterId: number | null;
    specName?: string;
    role?: "dps" | "healer" | "tank";
    metric: "dps" | "hps";
  };
  score: {
    type: "allStars" | "bestAmount";
    value: number;
  };
  stats: {
    allStars?: { points: number; possiblePoints: number };
    bestAmount?: number;
    rankPercent?: number;
    medianPercent?: number;
    totalKills?: number;
  };
  updatedAt?: string;
};

export type CharacterRankingsResponse = {
  data: CharacterRankingRow[];
  pagination: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  };
};

class CharacterService {
  // Check and update character rankings (nightly job)
  async checkAndRefreshCharacterRankings(): Promise<void> {
    logger.info("Starting character ranking check and update...");

    const CURRENT_TIER_ID = CURRENT_RAID_IDS[0];
    const BATCH_SIZE = 200;

    try {
      // Find eligible characters
      const eligibleChars = await Character.find({
        // Eligible if lastMythicSeenAt within 14 days, rankingsAvailable not "false" and cooldown passed
        lastMythicSeenAt: {
          $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        },
        rankingsAvailable: { $ne: "false" },
        nextEligibleRefreshAt: { $lte: new Date() },
      }).limit(BATCH_SIZE);

      logger.info(
        `Found ${eligibleChars.length} characters eligible for ranking check`,
      );

      for (const char of eligibleChars) {
        try {
          // Fetch DPS metric for all characters for now
          const query = `
            query($serverSlug: String!, $serverRegion: String!, $characterName: String!, $zoneID: Int!) {
              characterData {
                character(serverSlug: $serverSlug, serverRegion: $serverRegion, name: $characterName) {
                  zoneRankings(
                    zoneID: $zoneID,
                    difficulty: 5,
                    metric: dps,
                    compare: Rankings,
                    timeframe: Historical
                  )
                }
              }
            }
          `;

          const variables = {
            serverSlug: char.realm.toLowerCase().replace(/\s+/g, "-"),
            serverRegion: char.region.toLowerCase(),
            characterName: char.name,
            zoneID: CURRENT_TIER_ID,
          };

          const result = await wclService.query<IWarcraftLogsResponse>(
            query,
            variables,
          );

          const character = result.characterData?.character;
          if (
            !character ||
            character.hidden ||
            !character.zoneRankings ||
            (character.zoneRankings as any).error
          ) {
            await Character.findByIdAndUpdate(char._id, {
              wclProfileHidden: character?.hidden || false,
              rankingsAvailable: "false",
              nextEligibleRefreshAt: new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000,
              ),
            });
            await Ranking.deleteMany({ characterId: char._id });
            logger.info(
              `No rankings available for ${char.name} (${char.realm})`,
            );
            await new Promise((resolve) => setTimeout(resolve, 100));
            continue;
          }

          //  Check if averages changed
          const zoneRankings = character.zoneRankings!;
          const hasChanged =
            !char.latestBestPerformanceAverage ||
            Math.abs(
              char.latestBestPerformanceAverage -
                zoneRankings.bestPerformanceAverage,
            ) > 0.001 ||
            Math.abs(
              (char.latestMedianPerformanceAverage ?? 0) -
                zoneRankings.medianPerformanceAverage,
            ) > 0.001;

          if (!hasChanged) {
            await Character.findByIdAndUpdate(char._id, {
              nextEligibleRefreshAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
            });
            logger.info(`No changes for ${char.name} (${char.realm})`);
            await new Promise((resolve) => setTimeout(resolve, 100));
            continue;
          }

          // Update character
          await Character.findByIdAndUpdate(char._id, {
            latestZoneId: CURRENT_TIER_ID,
            latestBestPerformanceAverage: zoneRankings.bestPerformanceAverage,
            latestMedianPerformanceAverage:
              zoneRankings.medianPerformanceAverage,
            latestAllStars:
              zoneRankings.allStars && zoneRankings.allStars.length > 0
                ? {
                    points: zoneRankings.allStars[0].points,
                    possiblePoints: zoneRankings.allStars[0].possiblePoints,
                  }
                : { points: 0, possiblePoints: 0 },
            rankingsAvailable: "true",
            nextEligibleRefreshAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          });

          // Upsert rankings
          for (const r of zoneRankings.rankings) {
            const specName = r.spec?.trim().toLowerCase();
            if (!specName) continue;

            // Get the correct role for this spec
            const role = resolveRole(char.classID, specName);

            await Ranking.findOneAndUpdate(
              {
                characterId: char._id,
                zoneId: CURRENT_TIER_ID,
                difficulty: 5,
                metric: "dps",
                "encounter.id": r.encounter.id,
                specName,
              },
              {
                characterId: char._id,
                wclCanonicalCharacterId: character.canonicalID,

                name: char.name,
                realm: char.realm,
                region: char.region,
                classID: char.classID,

                zoneId: CURRENT_TIER_ID,
                difficulty: 5,
                metric: "dps",

                encounter: {
                  id: r.encounter.id,
                  name: r.encounter.name,
                },

                specName,
                role,

                bestSpecName: r.bestSpec?.trim().toLowerCase(),

                rankPercent: r.rankPercent ?? 0,
                medianPercent: r.medianPercent ?? 0,
                lockedIn: r.lockedIn,
                totalKills: r.totalKills,
                bestAmount: r.bestAmount ?? 0,

                allStars: r.allStars
                  ? {
                      points:
                        typeof r.allStars.points === "number"
                          ? r.allStars.points
                          : 0,
                      possiblePoints:
                        typeof r.allStars.possiblePoints === "number"
                          ? r.allStars.possiblePoints
                          : 0,
                    }
                  : { points: 0, possiblePoints: 0 },
              },
              { upsert: true, new: true },
            );
          }

          logger.info(`Updated rankings for ${char.name} (${char.realm})`);
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          logger.error(`Error checking rankings for ${char.name}:`, error);
        }
      }

      logger.info("Character ranking check and update completed");
    } catch (error) {
      logger.error("Error in character ranking check:", error);
    }
  }

  async getCharacterRankings(options: {
    zoneId: number;
    encounterId?: number;
    classId?: number;
    specName?: string;
    role?: "dps" | "healer" | "tank";
    metric?: "dps" | "hps";
    limit?: number;
    page?: number;
  }): Promise<CharacterRankingsResponse> {
    const {
      zoneId,
      encounterId,
      classId,
      specName,
      role,
      metric = "dps",
      limit = 100,
      page = 1,
    } = options;

    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const skip = (Math.max(page, 1) - 1) * safeLimit;

    // Encounter selected -> bestAmount
    if (encounterId !== undefined) {
      const query: any = {
        zoneId,
        metric,
        "encounter.id": encounterId,
        difficulty: 5,
      };
      if (classId !== undefined) query.classID = classId;
      if (specName !== undefined) query.specName = specName;
      if (role !== undefined) query.role = role;

      const totalItems = await Ranking.countDocuments(query);
      const rows = await Ranking.find(query)
        .select(
          "wclCanonicalCharacterId name realm region classID zoneId metric encounter specName role " +
            "rankPercent medianPercent totalKills bestAmount allStars lockedIn updatedAt",
        )
        .sort({ bestAmount: -1, rankPercent: -1, totalKills: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean();

      const data = rows.map((r: any) => ({
        character: {
          wclCanonicalCharacterId: r.wclCanonicalCharacterId,
          name: r.name,
          realm: r.realm,
          region: r.region,
          classID: r.classID,
        },
        context: {
          zoneId,
          encounterId: encounterId ?? null,
          specName: r.specName,
          role,
          metric,
        },
        score: { type: "bestAmount" as const, value: r.bestAmount ?? 0 },
        stats: {
          bestAmount: r.bestAmount ?? 0,
          rankPercent: r.rankPercent,
          medianPercent: r.medianPercent,
          totalKills: r.totalKills,
          allStars: r.allStars,
        },
        updatedAt: r.updatedAt
          ? new Date(r.updatedAt).toISOString()
          : undefined,
      }));

      return {
        data,
        pagination: {
          totalItems,
          totalPages: Math.ceil(totalItems / safeLimit),
          currentPage: Math.max(page, 1),
          pageSize: safeLimit,
        },
      };
    }

    // No encounter -> allStar points

    const needsRankingAggregate =
      specName !== undefined || role !== undefined || metric !== "dps";

    if (!needsRankingAggregate) {
      const query: any = {
        latestZoneId: zoneId,
        rankingsAvailable: "true",
        wclProfileHidden: false,
        latestAllStars: { $exists: true },
      };
      if (classId !== undefined) query.classID = classId;

      const totalItems = await Character.countDocuments(query);
      const rows = await Character.find(query)
        .select(
          "wclCanonicalCharacterId name realm region classID latestAllStars updatedAt",
        )
        .sort({ "latestAllStars.points": -1, name: 1 })
        .skip(skip)
        .limit(safeLimit)
        .lean();

      const data = rows.map((c: any) => ({
        character: {
          wclCanonicalCharacterId: c.wclCanonicalCharacterId,
          name: c.name,
          realm: c.realm,
          region: c.region,
          classID: c.classID,
        },
        context: {
          zoneId,
          encounterId: null,
          specName,
          role,
          metric,
        },
        score: {
          type: "allStars" as const,
          value: c.latestAllStars?.points ?? 0,
        },
        stats: { allStars: c.latestAllStars },
        updatedAt: c.updatedAt
          ? new Date(c.updatedAt).toISOString()
          : undefined,
      }));

      return {
        data,
        pagination: {
          totalItems,
          totalPages: Math.ceil(totalItems / safeLimit),
          currentPage: Math.max(page, 1),
          pageSize: safeLimit,
        },
      };
    }

    // Filtered all-boss view (spec/role/metric) => aggregate rankings to compute allStars per character
    const match: any = { zoneId, metric, difficulty: 5 };
    if (classId !== undefined) match.classID = classId;
    if (specName !== undefined) match.specName = specName;
    if (role !== undefined) match.role = role;

    // First, get total count without pagination
    const countAgg = await Ranking.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$characterId",
        },
      },
      { $count: "total" },
    ]);

    const totalItems = countAgg.length > 0 ? countAgg[0].total : 0;

    const agg = await Ranking.aggregate([
      { $match: match },

      // group per character across bosses
      {
        $group: {
          _id: "$characterId",
          wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
          name: { $first: "$name" },
          realm: { $first: "$realm" },
          region: { $first: "$region" },
          classID: { $first: "$classID" },
          points: { $sum: "$allStars.points" },
          possiblePoints: { $sum: "$allStars.possiblePoints" },
          updatedAt: { $max: "$updatedAt" },
        },
      },

      { $sort: { points: -1, possiblePoints: -1, name: 1 } },
      { $skip: skip },
      { $limit: safeLimit },
    ]);

    const data = agg.map((r: any) => ({
      character: {
        wclCanonicalCharacterId: r.wclCanonicalCharacterId,
        name: r.name,
        realm: r.realm,
        region: r.region,
        classID: r.classID,
      },
      context: {
        zoneId,
        encounterId: null,
        specName,
        role,
        metric,
      },
      score: { type: "allStars" as const, value: r.points ?? 0 },
      stats: {
        allStars: {
          points: r.points ?? 0,
          possiblePoints: r.possiblePoints ?? 0,
        },
      },
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
    }));

    return {
      data,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / safeLimit),
        currentPage: Math.max(page, 1),
        pageSize: safeLimit,
      },
    };
  }
}

export default new CharacterService();
