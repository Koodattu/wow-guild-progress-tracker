import mongoose, { Schema, Document } from "mongoose";

/**
 * Materialized leaderboard entry — one document per character per leaderboard view.
 *
 * A "leaderboard view" is defined by (zoneId, difficulty, type, encounterId, partition).
 * For AllStars views, encounterId is null.
 * For "best across all partitions" views, partition is null.
 *
 * The `score` field is the primary sort key:
 *  - Boss leaderboards: bestAmount
 *  - AllStars leaderboards: sum of best allStars.points per boss
 *
 * This collection is rebuilt entirely after each nightly rankings refresh.
 * At query time, all operations are simple indexed find/count — no aggregation needed.
 */

export interface IBossScore {
  encounterId: number;
  points: number;
  rankPercent: number;
  specName: string;
}

export interface ICharacterLeaderboard extends Document {
  // Leaderboard identification
  zoneId: number;
  difficulty: number;
  type: "boss" | "allstars";
  encounterId: number | null;
  partition: number | null;

  // Character identification
  characterId: mongoose.Types.ObjectId;
  wclCanonicalCharacterId: number;
  name: string;
  realm: string;
  region: string;
  classID: number;

  // Filter & display fields
  specName: string;
  bestSpecName: string;
  role: "dps" | "healer" | "tank";
  ilvl: number;

  // Primary sort key
  score: number;

  // Boss-specific stats
  encounterName: string;
  rankPercent: number;
  medianPercent: number;
  lockedIn: boolean;
  totalKills: number;
  bestAmount: number;

  // AllStars-specific stats
  allStarsPoints: number;
  allStarsPossiblePoints: number;
  bossScores: IBossScore[];

  // Denormalized guild info (avoids secondary lookup at query time)
  guildName: string | null;
  guildRealm: string | null;

  // Partition used (for display; differs from the view's `partition` when partition is null)
  sourcePartition: number;

  updatedAt: Date;
}

const BossScoreSchema = new Schema(
  {
    encounterId: { type: Number, required: true },
    points: { type: Number, required: true },
    rankPercent: { type: Number, required: true },
    specName: { type: String, required: true },
  },
  { _id: false },
);

const CharacterLeaderboardSchema: Schema = new Schema(
  {
    zoneId: { type: Number, required: true },
    difficulty: { type: Number, required: true },
    type: { type: String, enum: ["boss", "allstars"], required: true },
    encounterId: { type: Number, default: null },
    partition: { type: Number, default: null },

    characterId: { type: Schema.Types.ObjectId, ref: "Character", required: true },
    wclCanonicalCharacterId: { type: Number, required: true },
    name: { type: String, required: true },
    realm: { type: String, required: true },
    region: { type: String, required: true },
    classID: { type: Number, required: true },

    specName: { type: String, required: true },
    bestSpecName: { type: String, default: "" },
    role: { type: String, enum: ["dps", "healer", "tank"], required: true },
    ilvl: { type: Number, default: 0 },

    score: { type: Number, required: true },

    encounterName: { type: String, default: "" },
    rankPercent: { type: Number, default: 0 },
    medianPercent: { type: Number, default: 0 },
    lockedIn: { type: Boolean, default: false },
    totalKills: { type: Number, default: 0 },
    bestAmount: { type: Number, default: 0 },

    allStarsPoints: { type: Number, default: 0 },
    allStarsPossiblePoints: { type: Number, default: 0 },
    bossScores: { type: [BossScoreSchema], default: [] },

    guildName: { type: String, default: null },
    guildRealm: { type: String, default: null },

    sourcePartition: { type: Number, default: 0 },

    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// ── Unique constraint ──────────────────────────────────────────────
CharacterLeaderboardSchema.index({ zoneId: 1, difficulty: 1, type: 1, encounterId: 1, partition: 1, wclCanonicalCharacterId: 1 }, { unique: true });

// ── Primary leaderboard query (no optional filters) ────────────────
CharacterLeaderboardSchema.index({
  zoneId: 1,
  difficulty: 1,
  type: 1,
  encounterId: 1,
  partition: 1,
  score: -1,
});

// ── With class filter ──────────────────────────────────────────────
CharacterLeaderboardSchema.index({
  zoneId: 1,
  difficulty: 1,
  type: 1,
  encounterId: 1,
  partition: 1,
  classID: 1,
  score: -1,
});

// ── With class + spec filter ───────────────────────────────────────
CharacterLeaderboardSchema.index({
  zoneId: 1,
  difficulty: 1,
  type: 1,
  encounterId: 1,
  partition: 1,
  classID: 1,
  specName: 1,
  score: -1,
});

// ── With role filter ───────────────────────────────────────────────
CharacterLeaderboardSchema.index({
  zoneId: 1,
  difficulty: 1,
  type: 1,
  encounterId: 1,
  partition: 1,
  role: 1,
  score: -1,
});

// ── Name lookup (for exact-match search + partial-match filter) ────
CharacterLeaderboardSchema.index({
  zoneId: 1,
  difficulty: 1,
  type: 1,
  encounterId: 1,
  partition: 1,
  name: 1,
});

export default mongoose.model<ICharacterLeaderboard>("CharacterLeaderboard", CharacterLeaderboardSchema);
