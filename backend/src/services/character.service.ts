import { CURRENT_RAID_IDS } from "../config/guilds";
import { ROLE_BY_CLASS_AND_SPEC } from "../config/specs";
import Character from "../models/Character";
import Ranking from "../models/Ranking";
import Raid from "../models/Raid";
import logger from "../utils/logger";
import { resolveRole, slugifySpecName } from "../utils/spec";
import rateLimitService from "./rate-limit.service";
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
    guild?: {
      name: string;
      realm: string;
    } | null;
  };
  context: {
    zoneId: number;
    difficulty: number;
    partition?: number;
    encounterId: number | null;
    specName?: string;
    bestSpecName?: string;
    role?: "dps" | "healer" | "tank";
    ilvl?: number;
  };
  encounter?: {
    id: number;
    name: string;
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
    lockedIn?: boolean;
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
    const MYTHIC_DIFFICULTY = 5;
    const BATCH_SIZE = 200;
    const MAX_WCL_REQUESTS_PER_RUN = 20000;
    // Pause when 90% of WCL hourly budget is consumed, leaving 10% for live/other operations
    const RATE_LIMIT_PAUSE_PERCENT = 90;

    try {
      const raid = await Raid.findOne({ id: CURRENT_TIER_ID }).select("partitions").lean();
      const partition = (raid?.partitions || []).reduce((max: number, entry: any) => (typeof entry?.id === "number" && entry.id > max ? entry.id : max), -1);
      logger.info(`[CharacterRankings] Using partition ${partition} for zone ${CURRENT_TIER_ID}`);

      // Find eligible characters
      const cutoffDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const eligibleFilter: any = {
        // Eligible if lastMythicSeenAt within 14 days, rankingsAvailable not false and cooldown passed
        lastMythicSeenAt: { $gte: cutoffDate },
        rankingsAvailable: { $ne: false },
        nextEligibleRefreshAt: { $lte: new Date() },
      };

      // Count total eligible characters for progress tracking
      const totalEligibleCount = await Character.countDocuments(eligibleFilter);
      logger.info(`[CharacterRankings] Found ${totalEligibleCount} eligible characters to process`);

      let processedCount = 0;
      let batchIndex = 0;
      const processedCharacterIds = new Set<string>();
      let charactersProcessedThisRun = 0;

      while (processedCount < MAX_WCL_REQUESTS_PER_RUN) {
        const remaining = MAX_WCL_REQUESTS_PER_RUN - processedCount;
        const batchSize = Math.min(BATCH_SIZE, remaining);
        const eligibleChars = await Character.aggregate([
          { $match: eligibleFilter },
          {
            $sort: {
              lastMythicSeenAt: -1,
              updatedAt: 1,
            },
          },
          { $limit: batchSize },
        ]);

        if (eligibleChars.length === 0) {
          logger.info(`[CharacterRankings] No more characters found in batch, stopping`);
          break;
        }

        batchIndex += 1;
        logger.info(
          `[CharacterRankings] Processing batch ${batchIndex}: ${eligibleChars.length} characters fetched (processed ${processedCount}/${MAX_WCL_REQUESTS_PER_RUN} requests, ${charactersProcessedThisRun}/${totalEligibleCount} characters)`,
        );

        let newCharactersInBatch = 0;
        for (const char of eligibleChars) {
          // Skip if we've already processed this character in this run
          const charId = String(char._id);
          if (processedCharacterIds.has(charId)) {
            logger.debug(`[CharacterRankings] Skipping already processed character ${char.name} (${char.realm})`);
            continue;
          }

          if (processedCount >= MAX_WCL_REQUESTS_PER_RUN) {
            logger.info(`[CharacterRankings] Reached request limit (${MAX_WCL_REQUESTS_PER_RUN}), stopping`);
            break;
          }

          processedCharacterIds.add(charId);
          charactersProcessedThisRun += 1;
          newCharactersInBatch += 1;
          logger.info(`[CharacterRankings] Processing character ${charactersProcessedThisRun}/${totalEligibleCount}: ${char.name} (${char.realm})`);

          const classSpecMap = ROLE_BY_CLASS_AND_SPEC[char.classID] ?? {};
          const specSlugs = Object.keys(classSpecMap);
          if (specSlugs.length === 0) {
            logger.warn(`[CharacterRankings] No spec mappings found for classID ${char.classID} (${char.name}, ${char.realm})`);
            await Character.findByIdAndUpdate(char._id, {
              nextEligibleRefreshAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
            });
            continue;
          }

          let hasAnySpecRankings = false;
          let characterUnavailable = false;

          for (const specSlug of specSlugs) {
            // WCL expects specName with first letter uppercase and hyphens removed (e.g. "BeastMastery" not "beast-mastery")
            const wclSpecSlug = specSlug
              .split("-")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join("");
            if (processedCount >= MAX_WCL_REQUESTS_PER_RUN) {
              break;
            }

            // Check rate limit before each WCL API call — wait for reset if near threshold
            if (rateLimitService.getPercentUsed() >= RATE_LIMIT_PAUSE_PERCENT) {
              const resetMs = rateLimitService.getTimeUntilReset();
              logger.info(
                `[CharacterRankings] Rate limit at ${rateLimitService.getPercentUsed().toFixed(1)}%, pausing for ${Math.ceil(resetMs / 1000)}s until reset (processed ${processedCount} so far)`,
              );
              await rateLimitService.waitForReset();
              logger.info(`[CharacterRankings] Rate limit reset, resuming`);
            }

            try {
              const query = `
              query($serverSlug: String!, $serverRegion: String!, $characterName: String!, $zoneID: Int!, $specName: String!) {
                rateLimitData {
                  limitPerHour
                  pointsSpentThisHour
                  pointsResetIn
                }
                characterData {
                  character(
                    name: $characterName,
                    serverSlug: $serverSlug,
                    serverRegion: $serverRegion
                  ) {
                    id
                    canonicalID
                    name
                    classID
                    hidden
                    zoneRankings(
                      zoneID: $zoneID,
                      difficulty: ${MYTHIC_DIFFICULTY},
                      metric: dps,
                      compare: Rankings,
                      timeframe: Historical,
                      partition: ${partition},
                      specName: $specName
                    )
                  }
                }
              }
            `;

              const variables = {
                characterName: char.name,
                serverSlug: char.realm.toLowerCase().replace(/\s+/g, "-"),
                serverRegion: char.region.toLowerCase(),
                zoneID: CURRENT_TIER_ID,
                specName: wclSpecSlug,
              };

              processedCount += 1;

              const result = await wclService.query<IWarcraftLogsResponse>(query, variables);

              const character = result.characterData?.character;
              if (!character || character.hidden) {
                await Character.findByIdAndUpdate(char._id, {
                  wclProfileHidden: character?.hidden || false,
                  rankingsAvailable: false,
                  nextEligibleRefreshAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                });
                await Ranking.deleteMany({ characterId: char._id });
                logger.info(`[CharacterRankings]No rankings available for ${char.name} (${char.realm})`);
                await new Promise((resolve) => setTimeout(resolve, 100));
                characterUnavailable = true;
                break;
              }

              const zoneRankings = character.zoneRankings;
              if (!zoneRankings || (zoneRankings as any).error) {
                await Ranking.deleteMany({
                  characterId: char._id,
                  zoneId: CURRENT_TIER_ID,
                  difficulty: MYTHIC_DIFFICULTY,
                  partition,
                  specName: specSlug,
                });
                logger.info(`[CharacterRankings] No rankings available for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
              }

              const allStarsEntries = zoneRankings.allStars ?? [];
              const hasAllStarsSpecField = allStarsEntries.some((a) => a.spec);
              const filteredAllStars = hasAllStarsSpecField ? allStarsEntries.filter((a) => slugifySpecName(a.spec) === specSlug) : allStarsEntries;

              const hasRankingSpecField = zoneRankings.rankings.some((r) => r.spec);
              const filteredRankings = hasRankingSpecField
                ? zoneRankings.rankings.filter((r) => {
                    if (!r.spec) return false;
                    return slugifySpecName(r.spec) === specSlug;
                  })
                : zoneRankings.rankings;

              if (filteredAllStars.length === 0 && filteredRankings.length === 0) {
                await Ranking.deleteMany({
                  characterId: char._id,
                  zoneId: CURRENT_TIER_ID,
                  difficulty: MYTHIC_DIFFICULTY,
                  partition: zoneRankings.partition,
                  specName: specSlug,
                });
                logger.info(`[CharacterRankings] No rankings available for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
              }

              hasAnySpecRankings = true;

              // Check if rankings have changed by comparing with stored Ranking docs
              const existingRankings = await Ranking.find({
                characterId: char._id,
                zoneId: CURRENT_TIER_ID,
                difficulty: MYTHIC_DIFFICULTY,
                partition: zoneRankings.partition,
                specName: specSlug,
              }).lean();

              // Compute current totals from fresh WCL data
              const freshPoints = filteredAllStars.reduce((sum, a) => sum + (a.points ?? 0), 0);
              const freshPossiblePoints = filteredAllStars.reduce((sum, a) => sum + (a.possiblePoints ?? 0), 0);

              // Compute stored totals from existing Ranking docs
              const storedPoints = existingRankings.reduce((sum, r: any) => sum + (r.allStars?.points ?? 0), 0);
              const storedPossiblePoints = existingRankings.reduce((sum, r: any) => sum + (r.allStars?.possiblePoints ?? 0), 0);

              const hasChanged = existingRankings.length === 0 || freshPoints !== storedPoints || freshPossiblePoints !== storedPossiblePoints;

              if (!hasChanged) {
                logger.info(`[CharacterRankings] No changes for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
              }

              // Upsert rankings
              for (const r of filteredRankings) {
                const rankingSpecSlug = r.spec ? slugifySpecName(r.spec) : specSlug;
                if (hasRankingSpecField && rankingSpecSlug !== specSlug) {
                  continue;
                }

                const role = resolveRole(char.classID, rankingSpecSlug);
                const normalizedBestSpecName = r.bestSpec ? slugifySpecName(r.bestSpec) : rankingSpecSlug;
                const rankingPartition = r.allStars?.partition ?? zoneRankings.partition ?? partition;

                await Ranking.findOneAndUpdate(
                  {
                    characterId: char._id,
                    zoneId: CURRENT_TIER_ID,
                    difficulty: MYTHIC_DIFFICULTY,
                    partition: rankingPartition,
                    "encounter.id": r.encounter.id,
                    specName: specSlug,
                  },
                  {
                    characterId: char._id,
                    wclCanonicalCharacterId: character.canonicalID,

                    name: char.name,
                    realm: char.realm,
                    region: char.region,
                    classID: char.classID,

                    zoneId: CURRENT_TIER_ID,
                    difficulty: MYTHIC_DIFFICULTY,
                    partition: rankingPartition,

                    encounter: {
                      id: r.encounter.id,
                      name: r.encounter.name,
                    },

                    specName: rankingSpecSlug,
                    role,

                    bestSpecName: normalizedBestSpecName,

                    rankPercent: r.rankPercent ?? 0,
                    medianPercent: r.medianPercent ?? 0,
                    lockedIn: r.lockedIn,
                    totalKills: r.totalKills,
                    bestAmount: r.bestAmount ?? 0,

                    allStars: r.allStars
                      ? {
                          points: typeof r.allStars.points === "number" ? r.allStars.points : 0,
                          possiblePoints: typeof r.allStars.possiblePoints === "number" ? r.allStars.possiblePoints : 0,
                        }
                      : { points: 0, possiblePoints: 0 },

                    ilvl: r.bestRank?.ilvl,
                  },
                  { upsert: true, new: true },
                );
              }

              logger.info(`[CharacterRankings] Updated rankings for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
              await new Promise((resolve) => setTimeout(resolve, 100));
            } catch (error) {
              logger.error(`[CharacterRankings] Error checking rankings for ${char.name} (${char.realm}) [spec: ${specSlug}]:`, error);
            }
          }

          if (characterUnavailable) {
            continue;
          }

          if (hasAnySpecRankings) {
            await Character.findByIdAndUpdate(char._id, {
              rankingsAvailable: true,
              nextEligibleRefreshAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
            });
          } else {
            await Character.findByIdAndUpdate(char._id, {
              rankingsAvailable: false,
              nextEligibleRefreshAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            });
          }
        }

        // Break if we didn't process any new characters in this batch (all were duplicates)
        if (newCharactersInBatch === 0) {
          logger.info(`[CharacterRankings] All characters in batch were already processed, stopping`);
          break;
        }

        // Break if we've processed all eligible characters
        if (charactersProcessedThisRun >= totalEligibleCount) {
          logger.info(`[CharacterRankings] Processed all ${totalEligibleCount} eligible characters, stopping`);
          break;
        }
      }

      logger.info(`[CharacterRankings] Character ranking check completed: processed ${processedCount} API requests for ${charactersProcessedThisRun} characters`);

      logger.info("[CharacterRankings] Character ranking check and update completed");
    } catch (error) {
      logger.error("[CharacterRankings] Error in character ranking check:", error);
    }
  }

  async getCharacterRankings(options: {
    zoneId: number;
    encounterId?: number;
    classId?: number;
    specName?: string;
    role?: "dps" | "healer" | "tank";
    partition?: number; // If provided: filter by partition; if omitted: pick best per-boss across partitions
    limit?: number;
    page?: number;
    characterName?: string;
  }): Promise<CharacterRankingsResponse> {
    const { zoneId, encounterId, classId, specName, role, partition, limit = 100, page = 1, characterName } = options;

    const MYTHIC_DIFFICULTY = 5;
    const normalizedSpecName = specName?.trim().toLowerCase();
    const normalizedRole = role?.toLowerCase() as "dps" | "healer" | "tank" | undefined;
    const normalizedCharacterName = characterName?.trim();
    const escapeRegex = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = normalizedCharacterName ? new RegExp(escapeRegex(normalizedCharacterName), "i") : undefined;

    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const skip = (Math.max(page, 1) - 1) * safeLimit;

    const getGuildMapForRows = async (rows: Array<{ characterId?: any }>): Promise<Map<string, { name: string; realm: string } | null>> => {
      const ids = rows
        .map((row) => row.characterId)
        .filter(Boolean)
        .map((id) => String(id));
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) {
        return new Map();
      }

      const characters = await Character.find({ _id: { $in: uniqueIds } })
        .select("_id guildName guildRealm")
        .lean();

      const guildMap = new Map<string, { name: string; realm: string } | null>();
      for (const character of characters) {
        const guildName = character.guildName ?? null;
        const guildRealm = character.guildRealm ?? null;
        if (guildName && guildRealm) {
          guildMap.set(String(character._id), {
            name: guildName,
            realm: guildRealm,
          });
        } else {
          guildMap.set(String(character._id), null);
        }
      }

      return guildMap;
    };

    // Boss leaderboard (encounterId provided)
    if (encounterId !== undefined) {
      const query: any = {
        zoneId,
        "encounter.id": encounterId,
        difficulty: MYTHIC_DIFFICULTY,
      };
      if (partition !== undefined) query.partition = partition;
      if (classId !== undefined) query.classID = classId;
      if (normalizedSpecName !== undefined) query.specName = normalizedSpecName;
      if (normalizedRole !== undefined) query.role = normalizedRole;
      if (nameRegex) query.name = nameRegex;

      if (partition !== undefined) {
        const filteredQuery = { ...query, bestAmount: { $ne: 0 } };
        const totalItems = await Ranking.countDocuments(filteredQuery);
        const rows = await Ranking.find(filteredQuery)
          .select(
            "characterId wclCanonicalCharacterId name realm region classID zoneId difficulty encounter specName bestSpecName role " +
              "rankPercent medianPercent lockedIn totalKills bestAmount allStars ilvl partition updatedAt",
          )
          .sort({ bestAmount: -1, rankPercent: -1, totalKills: -1 })
          .skip(skip)
          .limit(safeLimit)
          .lean();

        const guildMap = await getGuildMapForRows(rows);

        const data = rows.map((r: any) => ({
          character: {
            wclCanonicalCharacterId: r.wclCanonicalCharacterId,
            name: r.name,
            realm: r.realm,
            region: r.region,
            classID: r.classID,
            guild: guildMap.get(String(r.characterId)) ?? null,
          },
          context: {
            zoneId,
            difficulty: r.difficulty,
            partition: r.partition,
            encounterId: encounterId ?? null,
            specName: r.specName,
            bestSpecName: r.bestSpecName,
            role: r.role,
            ilvl: r.ilvl,
          },
          encounter: {
            id: r.encounter.id,
            name: r.encounter.name,
          },
          score: { type: "bestAmount" as const, value: r.bestAmount ?? 0 },
          stats: {
            bestAmount: r.bestAmount ?? 0,
            rankPercent: r.rankPercent,
            medianPercent: r.medianPercent,
            lockedIn: r.lockedIn,
            totalKills: r.totalKills,
            allStars: r.allStars,
          },
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
        }));

        const filteredData = data;

        return {
          data: filteredData,
          pagination: {
            totalItems,
            totalPages: Math.ceil(totalItems / safeLimit),
            currentPage: Math.max(page, 1),
            pageSize: safeLimit,
          },
        };
      }

      // Partition ignored: return only the best row per character across partitions
      const countAgg = await Ranking.aggregate([
        { $match: query },
        {
          $sort: {
            bestAmount: -1,
            rankPercent: -1,
            totalKills: -1,
            partition: -1,
          },
        },
        {
          $group: {
            _id: "$wclCanonicalCharacterId",
            bestAmount: { $first: "$bestAmount" },
          },
        },
        { $match: { bestAmount: { $ne: 0 } } },
        { $count: "total" },
      ]);

      const totalItems = countAgg.length > 0 ? countAgg[0].total : 0;

      const agg = await Ranking.aggregate([
        { $match: query },
        {
          $sort: {
            bestAmount: -1,
            rankPercent: -1,
            totalKills: -1,
            partition: -1,
          },
        },
        {
          $group: {
            _id: "$wclCanonicalCharacterId",
            characterId: { $first: "$characterId" },
            wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
            name: { $first: "$name" },
            realm: { $first: "$realm" },
            region: { $first: "$region" },
            classID: { $first: "$classID" },
            zoneId: { $first: "$zoneId" },
            difficulty: { $first: "$difficulty" },
            encounter: { $first: "$encounter" },
            specName: { $first: "$specName" },
            bestSpecName: { $first: "$bestSpecName" },
            role: { $first: "$role" },
            rankPercent: { $first: "$rankPercent" },
            medianPercent: { $first: "$medianPercent" },
            lockedIn: { $first: "$lockedIn" },
            totalKills: { $first: "$totalKills" },
            bestAmount: { $first: "$bestAmount" },
            allStars: { $first: "$allStars" },
            ilvl: { $first: "$ilvl" },
            partition: { $first: "$partition" },
            updatedAt: { $first: "$updatedAt" },
          },
        },
        { $match: { bestAmount: { $ne: 0 } } },
        { $sort: { bestAmount: -1, rankPercent: -1, totalKills: -1, name: 1 } },
        { $skip: skip },
        { $limit: safeLimit },
      ]);

      const guildMap = await getGuildMapForRows(agg);

      const data = agg.map((r: any) => ({
        character: {
          wclCanonicalCharacterId: r.wclCanonicalCharacterId,
          name: r.name,
          realm: r.realm,
          region: r.region,
          classID: r.classID,
          guild: guildMap.get(String(r.characterId)) ?? null,
        },
        context: {
          zoneId: r.zoneId,
          difficulty: r.difficulty,
          partition: r.partition,
          encounterId: encounterId ?? null,
          specName: r.specName,
          bestSpecName: r.bestSpecName,
          role: r.role,
          ilvl: r.ilvl,
        },
        encounter: {
          id: r.encounter.id,
          name: r.encounter.name,
        },
        score: { type: "bestAmount" as const, value: r.bestAmount ?? 0 },
        stats: {
          bestAmount: r.bestAmount ?? 0,
          rankPercent: r.rankPercent,
          medianPercent: r.medianPercent,
          lockedIn: r.lockedIn,
          totalKills: r.totalKills,
          allStars: r.allStars,
        },
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
      }));

      const filteredData = data;

      return {
        data: filteredData,
        pagination: {
          totalItems,
          totalPages: Math.ceil(totalItems / safeLimit),
          currentPage: Math.max(page, 1),
          pageSize: safeLimit,
        },
      };
    }

    // All-boss allStars leaderboard
    const matchBase: any = {
      zoneId,
      difficulty: MYTHIC_DIFFICULTY,
    };
    if (classId !== undefined) matchBase.classID = classId;
    if (normalizedSpecName !== undefined) matchBase.specName = normalizedSpecName;
    if (normalizedRole !== undefined) matchBase.role = normalizedRole;
    if (nameRegex) matchBase.name = nameRegex;

    // Partition-filtered view: only consider rows with partition = X
    if (partition !== undefined) {
      matchBase.partition = partition;

      // Count total unique characters
      const countAgg = await Ranking.aggregate([
        { $match: matchBase },
        { $sort: { "allStars.points": -1 } },
        {
          $group: {
            _id: { characterId: "$characterId", encounterId: "$encounter.id" },
            points: { $first: "$allStars.points" },
          },
        },
        {
          $group: {
            _id: "$_id.characterId",
            points: { $sum: "$points" },
          },
        },
        { $match: { points: { $gt: 0 } } },
        { $count: "total" },
      ]);

      const totalItems = countAgg.length > 0 ? countAgg[0].total : 0;

      // Group by character and sum allStars across bosses, picking best per encounter
      const agg = await Ranking.aggregate([
        { $match: matchBase },
        { $sort: { "allStars.points": -1 } },
        {
          $group: {
            _id: { characterId: "$characterId", encounterId: "$encounter.id" },
            characterId: { $first: "$characterId" },
            wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
            name: { $first: "$name" },
            realm: { $first: "$realm" },
            region: { $first: "$region" },
            classID: { $first: "$classID" },
            points: { $first: "$allStars.points" },
            possiblePoints: { $first: "$allStars.possiblePoints" },
            ilvl: { $first: "$ilvl" },
            rankPercent: { $first: "$rankPercent" },
            medianPercent: { $first: "$medianPercent" },
            updatedAt: { $first: "$updatedAt" },
          },
        },
        {
          $group: {
            _id: "$_id.characterId",
            characterId: { $first: "$characterId" },
            wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
            name: { $first: "$name" },
            realm: { $first: "$realm" },
            region: { $first: "$region" },
            classID: { $first: "$classID" },
            points: { $sum: "$points" },
            possiblePoints: { $sum: "$possiblePoints" },
            ilvl: { $first: "$ilvl" },
            rankPercent: { $max: "$rankPercent" },
            medianPercent: { $max: "$medianPercent" },
            updatedAt: { $max: "$updatedAt" },
            bossScores: { $push: { encounterId: "$_id.encounterId", points: "$points", rankPercent: "$rankPercent" } },
          },
        },
        { $match: { points: { $gt: 0 } } },
        { $sort: { points: -1, possiblePoints: -1, name: 1 } },
        { $skip: skip },
        { $limit: safeLimit },
      ]);

      const guildMap = await getGuildMapForRows(agg);

      const data = agg.map((r: any) => ({
        character: {
          wclCanonicalCharacterId: r.wclCanonicalCharacterId,
          name: r.name,
          realm: r.realm,
          region: r.region,
          classID: r.classID,
          guild: guildMap.get(String(r.characterId)) ?? null,
        },
        context: {
          zoneId,
          difficulty: MYTHIC_DIFFICULTY,
          partition,
          encounterId: null,
          specName: normalizedSpecName,
          role: normalizedRole,
          ilvl: r.ilvl,
        },
        score: { type: "allStars" as const, value: r.points ?? 0 },
        stats: {
          allStars: {
            points: r.points ?? 0,
            possiblePoints: r.possiblePoints ?? 0,
          },
          rankPercent: r.rankPercent,
          medianPercent: r.medianPercent,
        },
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
        bossScores: r.bossScores ?? [],
      }));

      const filteredData = data;

      return {
        data: filteredData,
        pagination: {
          totalItems,
          totalPages: Math.ceil(totalItems / safeLimit),
          currentPage: Math.max(page, 1),
          pageSize: safeLimit,
        },
      };
    }

    // Partition ignored: for each boss, pick BEST result across partitions, then sum per character
    const matchNoPartition: any = {
      zoneId,
      difficulty: MYTHIC_DIFFICULTY,
    };
    if (classId !== undefined) matchNoPartition.classID = classId;
    if (normalizedSpecName !== undefined) matchNoPartition.specName = normalizedSpecName;
    if (normalizedRole !== undefined) matchNoPartition.role = normalizedRole;
    if (nameRegex) matchNoPartition.name = nameRegex;

    // Count unique characters first
    const countAgg = await Ranking.aggregate([
      { $match: matchNoPartition },
      {
        $group: {
          _id: "$wclCanonicalCharacterId",
          points: { $sum: "$allStars.points" },
        },
      },
      { $match: { points: { $gt: 0 } } },
      { $count: "total" },
    ]);

    const totalItems = countAgg.length > 0 ? countAgg[0].total : 0;

    // For each character+encounter combo, pick the BEST row across partitions (max allStars.points)
    // Then group by character and sum the best per-boss values
    const agg = await Ranking.aggregate([
      { $match: matchNoPartition },

      // Sort by allStars.points descending to pick the best partition per encounter
      { $sort: { "allStars.points": -1, partition: -1 } },

      // Group by character + encounter, pick first (best) from each group
      {
        $group: {
          _id: {
            wclCanonicalCharacterId: "$wclCanonicalCharacterId",
            encounterId: "$encounter.id",
          },
          characterId: { $first: "$characterId" },
          wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
          name: { $first: "$name" },
          realm: { $first: "$realm" },
          region: { $first: "$region" },
          classID: { $first: "$classID" },
          points: { $first: "$allStars.points" },
          possiblePoints: { $first: "$allStars.possiblePoints" },
          ilvl: { $first: "$ilvl" },
          rankPercent: { $first: "$rankPercent" },
          medianPercent: { $first: "$medianPercent" },
          updatedAt: { $first: "$updatedAt" },
        },
      },

      // Now group by character and sum the best per-boss points/possiblePoints
      {
        $group: {
          _id: "$_id.wclCanonicalCharacterId",
          characterId: { $first: "$characterId" },
          wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
          name: { $first: "$name" },
          realm: { $first: "$realm" },
          region: { $first: "$region" },
          classID: { $first: "$classID" },
          points: { $sum: "$points" },
          possiblePoints: { $sum: "$possiblePoints" },
          ilvl: { $first: "$ilvl" },
          rankPercent: { $max: "$rankPercent" },
          medianPercent: { $max: "$medianPercent" },
          updatedAt: { $max: "$updatedAt" },
          bossScores: { $push: { encounterId: "$_id.encounterId", points: "$points", rankPercent: "$rankPercent" } },
        },
      },
      { $match: { points: { $gt: 0 } } },

      { $sort: { points: -1, possiblePoints: -1, name: 1 } },
      { $skip: skip },
      { $limit: safeLimit },
    ]);

    const guildMap = await getGuildMapForRows(agg);

    const data = agg.map((r: any) => ({
      character: {
        wclCanonicalCharacterId: r.wclCanonicalCharacterId,
        name: r.name,
        realm: r.realm,
        region: r.region,
        classID: r.classID,
        guild: guildMap.get(String(r.characterId)) ?? null,
      },
      context: {
        zoneId,
        difficulty: MYTHIC_DIFFICULTY,
        encounterId: null,
        specName: normalizedSpecName,
        role: normalizedRole,
        ilvl: r.ilvl,
      },
      score: { type: "allStars" as const, value: r.points ?? 0 },
      stats: {
        allStars: {
          points: r.points ?? 0,
          possiblePoints: r.possiblePoints ?? 0,
        },
        rankPercent: r.rankPercent,
        medianPercent: r.medianPercent,
      },
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
      bossScores: r.bossScores ?? [],
    }));

    const filteredData = data;

    return {
      data: filteredData,
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
