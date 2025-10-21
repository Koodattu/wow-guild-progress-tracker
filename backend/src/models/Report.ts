import mongoose, { Schema, Document } from "mongoose";

export interface IReport extends Document {
  code: string; // WCL report code (unique)
  guildId: mongoose.Types.ObjectId;
  zoneId: number;
  startTime: number; // Unix timestamp
  endTime?: number; // Unix timestamp, undefined if ongoing
  isOngoing: boolean;
  fightCount: number;
  encounterFights: {
    // Quick summary of fights by encounter
    [encounterID: number]: {
      total: number;
      kills: number;
      wipes: number;
    };
  };
  lastProcessed: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema: Schema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    guildId: { type: Schema.Types.ObjectId, ref: "Guild", required: true },
    zoneId: { type: Number, required: true },
    startTime: { type: Number, required: true },
    endTime: { type: Number },
    isOngoing: { type: Boolean, default: false },
    fightCount: { type: Number, default: 0 },
    encounterFights: { type: Map, of: Object, default: new Map() },
    lastProcessed: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient lookups
ReportSchema.index({ guildId: 1, zoneId: 1, startTime: -1 });
ReportSchema.index({ code: 1 }, { unique: true });
ReportSchema.index({ isOngoing: 1 });

export default mongoose.model<IReport>("Report", ReportSchema);
