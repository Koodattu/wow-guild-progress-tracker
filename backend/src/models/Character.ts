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
  hidden: boolean;

  lastSeenAt: Date;
  lastMythicSeenAt: Date;
  rankingsAvailable: "unknown" | "true" | "false";
  nextEligibleRefreshAt: Date;

  currentZoneId?: number;
  currentAllStars?: IAllStars;
  currentBestPerformanceAverage?: number;
  currentMedianPerformanceAverage?: number;
  currentZoneUpdatedAt?: Date;

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
    hidden: { type: Boolean, required: true, default: false },

    lastSeenAt: { type: Date, required: true },
    lastMythicSeenAt: { type: Date, required: true },
    rankingsAvailable: {
      type: String,
      enum: ["unknown", "true", "false"],
      required: true,
      default: "unknown",
    },
    nextEligibleRefreshAt: { type: Date, required: true },

    // Cached current-tier summary
    currentZoneId: { type: Number, required: false },
    currentAllStars: { type: AllStarsSchema, required: false },
    currentBestPerformanceAverage: { type: Number, required: false },
    currentMedianPerformanceAverage: { type: Number, required: false },
    currentZoneUpdatedAt: { type: Date, required: false },
  },
  { timestamps: true },
);

CharacterSchema.index({ name: 1, realm: 1, region: 1 }, { unique: true });

CharacterSchema.index({
  currentZoneId: 1,
  hidden: 1,
  "currentAllStars.points": -1,
});

export default mongoose.model<ICharacter>("Character", CharacterSchema);
