import { CURRENT_RAID_IDS } from "../config/guilds";
import Character from "../models/Character";
import Ranking, { IRanking } from "../models/Ranking";
import logger from "../utils/logger";
import { buildSpecKey, resolveRole } from "../utils/spec";
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
class CharacterService {
  // Check and update character rankings (nightly job)
  async checkAndRefreshCharacterRankings(): Promise<void> {
    logger.info("Starting character ranking check and update...");

    const CURRENT_TIER_ID = CURRENT_RAID_IDS[0];
    const BATCH_SIZE = 200;

    try {
      // Find eligible characters
      const eligibleChars = await Character.find({
        // Eligible if lastMythicSeenAt within 14 days and rankingsAvailable not "false"
        lastMythicSeenAt: {
          $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        },
        rankingsAvailable: { $ne: "false" },
        //  nextEligibleRefreshAt: { $lte: new Date() },
      }).limit(BATCH_SIZE);

      logger.info(
        `Found ${eligibleChars.length} characters eligible for ranking check`,
      );

      for (const char of eligibleChars) {
        try {
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
            logger.info(
              `No rankings available for ${char.name} (${char.realm})`,
            );
            await new Promise((resolve) => setTimeout(resolve, 100));
            continue;
          }

          //  Check if averages changed
          const zoneRankings = character.zoneRankings!;

          const hasChanged = true;

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
            const specName = r.spec?.trim();
            if (!specName) continue;
            const specKey = buildSpecKey(char.classID, specName); // id:slug (e.g. 1:blood)
            const role = resolveRole(char.classID, specName);

            await Ranking.findOneAndUpdate(
              {
                characterId: char._id,
                zoneId: CURRENT_TIER_ID,
                difficulty: 5,
                metric: "dps",
                "encounter.id": r.encounter.id,
                specKey,
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
                specKey,
                role,

                bestSpecName: r.bestSpec,

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

  /*
  async getLeaderboard(options: {
    zoneId: number;
    encounterId?: number;
    spec?: string;
    classID?: number;
  }): Promise<IRanking[]> {
    const { zoneId, encounterId, spec, classID } = options;


  }

  */
  async getRankingsByZone(zoneId: string): Promise<IRanking[] | null> {
    const zoneIdNum = parseInt(zoneId);
    if (isNaN(zoneIdNum)) {
      throw new Error("Invalid zone ID");
    }
    return await Ranking.find({
      zoneId: zoneIdNum,
    });
  }
}

export default new CharacterService();
