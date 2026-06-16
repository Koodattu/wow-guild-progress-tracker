import mongoose, { Document, Schema } from "mongoose";

export type CharacterAchievementFetchStatus = "pending" | "in_progress" | "completed" | "not_found" | "failed" | "skipped";

export interface ICharacterAchievementFetchQueue extends Document {
  characterId: mongoose.Types.ObjectId;
  wclCanonicalCharacterId: number;
  name: string;
  realm: string;
  region: string;
  classID: number;
  signalVersion: string;
  snapshotKey: string;
  status: CharacterAchievementFetchStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  httpStatus?: number | null;
  errorCode?: string | null;
  isPermanentError: boolean;
  completionReason?: string | null;
  lastError?: string | null;
  lastErrorAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CharacterAchievementFetchQueueSchema = new Schema<ICharacterAchievementFetchQueue>(
  {
    characterId: { type: Schema.Types.ObjectId, ref: "Character", required: true, index: true },
    wclCanonicalCharacterId: { type: Number, required: true, index: true },
    name: { type: String, required: true },
    realm: { type: String, required: true },
    region: { type: String, required: true },
    classID: { type: Number, required: true, index: true },
    signalVersion: { type: String, required: true, index: true },
    snapshotKey: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "not_found", "failed", "skipped"],
      required: true,
      default: "pending",
      index: true,
    },
    priority: { type: Number, required: true, default: 10, index: true },
    attempts: { type: Number, required: true, default: 0 },
    maxAttempts: { type: Number, required: true, default: 5 },
    nextAttemptAt: { type: Date, required: true, default: Date.now, index: true },
    httpStatus: { type: Number, default: null },
    errorCode: { type: String, default: null },
    isPermanentError: { type: Boolean, required: true, default: false },
    completionReason: { type: String, default: null },
    lastError: { type: String, default: null },
    lastErrorAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

CharacterAchievementFetchQueueSchema.index({ characterId: 1, signalVersion: 1 }, { unique: true });
CharacterAchievementFetchQueueSchema.index({ status: 1, nextAttemptAt: 1, priority: -1, createdAt: 1 });
CharacterAchievementFetchQueueSchema.index({ completedAt: -1 });
CharacterAchievementFetchQueueSchema.index({ lastErrorAt: -1 });

export default mongoose.model<ICharacterAchievementFetchQueue>("CharacterAchievementFetchQueue", CharacterAchievementFetchQueueSchema);
