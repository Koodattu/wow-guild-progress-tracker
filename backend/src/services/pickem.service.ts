import Pickem, { IPickem, IScoringConfig, IStreakConfig, DEFAULT_SCORING_CONFIG, DEFAULT_STREAK_CONFIG } from "../models/Pickem";
import { PICKEM_SEED_DATA } from "../config/pickems";
import logger from "../utils/logger";

class PickemService {
  /**
   * Seed pickems from config to database
   * Only creates pickems that don't already exist (by pickemId)
   */
  async seedPickems(): Promise<void> {
    logger.info("Seeding pickems from configuration...");

    for (const seedData of PICKEM_SEED_DATA) {
      try {
        const existing = await Pickem.findOne({ pickemId: seedData.pickemId });

        if (!existing) {
          await Pickem.create({
            pickemId: seedData.pickemId,
            name: seedData.name,
            raidIds: seedData.raidIds,
            votingStart: seedData.votingStart,
            votingEnd: seedData.votingEnd,
            active: seedData.active,
            scoringConfig: seedData.scoringConfig || DEFAULT_SCORING_CONFIG,
            streakConfig: seedData.streakConfig || DEFAULT_STREAK_CONFIG,
          });
          logger.info(`Created pickem: ${seedData.pickemId}`);
        } else {
          logger.debug(`Pickem already exists: ${seedData.pickemId}`);
        }
      } catch (error) {
        logger.error(`Error seeding pickem ${seedData.pickemId}:`, error);
      }
    }

    logger.info("Pickem seeding complete");
  }

  /**
   * Get all pickems
   */
  async getAllPickems(): Promise<IPickem[]> {
    return Pickem.find().sort({ votingStart: -1 }).lean();
  }

  /**
   * Get all active pickems
   */
  async getActivePickems(): Promise<IPickem[]> {
    return Pickem.find({ active: true }).sort({ votingStart: -1 }).lean();
  }

  /**
   * Get a specific pickem by ID
   */
  async getPickemById(pickemId: string): Promise<IPickem | null> {
    return Pickem.findOne({ pickemId }).lean();
  }

  /**
   * Create a new pickem
   */
  async createPickem(data: {
    pickemId: string;
    name: string;
    raidIds: number[];
    votingStart: Date;
    votingEnd: Date;
    active?: boolean;
    scoringConfig?: Partial<IScoringConfig>;
    streakConfig?: Partial<IStreakConfig>;
  }): Promise<IPickem> {
    const pickem = await Pickem.create({
      pickemId: data.pickemId,
      name: data.name,
      raidIds: data.raidIds,
      votingStart: data.votingStart,
      votingEnd: data.votingEnd,
      active: data.active ?? true,
      scoringConfig: { ...DEFAULT_SCORING_CONFIG, ...data.scoringConfig },
      streakConfig: { ...DEFAULT_STREAK_CONFIG, ...data.streakConfig },
    });

    return pickem.toObject();
  }

  /**
   * Update an existing pickem
   */
  async updatePickem(
    pickemId: string,
    data: {
      name?: string;
      raidIds?: number[];
      votingStart?: Date;
      votingEnd?: Date;
      active?: boolean;
      scoringConfig?: Partial<IScoringConfig>;
      streakConfig?: Partial<IStreakConfig>;
    }
  ): Promise<IPickem | null> {
    const pickem = await Pickem.findOne({ pickemId });
    if (!pickem) return null;

    if (data.name !== undefined) pickem.name = data.name;
    if (data.raidIds !== undefined) pickem.raidIds = data.raidIds;
    if (data.votingStart !== undefined) pickem.votingStart = data.votingStart;
    if (data.votingEnd !== undefined) pickem.votingEnd = data.votingEnd;
    if (data.active !== undefined) pickem.active = data.active;

    if (data.scoringConfig) {
      pickem.scoringConfig = {
        ...pickem.scoringConfig,
        ...data.scoringConfig,
      };
    }

    if (data.streakConfig) {
      pickem.streakConfig = {
        ...pickem.streakConfig,
        ...data.streakConfig,
      };
    }

    await pickem.save();
    return pickem.toObject();
  }

  /**
   * Delete a pickem
   */
  async deletePickem(pickemId: string): Promise<boolean> {
    const result = await Pickem.deleteOne({ pickemId });
    return result.deletedCount > 0;
  }

  /**
   * Get pickem statistics
   */
  async getPickemStats(): Promise<{
    total: number;
    active: number;
    votingOpen: number;
  }> {
    const now = new Date();

    const [total, active, votingOpen] = await Promise.all([
      Pickem.countDocuments(),
      Pickem.countDocuments({ active: true }),
      Pickem.countDocuments({
        active: true,
        votingStart: { $lte: now },
        votingEnd: { $gte: now },
      }),
    ]);

    return { total, active, votingOpen };
  }
}

export default new PickemService();
