import mongoose, { Schema, Document } from "mongoose";

export interface RegionDates {
  us?: Date;
  eu?: Date;
  tw?: Date;
  kr?: Date;
  cn?: Date;
}

export interface IRaid extends Document {
  id: number;
  name: string;
  slug: string;
  expansion: string;
  iconUrl?: string;
  partitions?: {
    id: number;
    name: string;
    compactName: string;
    default: boolean;
  }[];
  starts?: RegionDates;
  ends?: RegionDates;
  bosses: {
    id: number;
    name: string;
    slug: string;
    iconUrl?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const RaidSchema: Schema = new Schema(
  {
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    expansion: { type: String, required: true },
    iconUrl: { type: String },
    partitions: [
      {
        id: { type: Number, required: true },
        name: { type: String, required: true },
        compactName: { type: String, required: true },
        default: { type: Boolean, required: true, default: false },
      },
    ],
    starts: {
      us: { type: Date },
      eu: { type: Date },
      tw: { type: Date },
      kr: { type: Date },
      cn: { type: Date },
    },
    ends: {
      us: { type: Date },
      eu: { type: Date },
      tw: { type: Date },
      kr: { type: Date },
      cn: { type: Date },
    },
    bosses: [
      {
        id: { type: Number, required: true },
        name: { type: String, required: true },
        slug: { type: String, required: true },
        iconUrl: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IRaid>("Raid", RaidSchema);
