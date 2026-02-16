import { CURRENT_RAID_IDS } from "../config/guilds";
import { ROLE_BY_CLASS_AND_SPEC } from "../config/specs";
import Character from "../models/Character";
import CharacterLeaderboard from "../models/CharacterLeaderboard";
import Ranking from "../models/Ranking";
import Raid from "../models/Raid";
import logger from "../utils/logger";
import { resolveRole, slugifySpecName } from "../utils/spec";
import rateLimitService from "./rate-limit.service";
import wclService from "./warcraftlogs.service";
import mongoose from "mongoose";

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
  // When using aliased queries, zoneRankings fields appear as dynamic keys (e.g. "holyRankings", "shadowRankings")
  [aliasedRankings: string]: IWarcraftLogsZoneRankings | null | unknown;
}

interface IWarcraftLogsResponse {
  characterData: {
    character: IWarcraftLogsCharacter | null;
  };
}

/**
 * Convert a spec slug ("beast-mastery") to WCL PascalCase spec name ("BeastMastery").
 * WCL expects specName with first letter uppercase and hyphens removed.
 */
function toWclSpecName(specSlug: string): string {
  return specSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

/**
 * Convert a spec slug ("beast-mastery") to a valid GraphQL alias ("beastMasteryRankings").
 */
function toSpecAlias(specSlug: string): string {
  const parts = specSlug.split("-");
  const camel =
    parts[0] +
    parts
      .slice(1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
  return `${camel}Rankings`;
}

export type CharacterRankingRow = {
  rank: number;
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
    totalRankedItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  };
  jumpTo?: {
    rank: number;
    wclCanonicalCharacterId: number;
  };
};

class CharacterService {
  /**
   * Upsert a character from WCL report data with guild history tracking.
   *
   * For new characters: creates the document with current guild and initial history entry.
   * For existing characters: updates core fields, then handles guild change detection
   * and history tracking in a separate atomic step.
   */
  async upsertCharacterFromReport(params: {
    canonicalID: number;
    name: string;
    serverSlug: string;
    serverRegion: string;
    classID: number;
    hidden: boolean;
    guildName: string | null;
    guildRealm: string | null;
  }): Promise<void> {
    const now = new Date();
    const { canonicalID, name, serverSlug, serverRegion, classID, hidden, guildName, guildRealm } = params;

    const initialGuildHistory = guildName && guildRealm ? [{ guildName, guildRealm, firstSeenAt: now, lastSeenAt: now }] : [];

    // Atomic upsert: core fields always updated via $set,
    // guild fields set only on insert via $setOnInsert (existing chars handled separately)
    const character = await Character.findOneAndUpdate(
      { wclCanonicalCharacterId: canonicalID },
      {
        $set: {
          name,
          realm: serverSlug,
          region: serverRegion,
          classID,
          wclProfileHidden: hidden,
          lastMythicSeenAt: now,
          rankingsAvailable: hidden === true ? false : null,
          nextEligibleRefreshAt: now,
        },
        $setOnInsert: {
          wclCanonicalCharacterId: canonicalID,
          guildName,
          guildRealm,
          guildUpdatedAt: now,
          guildHistory: initialGuildHistory,
        },
      },
      { upsert: true, new: true },
    );

    if (!character) return;

    // For newly-inserted documents, $setOnInsert already set guild fields — skip further work.
    // Detect insert: guildHistory was set by $setOnInsert, so if it exists and updatedAt ≈ now,
    // we assume this was an insert. A safer check: if guildUpdatedAt equals now (same ms).
    // However, existing pre-migration characters won't have guildHistory at all.
    // To keep it simple and idempotent, always run the guild update — it's a no-op if nothing changed.
    await this.updateCharacterGuild(character._id as mongoose.Types.ObjectId, character.guildName ?? null, character.guildRealm ?? null, guildName, guildRealm, now);
  }

  /**
   * Atomically update a character's current guild and guild history.
   *
   * - If guild changed: update guildName/guildRealm/guildUpdatedAt
   * - If guild exists in history: update lastSeenAt on existing entry
   * - If guild is new to history: push a new entry
   * - If guild was removed (null): clear current guild fields
   */
  private async updateCharacterGuild(
    characterId: mongoose.Types.ObjectId,
    currentGuildName: string | null,
    currentGuildRealm: string | null,
    newGuildName: string | null,
    newGuildRealm: string | null,
    seenAt: Date,
  ): Promise<void> {
    const guildChanged = currentGuildName !== newGuildName || currentGuildRealm !== newGuildRealm;

    // Case 1: No guild data from WCL
    if (!newGuildName || !newGuildRealm) {
      if (guildChanged && currentGuildName) {
        await Character.updateOne(
          { _id: characterId },
          {
            $set: {
              guildName: null,
              guildRealm: null,
              guildUpdatedAt: seenAt,
            },
          },
        );
      }
      return;
    }

    // Case 2: We have guild data — determine what to update
    const setFields: Record<string, unknown> = {};
    if (guildChanged) {
      setFields.guildName = newGuildName;
      setFields.guildRealm = newGuildRealm;
      setFields.guildUpdatedAt = seenAt;
    }

    // Try to update an existing guild history entry (atomic positional update)
    const historyUpdate = await Character.updateOne(
      {
        _id: characterId,
        guildHistory: {
          $elemMatch: { guildName: newGuildName, guildRealm: newGuildRealm },
        },
      },
      {
        $set: {
          ...setFields,
          "guildHistory.$.lastSeenAt": seenAt,
        },
      },
    );

    // If matchedCount === 0, the guild wasn't in history — add it
    if (historyUpdate.matchedCount === 0) {
      await Character.updateOne(
        { _id: characterId },
        {
          $set: setFields,
          $push: {
            guildHistory: {
              guildName: newGuildName,
              guildRealm: newGuildRealm,
              firstSeenAt: seenAt,
              lastSeenAt: seenAt,
            },
          },
        },
      );
    }
  }

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

          // Check rate limit before WCL API call — wait for reset if near threshold
          if (rateLimitService.getPercentUsed() >= RATE_LIMIT_PAUSE_PERCENT) {
            const resetMs = rateLimitService.getTimeUntilReset();
            logger.info(
              `[CharacterRankings] Rate limit at ${rateLimitService.getPercentUsed().toFixed(1)}%, pausing for ${Math.ceil(resetMs / 1000)}s until reset (processed ${processedCount} so far)`,
            );
            await rateLimitService.waitForReset();
            logger.info(`[CharacterRankings] Rate limit reset, resuming`);
          }

          try {
            // Build a single query with aliased zoneRankings per spec.
            // Each alias fetches rankings for one spec, avoiding N+1 API calls.
            const specAliasFields = specSlugs.map((slug) => {
              const wclName = toWclSpecName(slug);
              const alias = toSpecAlias(slug);
              return `${alias}: zoneRankings(zoneID: $zoneID, difficulty: ${MYTHIC_DIFFICULTY}, metric: dps, compare: Rankings, timeframe: Historical, partition: ${partition}, specName: "${wclName}")`;
            });

            const query = `
              query($serverSlug: String!, $serverRegion: String!, $characterName: String!, $zoneID: Int!) {
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
                    ${specAliasFields.join("\n                    ")}
                  }
                }
              }
            `;

            const variables = {
              characterName: char.name,
              serverSlug: char.realm.toLowerCase().replace(/\s+/g, "-"),
              serverRegion: char.region.toLowerCase(),
              zoneID: CURRENT_TIER_ID,
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
              logger.info(`[CharacterRankings] No rankings available for ${char.name} (${char.realm}) — hidden or missing`);
              await new Promise((resolve) => setTimeout(resolve, 100));
              continue;
            }

            let hasAnySpecRankings = false;

            // Process each spec's aliased zoneRankings from the single response
            for (const specSlug of specSlugs) {
              const alias = toSpecAlias(specSlug);
              const zoneRankings = (character as Record<string, unknown>)[alias] as IWarcraftLogsZoneRankings | null;

              if (!zoneRankings || (zoneRankings as any).error) {
                await Ranking.deleteMany({
                  characterId: char._id,
                  zoneId: CURRENT_TIER_ID,
                  difficulty: MYTHIC_DIFFICULTY,
                  partition,
                  specName: specSlug,
                });
                logger.debug(`[CharacterRankings] No rankings for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                continue;
              }

              // Data is already filtered to this spec by WCL — use directly
              const allStarsEntries = zoneRankings.allStars ?? [];
              const rankingsEntries = zoneRankings.rankings ?? [];

              if (allStarsEntries.length === 0 && rankingsEntries.length === 0) {
                await Ranking.deleteMany({
                  characterId: char._id,
                  zoneId: CURRENT_TIER_ID,
                  difficulty: MYTHIC_DIFFICULTY,
                  partition: zoneRankings.partition,
                  specName: specSlug,
                });
                logger.debug(`[CharacterRankings] No rankings for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                continue;
              }

              hasAnySpecRankings = true;

              // Check if rankings have changed by comparing with stored Ranking docs.
              // Compare both allStars totals AND per-boss bestAmount/rankPercent/totalKills
              // so that bosses excluded from allStars scoring are still detected as changed.
              const existingRankings = await Ranking.find({
                characterId: char._id,
                zoneId: CURRENT_TIER_ID,
                difficulty: MYTHIC_DIFFICULTY,
                partition: zoneRankings.partition,
                specName: specSlug,
              }).lean();

              const freshPoints = allStarsEntries.reduce((sum, a) => sum + (a.points ?? 0), 0);
              const freshPossiblePoints = allStarsEntries.reduce((sum, a) => sum + (a.possiblePoints ?? 0), 0);
              const storedPoints = existingRankings.reduce((sum, r: any) => sum + (r.allStars?.points ?? 0), 0);
              const storedPossiblePoints = existingRankings.reduce((sum, r: any) => sum + (r.allStars?.possiblePoints ?? 0), 0);

              const allStarsChanged = freshPoints !== storedPoints || freshPossiblePoints !== storedPossiblePoints;

              // Build a fingerprint of per-boss data so non-allStars bosses are also detected
              const freshBossFingerprint = rankingsEntries
                .map((r) => `${r.encounter.id}:${r.bestAmount ?? 0}:${r.rankPercent ?? 0}:${r.totalKills ?? 0}`)
                .sort()
                .join("|");
              const storedBossFingerprint = existingRankings
                .map((r: any) => `${r.encounter?.id}:${r.bestAmount ?? 0}:${r.rankPercent ?? 0}:${r.totalKills ?? 0}`)
                .sort()
                .join("|");

              const hasChanged = existingRankings.length === 0 || allStarsChanged || freshBossFingerprint !== storedBossFingerprint;

              if (!hasChanged) {
                logger.debug(`[CharacterRankings] No changes for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                continue;
              }

              // Upsert rankings for this spec
              for (const r of rankingsEntries) {
                const rankingSpecSlug = r.spec ? slugifySpecName(r.spec) : specSlug;
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

            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (error) {
            logger.error(`[CharacterRankings] Error checking rankings for ${char.name} (${char.realm}):`, error);
          }
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

  /**
   * Rebuild the materialized CharacterLeaderboard collection from Ranking data.
   * Creates one document per character per leaderboard view.
   * Should be called after nightly rankings refresh completes.
   */
  async buildCharacterLeaderboards(): Promise<void> {
    const CURRENT_TIER_ID = CURRENT_RAID_IDS[0];
    const MYTHIC_DIFFICULTY = 5;
    const startTime = Date.now();

    logger.info("[Leaderboard] Starting leaderboard build...");

    try {
      // Discover distinct encounters and partitions in the current tier
      const encounterIds: number[] = await Ranking.distinct("encounter.id", { zoneId: CURRENT_TIER_ID, difficulty: MYTHIC_DIFFICULTY });
      const partitions: number[] = await Ranking.distinct("partition", { zoneId: CURRENT_TIER_ID, difficulty: MYTHIC_DIFFICULTY });

      logger.info(`[Leaderboard] Found ${encounterIds.length} encounters, ${partitions.length} partitions`);

      // Build global guild map once (characterId → guild info)
      const allCharacterIds = await Ranking.distinct("characterId", { zoneId: CURRENT_TIER_ID, difficulty: MYTHIC_DIFFICULTY });
      const characters = await Character.find({ _id: { $in: allCharacterIds } })
        .select("_id guildName guildRealm")
        .lean();
      const guildMap = new Map<string, { name: string; realm: string } | null>();
      for (const c of characters) {
        const gn = c.guildName ?? null;
        const gr = c.guildRealm ?? null;
        guildMap.set(String(c._id), gn && gr ? { name: gn, realm: gr } : null);
      }

      const entries: any[] = [];

      // ── Boss leaderboards (per encounter × per partition) ──────────
      for (const encId of encounterIds) {
        for (const part of partitions) {
          // Group by wclCanonicalCharacterId to keep only the best spec per character
          const rows = await Ranking.aggregate([
            {
              $match: {
                zoneId: CURRENT_TIER_ID,
                difficulty: MYTHIC_DIFFICULTY,
                partition: part,
                "encounter.id": encId,
                bestAmount: { $ne: 0 },
              },
            },
            { $sort: { bestAmount: -1, rankPercent: -1, totalKills: -1 } },
            {
              $group: {
                _id: "$wclCanonicalCharacterId",
                characterId: { $first: "$characterId" },
                wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
                name: { $first: "$name" },
                realm: { $first: "$realm" },
                region: { $first: "$region" },
                classID: { $first: "$classID" },
                specName: { $first: "$specName" },
                bestSpecName: { $first: "$bestSpecName" },
                role: { $first: "$role" },
                ilvl: { $first: "$ilvl" },
                bestAmount: { $first: "$bestAmount" },
                encounterName: { $first: "$encounter.name" },
                rankPercent: { $first: "$rankPercent" },
                medianPercent: { $first: "$medianPercent" },
                lockedIn: { $first: "$lockedIn" },
                totalKills: { $first: "$totalKills" },
                updatedAt: { $first: "$updatedAt" },
              },
            },
          ]);

          for (const r of rows) {
            const guild = guildMap.get(String(r.characterId));
            entries.push({
              zoneId: CURRENT_TIER_ID,
              difficulty: MYTHIC_DIFFICULTY,
              type: "boss",
              encounterId: encId,
              partition: part,
              characterId: r.characterId,
              wclCanonicalCharacterId: r.wclCanonicalCharacterId,
              name: r.name,
              realm: r.realm,
              region: r.region,
              classID: r.classID,
              specName: r.specName,
              bestSpecName: r.bestSpecName,
              role: r.role,
              ilvl: r.ilvl ?? 0,
              score: r.bestAmount,
              encounterName: r.encounterName,
              rankPercent: r.rankPercent,
              medianPercent: r.medianPercent,
              lockedIn: r.lockedIn,
              totalKills: r.totalKills,
              bestAmount: r.bestAmount,
              allStarsPoints: 0,
              allStarsPossiblePoints: 0,
              bossScores: [],
              guildName: guild?.name ?? null,
              guildRealm: guild?.realm ?? null,
              sourcePartition: part,
              updatedAt: r.updatedAt ?? new Date(),
            });
          }
        }

        // Boss + all partitions (best per character across partitions)
        const bestPerChar = await Ranking.aggregate([
          { $match: { zoneId: CURRENT_TIER_ID, difficulty: MYTHIC_DIFFICULTY, "encounter.id": encId } },
          { $sort: { bestAmount: -1, rankPercent: -1, totalKills: -1, partition: -1 } },
          {
            $group: {
              _id: "$wclCanonicalCharacterId",
              characterId: { $first: "$characterId" },
              wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
              name: { $first: "$name" },
              realm: { $first: "$realm" },
              region: { $first: "$region" },
              classID: { $first: "$classID" },
              specName: { $first: "$specName" },
              bestSpecName: { $first: "$bestSpecName" },
              role: { $first: "$role" },
              ilvl: { $first: "$ilvl" },
              bestAmount: { $first: "$bestAmount" },
              encounterName: { $first: "$encounter.name" },
              rankPercent: { $first: "$rankPercent" },
              medianPercent: { $first: "$medianPercent" },
              lockedIn: { $first: "$lockedIn" },
              totalKills: { $first: "$totalKills" },
              partition: { $first: "$partition" },
              updatedAt: { $first: "$updatedAt" },
            },
          },
          { $match: { bestAmount: { $ne: 0 } } },
        ]);

        for (const r of bestPerChar) {
          const guild = guildMap.get(String(r.characterId));
          entries.push({
            zoneId: CURRENT_TIER_ID,
            difficulty: MYTHIC_DIFFICULTY,
            type: "boss",
            encounterId: encId,
            partition: null,
            characterId: r.characterId,
            wclCanonicalCharacterId: r.wclCanonicalCharacterId,
            name: r.name,
            realm: r.realm,
            region: r.region,
            classID: r.classID,
            specName: r.specName,
            bestSpecName: r.bestSpecName,
            role: r.role,
            ilvl: r.ilvl ?? 0,
            score: r.bestAmount,
            encounterName: r.encounterName,
            rankPercent: r.rankPercent,
            medianPercent: r.medianPercent,
            lockedIn: r.lockedIn,
            totalKills: r.totalKills,
            bestAmount: r.bestAmount,
            allStarsPoints: 0,
            allStarsPossiblePoints: 0,
            bossScores: [],
            guildName: guild?.name ?? null,
            guildRealm: guild?.realm ?? null,
            sourcePartition: r.partition,
            updatedAt: r.updatedAt ?? new Date(),
          });
        }
      }

      // ── AllStars leaderboards (per partition) ──────────────────────
      for (const part of partitions) {
        const allStarsAgg = await Ranking.aggregate([
          { $match: { zoneId: CURRENT_TIER_ID, difficulty: MYTHIC_DIFFICULTY, partition: part } },
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
              specName: { $first: "$specName" },
              role: { $first: "$role" },
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
              specName: { $first: "$specName" },
              role: { $first: "$role" },
              points: { $sum: "$points" },
              possiblePoints: { $sum: "$possiblePoints" },
              ilvl: { $first: "$ilvl" },
              rankPercent: { $max: "$rankPercent" },
              medianPercent: { $max: "$medianPercent" },
              updatedAt: { $max: "$updatedAt" },
              bossScores: {
                $push: {
                  encounterId: "$_id.encounterId",
                  points: "$points",
                  rankPercent: "$rankPercent",
                  specName: "$specName",
                },
              },
            },
          },
          { $match: { points: { $gt: 0 } } },
        ]);

        for (const r of allStarsAgg) {
          const guild = guildMap.get(String(r.characterId));
          entries.push({
            zoneId: CURRENT_TIER_ID,
            difficulty: MYTHIC_DIFFICULTY,
            type: "allstars",
            encounterId: null,
            partition: part,
            characterId: r.characterId,
            wclCanonicalCharacterId: r.wclCanonicalCharacterId,
            name: r.name,
            realm: r.realm,
            region: r.region,
            classID: r.classID,
            specName: r.specName,
            bestSpecName: "",
            role: r.role,
            ilvl: r.ilvl ?? 0,
            score: r.points,
            encounterName: "",
            rankPercent: r.rankPercent,
            medianPercent: r.medianPercent,
            lockedIn: false,
            totalKills: 0,
            bestAmount: 0,
            allStarsPoints: r.points,
            allStarsPossiblePoints: r.possiblePoints,
            bossScores: r.bossScores ?? [],
            guildName: guild?.name ?? null,
            guildRealm: guild?.realm ?? null,
            sourcePartition: part,
            updatedAt: r.updatedAt ?? new Date(),
          });
        }
      }

      // ── AllStars + all partitions (best per boss across partitions) ─
      const allStarsAllPartitions = await Ranking.aggregate([
        { $match: { zoneId: CURRENT_TIER_ID, difficulty: MYTHIC_DIFFICULTY } },
        { $sort: { "allStars.points": -1, partition: -1 } },
        {
          $group: {
            _id: { wclCanonicalCharacterId: "$wclCanonicalCharacterId", encounterId: "$encounter.id" },
            characterId: { $first: "$characterId" },
            wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
            name: { $first: "$name" },
            realm: { $first: "$realm" },
            region: { $first: "$region" },
            classID: { $first: "$classID" },
            specName: { $first: "$specName" },
            role: { $first: "$role" },
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
            _id: "$_id.wclCanonicalCharacterId",
            characterId: { $first: "$characterId" },
            wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
            name: { $first: "$name" },
            realm: { $first: "$realm" },
            region: { $first: "$region" },
            classID: { $first: "$classID" },
            specName: { $first: "$specName" },
            role: { $first: "$role" },
            points: { $sum: "$points" },
            possiblePoints: { $sum: "$possiblePoints" },
            ilvl: { $first: "$ilvl" },
            rankPercent: { $max: "$rankPercent" },
            medianPercent: { $max: "$medianPercent" },
            updatedAt: { $max: "$updatedAt" },
            bossScores: {
              $push: {
                encounterId: "$_id.encounterId",
                points: "$points",
                rankPercent: "$rankPercent",
                specName: "$specName",
              },
            },
          },
        },
        { $match: { points: { $gt: 0 } } },
      ]);

      for (const r of allStarsAllPartitions) {
        const guild = guildMap.get(String(r.characterId));
        entries.push({
          zoneId: CURRENT_TIER_ID,
          difficulty: MYTHIC_DIFFICULTY,
          type: "allstars",
          encounterId: null,
          partition: null,
          characterId: r.characterId,
          wclCanonicalCharacterId: r.wclCanonicalCharacterId,
          name: r.name,
          realm: r.realm,
          region: r.region,
          classID: r.classID,
          specName: r.specName,
          bestSpecName: "",
          role: r.role,
          ilvl: r.ilvl ?? 0,
          score: r.points,
          encounterName: "",
          rankPercent: r.rankPercent,
          medianPercent: r.medianPercent,
          lockedIn: false,
          totalKills: 0,
          bestAmount: 0,
          allStarsPoints: r.points,
          allStarsPossiblePoints: r.possiblePoints,
          bossScores: r.bossScores ?? [],
          guildName: guild?.name ?? null,
          guildRealm: guild?.realm ?? null,
          sourcePartition: 0,
          updatedAt: r.updatedAt ?? new Date(),
        });
      }

      // ── Atomic swap: drop old data, insert new ─────────────────────
      logger.info(`[Leaderboard] Inserting ${entries.length} leaderboard entries...`);
      await CharacterLeaderboard.deleteMany({ zoneId: CURRENT_TIER_ID });

      if (entries.length > 0) {
        // Insert in batches of 5000 to avoid memory pressure
        const BATCH = 5000;
        for (let i = 0; i < entries.length; i += BATCH) {
          await CharacterLeaderboard.insertMany(entries.slice(i, i + BATCH), { ordered: false });
        }
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      logger.info(`[Leaderboard] Build completed: ${entries.length} entries in ${duration}s`);
    } catch (error) {
      logger.error("[Leaderboard] Build failed:", error);
      throw error;
    }
  }

  /**
   * Query the materialized leaderboard for character rankings.
   *
   * All operations are simple indexed find/count — no aggregation needed at query time.
   * Ranks are either positional (for unfiltered views) or computed via fast countDocuments
   * (for name-filtered views where we need global rank).
   */
  async getCharacterRankings(options: {
    zoneId: number;
    encounterId?: number;
    classId?: number;
    specName?: string;
    role?: "dps" | "healer" | "tank";
    partition?: number;
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
    const exactNameRegex = normalizedCharacterName ? new RegExp(`^${escapeRegex(normalizedCharacterName)}$`, "i") : undefined;
    const partialNameRegex = normalizedCharacterName ? new RegExp(escapeRegex(normalizedCharacterName), "i") : undefined;

    const safeLimit = Math.min(Math.max(limit, 1), 500);

    // ── Base query identifies the leaderboard view ───────────────────
    const baseQuery: any = {
      zoneId,
      difficulty: MYTHIC_DIFFICULTY,
      type: encounterId !== undefined ? "boss" : "allstars",
      encounterId: encounterId ?? null,
      partition: partition ?? null,
    };

    // ── Optional filters ─────────────────────────────────────────────
    if (classId !== undefined) baseQuery.classID = classId;
    if (normalizedSpecName !== undefined) baseQuery.specName = normalizedSpecName;
    if (normalizedRole !== undefined) baseQuery.role = normalizedRole;

    // Total ranked items (before any name filter)
    const totalRankedItems = await CharacterLeaderboard.countDocuments(baseQuery);

    let jumpTo: { rank: number; wclCanonicalCharacterId: number } | undefined;
    let effectiveSkip: number;
    let effectivePage: number;
    let totalItems: number;
    let fetchQuery: any = { ...baseQuery };
    let needsGlobalRanks = false;

    if (exactNameRegex) {
      // Try exact match → jump to character's page
      const exactMatch = await CharacterLeaderboard.findOne({ ...baseQuery, name: exactNameRegex })
        .select("score wclCanonicalCharacterId")
        .lean();

      if (exactMatch) {
        const higherCount = await CharacterLeaderboard.countDocuments({
          ...baseQuery,
          score: { $gt: exactMatch.score },
        });
        const rank = higherCount + 1;
        effectivePage = Math.ceil(rank / safeLimit) || 1;
        effectiveSkip = (effectivePage - 1) * safeLimit;
        totalItems = totalRankedItems;
        jumpTo = { rank, wclCanonicalCharacterId: exactMatch.wclCanonicalCharacterId };
      } else if (partialNameRegex) {
        // No exact match → fall back to partial name filter
        fetchQuery = { ...baseQuery, name: partialNameRegex };
        totalItems = await CharacterLeaderboard.countDocuments(fetchQuery);
        effectivePage = Math.max(page, 1);
        effectiveSkip = (effectivePage - 1) * safeLimit;
        needsGlobalRanks = true;
      } else {
        totalItems = totalRankedItems;
        effectivePage = Math.max(page, 1);
        effectiveSkip = (effectivePage - 1) * safeLimit;
      }
    } else {
      totalItems = totalRankedItems;
      effectivePage = Math.max(page, 1);
      effectiveSkip = (effectivePage - 1) * safeLimit;
    }

    // ── Fetch the page ───────────────────────────────────────────────
    const entries = await CharacterLeaderboard.find(fetchQuery).sort({ score: -1, name: 1 }).skip(effectiveSkip).limit(safeLimit).lean();

    // ── Compute ranks ────────────────────────────────────────────────
    // When name-filtered, positional ranks are wrong (they'd show position within
    // filtered results). Instead, compute each row's global rank via indexed count.
    let ranks: number[];
    if (needsGlobalRanks && entries.length > 0) {
      ranks = await Promise.all(
        entries.map(async (e) => {
          const count = await CharacterLeaderboard.countDocuments({
            ...baseQuery,
            score: { $gt: e.score },
          });
          return count + 1;
        }),
      );
    } else {
      ranks = entries.map((_, i) => effectiveSkip + i + 1);
    }

    // ── Map to response format ───────────────────────────────────────
    const isBossType = encounterId !== undefined;

    const data: CharacterRankingRow[] = entries.map((e: any, i: number) => {
      const guild = e.guildName && e.guildRealm ? { name: e.guildName, realm: e.guildRealm } : null;

      const row: CharacterRankingRow = {
        rank: ranks[i],
        character: {
          wclCanonicalCharacterId: e.wclCanonicalCharacterId,
          name: e.name,
          realm: e.realm,
          region: e.region,
          classID: e.classID,
          guild,
        },
        context: {
          zoneId: e.zoneId,
          difficulty: e.difficulty,
          partition: e.sourcePartition || e.partition,
          encounterId: e.encounterId,
          specName: e.specName,
          bestSpecName: e.bestSpecName || undefined,
          role: e.role,
          ilvl: e.ilvl,
        },
        score: {
          type: isBossType ? "bestAmount" : "allStars",
          value: e.score,
        },
        stats: isBossType
          ? {
              bestAmount: e.bestAmount,
              rankPercent: e.rankPercent,
              medianPercent: e.medianPercent,
              lockedIn: e.lockedIn,
              totalKills: e.totalKills,
            }
          : {
              allStars: {
                points: e.allStarsPoints,
                possiblePoints: e.allStarsPossiblePoints,
              },
              rankPercent: e.rankPercent,
              medianPercent: e.medianPercent,
            },
        updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : undefined,
      };

      if (isBossType) {
        row.encounter = {
          id: e.encounterId,
          name: e.encounterName,
        };
      }

      if (!isBossType && e.bossScores?.length > 0) {
        (row as any).bossScores = e.bossScores;
      }

      return row;
    });

    return {
      data,
      pagination: {
        totalItems,
        totalRankedItems,
        totalPages: Math.ceil(totalItems / safeLimit),
        currentPage: effectivePage,
        pageSize: safeLimit,
      },
      jumpTo,
    };
  }
}

export default new CharacterService();
