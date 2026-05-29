import mongoose, { Schema, Document } from "mongoose";

export type TwitchBroadcasterType = "partner" | "affiliate" | "";
export type TwitchVodRetentionSource = "partner" | "affiliate-default" | "normal-default" | "observed-extended" | "manual";

export interface ITwitchVodProfile extends Document {
  twitchUserId: string;
  channelName: string;
  broadcasterType: TwitchBroadcasterType;
  expectedVodRetentionDays: number;
  retentionSource: TwitchVodRetentionSource;
  retentionObservedAt?: Date;
  oldestArchiveCreatedAt?: Date;
  lastArchiveCheckedAt?: Date;
  nextRetentionRefreshAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TwitchVodProfileSchema = new Schema(
  {
    twitchUserId: { type: String, required: true, unique: true },
    channelName: { type: String, required: true, index: true },
    broadcasterType: { type: String, enum: ["partner", "affiliate", ""], default: "" },
    expectedVodRetentionDays: { type: Number, required: true },
    retentionSource: { type: String, enum: ["partner", "affiliate-default", "normal-default", "observed-extended", "manual"], required: true },
    retentionObservedAt: { type: Date },
    oldestArchiveCreatedAt: { type: Date },
    lastArchiveCheckedAt: { type: Date },
    nextRetentionRefreshAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

TwitchVodProfileSchema.index({ nextRetentionRefreshAt: 1 });

export default mongoose.model<ITwitchVodProfile>("TwitchVodProfile", TwitchVodProfileSchema);
