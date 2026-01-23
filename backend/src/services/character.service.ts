import Character from "../models/Character";
import logger from "../utils/logger";
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
  allStars: IWarcraftLogsAllStars[];
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

    const CURRENT_TIER_ID = 44; // Manaforge Omega
    const BATCH_SIZE = 200;

    try {
      // Find eligible characters
      const eligibleChars = await Character.find({
        // Eligible if lastMythicSeenAt within 14 days and rankingsAvailable not "false"
        lastMythicSeenAt: {
          $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        },
        rankingsAvailable: { $ne: "false" },
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

          if (result.characterData?.character?.zoneRankings) {
            const character = result.characterData.character;
            const zoneRankings = character.zoneRankings!;

            // Check if averages changed or no existing ranking
            const hasChanged =
              !char.zoneRanking ||
              Math.abs(
                char.zoneRanking.bestPerformanceAverage -
                  zoneRankings.bestPerformanceAverage,
              ) > 0.001 ||
              Math.abs(
                char.zoneRanking.medianPerformanceAverage -
                  zoneRankings.medianPerformanceAverage,
              ) > 0.001;

            if (hasChanged) {
              // Update with full data
              await TrackedCharacter.findByIdAndUpdate(char._id, {
                zoneRanking: {
                  zoneId: CURRENT_TIER_ID,
                  bestPerformanceAverage: zoneRankings.bestPerformanceAverage,
                  medianPerformanceAverage:
                    zoneRankings.medianPerformanceAverage,
                  allStars:
                    zoneRankings.allStars.length > 0
                      ? {
                          points: zoneRankings.allStars[0].points,
                          possiblePoints:
                            zoneRankings.allStars[0].possiblePoints,
                        }
                      : { points: 0, possiblePoints: 0 },
                },
                rankings: zoneRankings.rankings.map(
                  (r: IWarcraftLogsRanking) => ({
                    encounter: {
                      id: r.encounter.id,
                      name: r.encounter.name,
                    },
                    rankPercent: r.rankPercent ?? 0,
                    medianPercent: r.medianPercent ?? 0,
                    lockedIn: r.lockedIn,
                    totalKills: r.totalKills,
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
                    spec: r.spec ?? "",
                    bestSpec: r.bestSpec,
                    bestAmount: r.bestAmount,
                  }),
                ),
                rankingsAvailable: "true",
                nextEligibleRefreshAt: new Date(
                  Date.now() + 24 * 60 * 60 * 1000,
                ),
                updatedAt: new Date(),
              });
              logger.info(`Updated rankings for ${char.name} (${char.realm})`);
            } else {
              // No changes, just update refresh time
              await TrackedCharacter.findByIdAndUpdate(char._id, {
                nextEligibleRefreshAt: new Date(
                  Date.now() + 24 * 60 * 60 * 1000,
                ),
                updatedAt: new Date(),
              });
              logger.info(`No changes for ${char.name} (${char.realm})`);
            }
          } else {
            // No data, mark as unavailable
            await TrackedCharacter.findByIdAndUpdate(char._id, {
              rankingsAvailable: "false",
              nextEligibleRefreshAt: new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000,
              ),
              updatedAt: new Date(),
            });
            logger.info(
              `No rankings available for ${char.name} (${char.realm})`,
            );
          }

          // Small delay
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

  // Get character rankings by zone ID
  async getCharacterRankingsByZone(
    zoneId: string,
    characterId: string,
  ): Promise<IWarcraftLogsZoneRankings[]> {
    const zoneIdNum = parseInt(zoneId);
    const characterIdNum = parseInt(characterId);
    if (isNaN(zoneIdNum) || isNaN(characterIdNum)) {
      throw new Error("Invalid zone ID or character ID");
    }

    const trackedChars = await TrackedCharacter.findOne({
      "zoneRanking.zoneId": zoneIdNum,
      warcraftlogsId: characterIdNum,
      rankingsAvailable: "true",
    });
  }
}

export default new CharacterService();
