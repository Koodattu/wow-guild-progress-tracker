import mongoose, { Schema, Document } from "mongoose";

export interface IBossProgress {
  bossId: number;
  bossName: string;
  kills: number;
  bestPercent: number; // Best pull: lowest boss health % reached (0 = kill, 100 = no progress)
  bestPhase?: number; // Best phase reached (for multi-phase bosses)
  pullCount: number;
  timeSpent: number; // in seconds
  firstKillTime?: Date;
  firstKillReportCode?: string; // WCL report code for first kill (e.g., "a:1234567890")
  firstKillFightId?: number; // Fight ID within the report for first kill
  killOrder?: number; // Order in which this boss was first killed (1 = first boss killed, 2 = second, etc.)
  lastUpdated: Date;
}

export interface IRaidProgress {
  raidId: number;
  raidName: string;
  difficulty: "mythic" | "heroic";
  bossesDefeated: number;
  totalBosses: number;
  totalTimeSpent: number; // in seconds
  bosses: IBossProgress[];
  lastUpdated: Date;
}

export interface IGuild extends Document {
  name: string;
  realm: string;
  region: string;
  faction?: string;
  iconUrl?: string;
  progress: IRaidProgress[];
  isCurrentlyRaiding: boolean;
  lastFetched?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BossProgressSchema: Schema = new Schema(
  {
    bossId: { type: Number, required: true },
    bossName: { type: String, required: true },
    kills: { type: Number, default: 0 },
    bestPercent: { type: Number, default: 100 }, // Default 100 = worst (full health), track lowest (best)
    bestPhase: { type: Number },
    pullCount: { type: Number, default: 0 },
    timeSpent: { type: Number, default: 0 },
    firstKillTime: { type: Date },
    firstKillReportCode: { type: String },
    firstKillFightId: { type: Number },
    killOrder: { type: Number },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

const RaidProgressSchema: Schema = new Schema(
  {
    raidId: { type: Number, required: true },
    raidName: { type: String, required: true },
    difficulty: { type: String, enum: ["mythic", "heroic"], required: true },
    bossesDefeated: { type: Number, default: 0 },
    totalBosses: { type: Number, required: true },
    totalTimeSpent: { type: Number, default: 0 },
    bosses: [BossProgressSchema],
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

const GuildSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    realm: { type: String, required: true },
    region: { type: String, required: true, default: "EU" },
    faction: { type: String },
    iconUrl: { type: String },
    progress: [RaidProgressSchema],
    isCurrentlyRaiding: { type: Boolean, default: false },
    lastFetched: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Compound index for guild lookup
GuildSchema.index({ name: 1, realm: 1, region: 1 }, { unique: true });

export default mongoose.model<IGuild>("Guild", GuildSchema);
