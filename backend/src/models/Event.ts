import mongoose, { Schema, Document } from "mongoose";
import { IGuildCrest } from "./Guild";

export type EventType = "boss_kill" | "best_pull" | "milestone" | "hiatus" | "regress" | "reproge";

export interface IEvent extends Document {
  type: EventType;
  guildId: mongoose.Types.ObjectId;
  guildName: string;
  guildRealm?: string; // Guild realm at time of event creation (for profile links)
  guildCrest?: IGuildCrest; // Guild crest at time of event creation
  raidId: number;
  raidName: string;
  bossId?: number; // Optional for guild-level events like hiatus
  bossName?: string; // Optional for guild-level events like hiatus
  bossIconUrl?: string; // Boss icon filename (e.g., "achievement_boss_blackhand.jpg")
  difficulty: "mythic" | "heroic";
  data: {
    killRank?: number; // What rank was this kill (e.g., 5th guild)
    pullCount?: number;
    bestPercent?: number;
    timeSpent?: number;
    progressDisplay?: string; // Phase-enhanced display string like "45% P3"
    hiatusDays?: number; // Days since last raid activity (7, 14, 30)
  };
  timestamp: Date;
  createdAt: Date;
}

const EventSchema: Schema = new Schema(
  {
    type: { type: String, enum: ["boss_kill", "best_pull", "milestone", "hiatus", "regress", "reproge"], required: true },
    guildId: { type: Schema.Types.ObjectId, ref: "Guild", required: true },
    guildName: { type: String, required: true },
    guildRealm: { type: String },
    guildCrest: {
      emblem: {
        id: { type: Number },
        imageName: { type: String },
        color: {
          r: { type: Number },
          g: { type: Number },
          b: { type: Number },
          a: { type: Number },
        },
      },
      border: {
        id: { type: Number },
        imageName: { type: String },
        color: {
          r: { type: Number },
          g: { type: Number },
          b: { type: Number },
          a: { type: Number },
        },
      },
      background: {
        color: {
          r: { type: Number },
          g: { type: Number },
          b: { type: Number },
          a: { type: Number },
        },
      },
    },
    raidId: { type: Number, required: true },
    raidName: { type: String, required: true },
    bossId: { type: Number },
    bossName: { type: String },
    bossIconUrl: { type: String },
    difficulty: { type: String, enum: ["mythic", "heroic"], required: true },
    data: {
      killRank: { type: Number },
      pullCount: { type: Number },
      bestPercent: { type: Number },
      timeSpent: { type: Number },
      progressDisplay: { type: String },
      hiatusDays: { type: Number },
    },
    timestamp: { type: Date, required: true },
  },
  {
    timestamps: true,
  },
);

// Index for efficient querying
EventSchema.index({ timestamp: -1 });
EventSchema.index({ guildId: 1, timestamp: -1 });
// Index for deduplication of hiatus events
EventSchema.index({ guildId: 1, raidId: 1, type: 1, "data.hiatusDays": 1 });

export default mongoose.model<IEvent>("Event", EventSchema);
