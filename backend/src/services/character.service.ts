import TrackedCharacter, {
  ITrackedCharacter,
} from "../models/TrackedCharacter";
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
  data: {
    characterData: {
      character: IWarcraftLogsCharacter | null;
    };
  };
}

interface IWarcraftLogsLightResponse {
  data: {
    characterData: {
      character: {
        zoneRankings: {
          bestPerformanceAverage: number;
          medianPerformanceAverage: number;
        } | null;
      } | null;
    };
  };
}

class CharacterService {
  // Fetch full rankings for characters (initial or when changes detected)
  async fetchFullCharacterRankings(
    characters?: ITrackedCharacter[],
  ): Promise<void> {
    const charsToProcess =
      characters ||
      (await TrackedCharacter.find({
        lastMythicSeenAt: {
          $gte: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        },
        rankingsAvailable: { $ne: "false" },
      }).limit(200));

    logger.info(
      `Fetching full rankings for ${charsToProcess.length} characters...`,
    );

    for (const char of charsToProcess) {
      try {
        // Fetch full zone rankings
        const query = `
          query($serverSlug: String!, $serverRegion: String!, $characterName: String!, $zoneID: Int!) {
            data {
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
          }
        `;

        const variables = {
          serverSlug: char.realm.toLowerCase().replace(/\s+/g, "-"),
          serverRegion: char.region.toLowerCase(),
          characterName: char.name,
          zoneID: 44, // Manaforge Omega
        };

        const result = await wclService.query<IWarcraftLogsResponse>(
          query,
          variables,
        );

        if (result.data?.characterData?.character) {
          const character = result.data.characterData.character;

          await TrackedCharacter.findByIdAndUpdate(char._id, {
            zoneRanking: character.zoneRankings
              ? {
                  zoneId: 44,
                  bestPerformanceAverage:
                    character.zoneRankings.bestPerformanceAverage,
                  medianPerformanceAverage:
                    character.zoneRankings.medianPerformanceAverage,
                  allStars:
                    character.zoneRankings.allStars.length > 0
                      ? {
                          // First entry is overall all stars
                          points: character.zoneRankings.allStars[0].points,
                          possiblePoints:
                            character.zoneRankings.allStars[0].possiblePoints,
                        }
                      : { points: 0, possiblePoints: 0 },
                }
              : undefined,
            rankings: character.zoneRankings
              ? {
                  rankings: character.zoneRankings.rankings.map(
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
                            points: r.allStars.points,
                            possiblePoints: r.allStars.possiblePoints,
                          }
                        : { points: 0, possiblePoints: 0 },
                      spec: r.spec ?? "",
                      bestSpec: r.bestSpec,
                      bestAmount: r.bestAmount,
                    }),
                  ),
                }
              : undefined,
            rankingsAvailable: "true",
            nextEligibleRefreshAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
            updatedAt: new Date(),
          });

          logger.info(`Updated full rankings for ${char.name} (${char.realm})`);
        } else {
          await TrackedCharacter.findByIdAndUpdate(char._id, {
            rankingsAvailable: "false",
            nextEligibleRefreshAt: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000,
            ), // Try again in a week
            updatedAt: new Date(),
          });
          logger.info(`No rankings available for ${char.name} (${char.realm})`);
        }

        // Small delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        logger.error(`Error fetching full rankings for ${char.name}:`, error);
      }
    }

    logger.info("Full character ranking fetch completed");
  }

  // Lightweight check for ranking changes (nightly job)
  async checkAndRefreshCharacterRankings(): Promise<void> {
    logger.info("Starting lightweight character ranking check...");

    const CURRENT_TIER_ID = 44; // Manaforge Omega
    const BATCH_SIZE = 200;

    try {
      // Find eligible characters with existing rankings
      const eligibleChars = await TrackedCharacter.find({
        lastMythicSeenAt: {
          $gte: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        },
        rankingsAvailable: "true",
        nextEligibleRefreshAt: { $lte: new Date() },
      }).limit(BATCH_SIZE);

      logger.info(
        `Found ${eligibleChars.length} characters eligible for ranking check`,
      );

      const charsNeedingFullUpdate: ITrackedCharacter[] = [];

      for (const char of eligibleChars) {
        try {
          // Fetch only summary zone rankings
          const query = `
            query($serverSlug: String!, $serverRegion: String!, $characterName: String!, $zoneID: Int!) {
              data {
                characterData {
                  character(serverSlug: $serverSlug, serverRegion: $serverRegion, name: $characterName) {
                    zoneRankings(
                      zoneID: $zoneID,
                      difficulty: 5,
                      metric: dps,
                      compare: Rankings,
                      timeframe: Historical
                    ) {
                      bestPerformanceAverage
                      medianPerformanceAverage
                    }
                  }
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

          const result = await wclService.query<IWarcraftLogsLightResponse>(
            query,
            variables,
          );

          if (result.data?.characterData?.character?.zoneRankings) {
            const zoneRankings =
              result.data.characterData.character.zoneRankings;

            // Check if averages changed
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
              charsNeedingFullUpdate.push(char);
              logger.info(
                `Detected changes for ${char.name} (${char.realm}), scheduling full update`,
              );
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

      // Perform full updates for changed characters
      if (charsNeedingFullUpdate.length > 0) {
        await this.fetchFullCharacterRankings(charsNeedingFullUpdate);
      }

      logger.info("Lightweight character ranking check completed");
    } catch (error) {
      logger.error("Error in character ranking check:", error);
    }
  }
}

export default new CharacterService();
