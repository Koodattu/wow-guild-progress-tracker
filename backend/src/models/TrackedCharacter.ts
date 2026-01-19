import mongoose, { Schema, Document } from "mongoose";

export interface IAllStars {
  points: number;
  possiblePoints: number;
}

export interface IRanking {
  encounter: {
    id: number;
    name: string;
  };
  rankPercent: number;
  medianPercent: number;
  lockedIn: boolean;
  totalKills: number;
  allStars: IAllStars;
  spec: string;
  bestSpec: string;
  bestAmount: number;
}

export interface IZoneRanking {
  zoneId: number;
  bestPerformanceAverage: number;
  medianPerformanceAverage: number;
  allStars: IAllStars;
}

export interface ITrackedCharacter extends Document {
  warcraftlogsId: string; // WarcraftLogs canonicalID
  name: string;
  realm: string;
  region: string;
  classID: number;
  hidden: boolean;
  zoneRanking?: IZoneRanking;
  rankings?: IRanking[];
  lastSeenAt: Date;
  lastMythicSeenAt: Date;
  rankingsAvailable: "unknown" | "true" | "false";
  nextEligibleRefreshAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RankingSchema: Schema = new Schema({
  encounter: {
    id: { type: Number, required: true },
    name: { type: String, required: true },
  },
  rankPercent: { type: Number, required: true },
  medianPercent: { type: Number, required: true },
  lockedIn: { type: Boolean, required: true },
  totalKills: { type: Number, required: true },
  allStars: {
    points: { type: Number, required: true },
    possiblePoints: { type: Number, required: true },
  },
  spec: { type: String, required: true },
  bestSpec: { type: String, required: true },
  bestAmount: { type: Number, required: true },
});

const ZoneRankingSchema: Schema = new Schema({
  zoneId: { type: Number, required: true },
  bestPerformanceAverage: { type: Number, required: true },
  medianPerformanceAverage: { type: Number, required: true },
  allStars: {
    points: { type: Number, required: true },
    possiblePoints: { type: Number, required: true },
  },
});

const TrackedCharacterSchema: Schema = new Schema(
  {
    warcraftlogsId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    realm: { type: String, required: true },
    region: { type: String, required: true },
    classID: { type: Number, required: true },
    hidden: { type: Boolean, required: false, default: false },
    zoneRanking: { type: ZoneRankingSchema, required: false },
    rankings: { type: [RankingSchema], required: false },
    lastSeenAt: { type: Date, required: true },
    lastMythicSeenAt: { type: Date, required: true },
    rankingsAvailable: {
      type: String,
      enum: ["unknown", "true", "false"],
      required: true,
      default: "unknown",
    },
    nextEligibleRefreshAt: { type: Date, required: true },
  },
  { timestamps: true },
);

TrackedCharacterSchema.index(
  { name: 1, realm: 1, region: 1 },
  { unique: true },
);

export default mongoose.model<ITrackedCharacter>(
  "TrackedCharacter",
  TrackedCharacterSchema,
);
