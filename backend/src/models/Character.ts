import mongoose, { Schema, Document } from "mongoose";

export interface IAllStars {
  points: number;
  possiblePoints: number;
}

export interface ICharacter extends Document {
  wclCanonicalCharacterId: number;
  name: string;
  realm: string;
  region: string;
  classID: number;
  wclProfileHidden: boolean;

  lastMythicSeenAt: Date;
  rankingsAvailable: "unknown" | "true" | "false";
  nextEligibleRefreshAt?: Date;

  latestZoneId?: number;
  latestAllStars?: IAllStars;
  latestBestPerformanceAverage?: number;
  latestMedianPerformanceAverage?: number;

  createdAt: Date;
  updatedAt: Date;
}

const AllStarsSchema = new Schema(
  {
    points: { type: Number, required: true, default: 0 },
    possiblePoints: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const CharacterSchema: Schema = new Schema(
  {
    wclCanonicalCharacterId: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    realm: { type: String, required: true },
    region: { type: String, required: true },
    classID: { type: Number, required: true },
    wclProfileHidden: { type: Boolean, required: true, default: false },

    lastMythicSeenAt: { type: Date, required: true },
    rankingsAvailable: {
      type: String,
      enum: ["unknown", "true", "false"],
      required: true,
      default: "unknown",
    },
    nextEligibleRefreshAt: { type: Date, required: false },

    // Cached current-tier summary
    latestZoneId: { type: Number, required: false },
    latestAllStars: { type: AllStarsSchema, required: false },
    latestBestPerformanceAverage: { type: Number, required: false },
    latestMedianPerformanceAverage: { type: Number, required: false },
  },
  { timestamps: true },
);

CharacterSchema.index({ name: 1, realm: 1, region: 1 });

CharacterSchema.index({
  latestZoneId: 1,
  hidden: 1,
  "latestAllStars.points": -1,
});

export default mongoose.model<ICharacter>("Character", CharacterSchema);
