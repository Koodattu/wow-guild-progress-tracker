import mongoose, { Schema, Document } from "mongoose";

export interface IFight extends Document {
  reportCode: string; // WCL report code this fight belongs to
  guildId: mongoose.Types.ObjectId;
  fightId: number; // Fight ID within the report
  zoneId: number; // Raid zone ID
  encounterID: number; // Boss encounter ID
  encounterName: string; // Boss name
  difficulty: number; // Difficulty ID (3=Normal, 4=Heroic, 5=Mythic)
  isKill: boolean; // Whether the boss was killed
  bossPercentage: number; // Boss health percentage remaining (0 = kill, 100 = wipe at start)
  fightPercentage: number; // Overall fight progression percentage
  reportStartTime: number; // Report's start time (unix ms)
  reportEndTime: number; // Report's end time (unix ms)
  fightStartTime: number; // Fight start time relative to report start (ms)
  fightEndTime: number; // Fight end time relative to report start (ms)
  duration: number; // Fight duration in milliseconds (in-combat time)
  timestamp: Date; // Actual timestamp when the fight occurred
  createdAt: Date;
  updatedAt: Date;
}

const FightSchema: Schema = new Schema(
  {
    reportCode: { type: String, required: true, index: true },
    guildId: { type: Schema.Types.ObjectId, ref: "Guild", required: true, index: true },
    fightId: { type: Number, required: true },
    zoneId: { type: Number, required: true },
    encounterID: { type: Number, required: true, index: true },
    encounterName: { type: String, required: true },
    difficulty: { type: Number, required: true },
    isKill: { type: Boolean, default: false, index: true },
    bossPercentage: { type: Number, default: 0 },
    fightPercentage: { type: Number, default: 0 },
    reportStartTime: { type: Number, required: true },
    reportEndTime: { type: Number },
    fightStartTime: { type: Number, required: true },
    fightEndTime: { type: Number, required: true },
    duration: { type: Number, required: true },
    timestamp: { type: Date, required: true, index: true },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
FightSchema.index({ guildId: 1, zoneId: 1, difficulty: 1 });
FightSchema.index({ reportCode: 1, fightId: 1 }, { unique: true });
FightSchema.index({ encounterID: 1, difficulty: 1, isKill: 1 });
FightSchema.index({ guildId: 1, encounterID: 1, difficulty: 1, timestamp: 1 });

export default mongoose.model<IFight>("Fight", FightSchema);
