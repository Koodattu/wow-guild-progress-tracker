import mongoose, { Schema, Document } from "mongoose";

export type CharacterRankingBackfillStatus = "pending" | "in_progress" | "completed" | "skipped" | "failed";

export interface ICharacterRankingBackfillEvidence {
  appearanceCount: number;
  reportCount: number;
  mythicFightCount: number;
  mythicKillCount: number;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
}

export interface ICharacterRankingBackfill extends Document {
  characterId: mongoose.Types.ObjectId;
  wclCanonicalCharacterId: number;
  name: string;
  realm: string;
  region: string;
  classID: number;

  zoneId: number;
  raidName?: string | null;
  observedSpecNames: string[];

  status: CharacterRankingBackfillStatus;
  priority: number;
  source: "report_rankings_mythic";

  evidence: ICharacterRankingBackfillEvidence;

  attempts: number;
  maxAttempts: number;
  aliasesQueried: number;
  specQuerySource?: "observed" | "fallback" | null;
  specsQueried: string[];
  rankingsWritten: number;
  leaderboardEntriesWritten: number;
  completionReason?: string | null;

  lastError?: string | null;
  lastErrorAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  lastActivityAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const CharacterRankingBackfillEvidenceSchema = new Schema<ICharacterRankingBackfillEvidence>(
  {
    appearanceCount: { type: Number, required: true, default: 0 },
    reportCount: { type: Number, required: true, default: 0 },
    mythicFightCount: { type: Number, required: true, default: 0 },
    mythicKillCount: { type: Number, required: true, default: 0 },
    firstSeenAt: { type: Date },
    lastSeenAt: { type: Date },
  },
  { _id: false },
);

const CharacterRankingBackfillSchema = new Schema<ICharacterRankingBackfill>(
  {
    characterId: { type: Schema.Types.ObjectId, ref: "Character", required: true, index: true },
    wclCanonicalCharacterId: { type: Number, required: true, index: true },
    name: { type: String, required: true },
    realm: { type: String, required: true },
    region: { type: String, required: true },
    classID: { type: Number, required: true, index: true },

    zoneId: { type: Number, required: true, index: true },
    raidName: { type: String, default: null },
    observedSpecNames: { type: [String], default: [] },

    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "skipped", "failed"],
      required: true,
      default: "pending",
      index: true,
    },
    priority: { type: Number, required: true, default: 20, index: true },
    source: { type: String, enum: ["report_rankings_mythic"], required: true, default: "report_rankings_mythic" },

    evidence: {
      type: CharacterRankingBackfillEvidenceSchema,
      required: true,
      default: () => ({}),
    },

    attempts: { type: Number, required: true, default: 0 },
    maxAttempts: { type: Number, required: true, default: 3 },
    aliasesQueried: { type: Number, required: true, default: 0 },
    specQuerySource: { type: String, enum: ["observed", "fallback"], default: null },
    specsQueried: { type: [String], default: [] },
    rankingsWritten: { type: Number, required: true, default: 0 },
    leaderboardEntriesWritten: { type: Number, required: true, default: 0 },
    completionReason: { type: String, default: null },

    lastError: { type: String, default: null },
    lastErrorAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

CharacterRankingBackfillSchema.index(
  {
    wclCanonicalCharacterId: 1,
    classID: 1,
    zoneId: 1,
  },
  { unique: true },
);

CharacterRankingBackfillSchema.index({ status: 1, priority: 1, createdAt: 1 });
CharacterRankingBackfillSchema.index({ completedAt: -1 });
CharacterRankingBackfillSchema.index({ lastErrorAt: -1 });

export default mongoose.model<ICharacterRankingBackfill>("CharacterRankingBackfill", CharacterRankingBackfillSchema);
