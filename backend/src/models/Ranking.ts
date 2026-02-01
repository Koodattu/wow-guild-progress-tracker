import mongoose, { Schema, Document } from "mongoose";

export interface IAllStars {
  points: number;
  possiblePoints: number;
}

export interface IRanking extends Document {
  characterId: mongoose.Types.ObjectId; // mongoose ObjectId reference to Character
  wclCanonicalCharacterId: number; // WCL canonicalID for the character ranking belongs to

  // character info (easier querying)
  name: string;
  realm: string;
  region: string;
  classID: number;

  zoneId: number;
  difficulty: number;
  metric: "dps" | "hps";
  encounter: {
    id: number;
    name: string;
  };
  specName: string;
  role: "dps" | "healer" | "tank";
  bestSpecName: string;

  rankPercent: number;
  medianPercent: number;
  lockedIn: boolean;
  totalKills: number;
  bestAmount: number;
  allStars: IAllStars;

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

const RankingSchema: Schema = new Schema(
  {
    characterId: {
      type: Schema.Types.ObjectId,
      ref: "Character",
      required: true,
      index: true,
    },
    wclCanonicalCharacterId: { type: Number, required: true, index: true },

    name: { type: String, required: true },
    realm: { type: String, required: true },
    region: { type: String, required: true },
    classID: { type: Number, required: true },

    zoneId: { type: Number, required: true, index: true },
    difficulty: { type: Number, required: true, default: 5, index: true },
    metric: {
      type: String,
      enum: ["dps", "hps"],
      required: true,
      default: "dps",
      index: true,
    },

    encounter: {
      id: { type: Number, required: true },
      name: { type: String, required: true },
    },

    specName: { type: String, required: true },
    bestSpecName: { type: String, required: true },
    role: {
      type: String,
      enum: ["dps", "healer", "tank"],
      required: true,
      index: true,
    },

    rankPercent: { type: Number, required: true, default: 0 },
    medianPercent: { type: Number, required: true, default: 0 },
    lockedIn: { type: Boolean, required: true, default: false },
    totalKills: { type: Number, required: true, default: 0 },
    bestAmount: { type: Number, required: true, default: 0 },

    allStars: { type: AllStarsSchema, required: true, default: () => ({}) },
  },
  { timestamps: true },
);

RankingSchema.index(
  {
    characterId: 1,
    zoneId: 1,
    difficulty: 1,
    metric: 1,
    "encounter.id": 1,
    specName: 1,
  },
  { unique: true },
);

// Spec leaderboard within a tier
RankingSchema.index({
  zoneId: 1,
  difficulty: 1,
  metric: 1,
  classID: 1,
  specName: 1,
  rankPercent: -1,
  wclCanonicalCharacterId: 1,
});

// Boss+spec leaderboard
RankingSchema.index({
  zoneId: 1,
  difficulty: 1,
  metric: 1,
  "encounter.id": 1,
  classID: 1,
  specName: 1,
  rankPercent: -1,
  wclCanonicalCharacterId: 1,
});

// Boss+role leaderboard
RankingSchema.index({
  zoneId: 1,
  difficulty: 1,
  metric: 1,
  "encounter.id": 1,
  role: 1,
  rankPercent: -1,
});

export default mongoose.model<IRanking>("Ranking", RankingSchema);
