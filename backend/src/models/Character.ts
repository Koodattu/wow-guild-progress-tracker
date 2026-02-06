import mongoose, { Schema, Document } from "mongoose";

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

  createdAt: Date;
  updatedAt: Date;
}

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
  },
  { timestamps: true },
);

CharacterSchema.index({ name: 1, realm: 1, region: 1 });

export default mongoose.model<ICharacter>("Character", CharacterSchema);
