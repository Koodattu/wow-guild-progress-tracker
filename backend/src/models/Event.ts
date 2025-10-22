import mongoose, { Schema, Document } from "mongoose";

export interface IEvent extends Document {
  type: "boss_kill" | "best_pull" | "milestone";
  guildId: mongoose.Types.ObjectId;
  guildName: string;
  raidId: number;
  raidName: string;
  bossId: number;
  bossName: string;
  difficulty: "mythic" | "heroic";
  data: {
    killRank?: number; // What rank was this kill (e.g., 5th guild)
    pullCount?: number;
    bestPercent?: number;
    timeSpent?: number;
    progressDisplay?: string; // Phase-enhanced display string like "45% P3"
  };
  timestamp: Date;
  createdAt: Date;
}

const EventSchema: Schema = new Schema(
  {
    type: { type: String, enum: ["boss_kill", "best_pull", "milestone"], required: true },
    guildId: { type: Schema.Types.ObjectId, ref: "Guild", required: true },
    guildName: { type: String, required: true },
    raidId: { type: Number, required: true },
    raidName: { type: String, required: true },
    bossId: { type: Number, required: true },
    bossName: { type: String, required: true },
    difficulty: { type: String, enum: ["mythic", "heroic"], required: true },
    data: {
      killRank: { type: Number },
      pullCount: { type: Number },
      bestPercent: { type: Number },
      timeSpent: { type: Number },
      progressDisplay: { type: String },
    },
    timestamp: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
EventSchema.index({ timestamp: -1 });
EventSchema.index({ guildId: 1, timestamp: -1 });

export default mongoose.model<IEvent>("Event", EventSchema);
