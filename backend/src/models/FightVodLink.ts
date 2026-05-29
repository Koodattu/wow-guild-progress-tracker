import mongoose, { Schema, Document } from "mongoose";

export type FightVodLinkStatus = "pending" | "resolved" | "unavailable";
export type FightVodLinkMatchMethod = "stream-id" | "vod-window";
export type FightVodAvailabilityStatus = "active" | "unavailable";

export interface IFightVodLink extends Document {
  guildId: mongoose.Types.ObjectId;
  raidId: number;
  bossId: number;
  bossName: string;
  difficulty: "mythic" | "heroic";
  reportCode: string;
  fightId: number;
  fightStartedAt: Date;
  channelName: string;
  twitchUserId: string;
  streamId: string;
  streamStartedAt: Date;
  videoId?: string;
  vodUrl?: string;
  offsetSeconds?: number;
  status: FightVodLinkStatus;
  matchMethod?: FightVodLinkMatchMethod;
  matchConfidence?: number;
  videoCreatedAt?: Date;
  videoDurationSeconds?: number;
  backfilledAt?: Date;
  availabilityStatus?: FightVodAvailabilityStatus;
  expectedExpiresAt?: Date;
  hardExpiresAt?: Date;
  nextAvailabilityCheckAt?: Date;
  lastAvailabilityCheckedAt?: Date;
  attempts: number;
  lastCheckedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FightVodLinkSchema = new Schema(
  {
    guildId: { type: Schema.Types.ObjectId, ref: "Guild", required: true },
    raidId: { type: Number, required: true },
    bossId: { type: Number, required: true },
    bossName: { type: String, required: true },
    difficulty: { type: String, enum: ["mythic", "heroic"], required: true },
    reportCode: { type: String, required: true },
    fightId: { type: Number, required: true },
    fightStartedAt: { type: Date, required: true },
    channelName: { type: String, required: true },
    twitchUserId: { type: String, required: true },
    streamId: { type: String, required: true },
    streamStartedAt: { type: Date, required: true },
    videoId: { type: String },
    vodUrl: { type: String },
    offsetSeconds: { type: Number },
    status: { type: String, enum: ["pending", "resolved", "unavailable"], required: true, default: "pending" },
    matchMethod: { type: String, enum: ["stream-id", "vod-window"] },
    matchConfidence: { type: Number },
    videoCreatedAt: { type: Date },
    videoDurationSeconds: { type: Number },
    backfilledAt: { type: Date },
    availabilityStatus: { type: String, enum: ["active", "unavailable"], default: "active" },
    expectedExpiresAt: { type: Date },
    hardExpiresAt: { type: Date },
    nextAvailabilityCheckAt: { type: Date },
    lastAvailabilityCheckedAt: { type: Date },
    attempts: { type: Number, required: true, default: 0 },
    lastCheckedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  },
);

FightVodLinkSchema.index({ reportCode: 1, fightId: 1, channelName: 1 }, { unique: true });
FightVodLinkSchema.index({ status: 1, expiresAt: 1, lastCheckedAt: 1 });
FightVodLinkSchema.index({ reportCode: 1, fightId: 1, status: 1 });
FightVodLinkSchema.index({ expiresAt: 1 });
FightVodLinkSchema.index({ availabilityStatus: 1, nextAvailabilityCheckAt: 1 });
FightVodLinkSchema.index({ hardExpiresAt: 1 });

export default mongoose.model<IFightVodLink>("FightVodLink", FightVodLinkSchema);
