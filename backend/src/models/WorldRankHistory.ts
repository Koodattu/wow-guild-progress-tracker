import mongoose, { Schema, Document } from "mongoose";

export interface IWorldRankHistory extends Document {
  guildId: mongoose.Types.ObjectId;
  raidId: number;
  worldRank: number;
  wclWorldRank?: number;
  rioWorldRank?: number;
  recordedAt: Date;
}

const WorldRankHistorySchema: Schema = new Schema(
  {
    guildId: { type: Schema.Types.ObjectId, ref: "Guild", required: true },
    raidId: { type: Number, required: true },
    worldRank: { type: Number, required: true },
    wclWorldRank: { type: Number },
    rioWorldRank: { type: Number },
    recordedAt: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: false, // We use recordedAt instead
  },
);

// Compound index for efficient queries: find all history for a guild+raid, ordered by time
WorldRankHistorySchema.index({ guildId: 1, raidId: 1, recordedAt: 1 });

export default mongoose.model<IWorldRankHistory>("WorldRankHistory", WorldRankHistorySchema);
