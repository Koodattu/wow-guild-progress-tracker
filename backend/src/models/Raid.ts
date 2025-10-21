import mongoose, { Schema, Document } from "mongoose";

export interface IRaid extends Document {
  id: number;
  name: string;
  slug: string;
  expansion: string;
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
  }
);

export default mongoose.model<IRaid>("Raid", RaidSchema);
