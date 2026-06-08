import mongoose, { Document, Schema } from "mongoose";

export interface IRateLimitState extends Document {
  key: string;
  pointsUsed: number;
  pointsMax: number;
  resetAt: Date;
  lastUpdated: Date;
  manualPause: boolean;
}

const RateLimitStateSchema = new Schema<IRateLimitState>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    pointsUsed: {
      type: Number,
      required: true,
      default: 0,
    },
    pointsMax: {
      type: Number,
      required: true,
      default: 3600,
    },
    resetAt: {
      type: Date,
      required: true,
    },
    lastUpdated: {
      type: Date,
      required: true,
      default: Date.now,
    },
    manualPause: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: false,
  },
);

const RateLimitState = mongoose.model<IRateLimitState>("RateLimitState", RateLimitStateSchema);
export default RateLimitState;
