/**
 * Pickem seed data configuration
 * This file contains the default/seed data for pickems that will be synced to the database
 */

import { IScoringConfig, IStreakConfig, IPrizeConfig, DEFAULT_SCORING_CONFIG, DEFAULT_STREAK_CONFIG, DEFAULT_PRIZE_CONFIG, PickemType } from "../models/Pickem";

// Seed data for pickems - these will be synced to DB on startup
export interface PickemSeedData {
  pickemId: string;
  name: string;
  type?: PickemType; // "regular" (default) or "rwf"
  raidIds?: number[]; // Required for regular type, optional for rwf
  guildCount?: number; // Number of guilds to predict (defaults to 10 for regular, 5 for rwf)
  votingStart: Date;
  votingEnd: Date;
  active: boolean;
  scoringConfig?: IScoringConfig;
  streakConfig?: IStreakConfig;
  prizeConfig?: IPrizeConfig;
}

// Seed pickems - these are the initial pickems to create in the database
export const PICKEM_SEED_DATA: PickemSeedData[] = [
  {
    pickemId: "tww-s3",
    name: "TWW Season 3: Manaforge Omega",
    raidIds: [44],
    votingStart: new Date("2025-01-01T00:00:00Z"),
    votingEnd: new Date("2026-03-04T16:00:00Z"),
    active: true,
    scoringConfig: DEFAULT_SCORING_CONFIG,
    streakConfig: DEFAULT_STREAK_CONFIG,
  },
  {
    pickemId: "tww-s2",
    name: "TWW Season 2: Liberation of Undermine",
    raidIds: [42],
    votingStart: new Date("2025-01-01T00:00:00Z"),
    votingEnd: new Date("2026-03-04T16:00:00Z"),
    active: true,
    scoringConfig: DEFAULT_SCORING_CONFIG,
    streakConfig: DEFAULT_STREAK_CONFIG,
  },
  {
    pickemId: "tww-all",
    name: "TWW All Raids: Nerubar Palace + Liberation of Undermine + Manaforge Omega",
    raidIds: [38, 42, 44],
    votingStart: new Date("2024-01-01T00:00:00Z"),
    votingEnd: new Date("2025-03-04T16:00:00Z"),
    active: true,
    scoringConfig: DEFAULT_SCORING_CONFIG,
    streakConfig: DEFAULT_STREAK_CONFIG,
  },
];

// Re-export default configs for convenience
export { DEFAULT_SCORING_CONFIG, DEFAULT_STREAK_CONFIG };
