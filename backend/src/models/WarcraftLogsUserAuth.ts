import mongoose, { Schema, Document } from "mongoose";

export interface IWarcraftLogsUserAuth extends Document {
  key: string;
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  scope?: string;
  tokenExpiresAt: Date;
  connectedAt: Date;
  connectedByUserId?: mongoose.Types.ObjectId;
  connectedByUsername?: string;
  wclUserId?: number;
  wclUserName?: string;
  lastRefreshAt?: Date;
  lastRefreshError?: string;
  lastVerifiedAt?: Date;
  lastVerifiedError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WarcraftLogsUserAuthSchema = new Schema<IWarcraftLogsUserAuth>(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    tokenType: { type: String },
    scope: { type: String },
    tokenExpiresAt: { type: Date, required: true },
    connectedAt: { type: Date, required: true, default: Date.now },
    connectedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    connectedByUsername: { type: String },
    wclUserId: { type: Number },
    wclUserName: { type: String },
    lastRefreshAt: { type: Date },
    lastRefreshError: { type: String },
    lastVerifiedAt: { type: Date },
    lastVerifiedError: { type: String },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IWarcraftLogsUserAuth>("WarcraftLogsUserAuth", WarcraftLogsUserAuthSchema);
