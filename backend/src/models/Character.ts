import mongoose, { Schema, Document } from "mongoose";

export interface ICharacter extends Document {
  wclCanonicalCharacterId: number;
  name: string;
  realm: string;
  region: string;
  classID: number;
  guildId?: number;
  guildName?: string;
  guildRealm?: string;
  wclProfileHidden: boolean;

  lastMythicSeenAt: Date;
  rankingsAvailable: boolean | null;
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
    guildId: { type: Number, required: false, default: null },
    guildName: { type: String, required: false, default: null },
    guildRealm: { type: String, required: false, default: null },
    wclProfileHidden: { type: Boolean, required: true, default: false },

    lastMythicSeenAt: { type: Date, required: true },
    rankingsAvailable: { type: Boolean, required: false, default: null },
    nextEligibleRefreshAt: { type: Date, required: false, default: Date.now },
  },
  { timestamps: true },
);

CharacterSchema.index({ name: 1, realm: 1, region: 1 });
CharacterSchema.index({
  lastMythicSeenAt: -1,
  rankingsAvailable: 1,
  nextEligibleRefreshAt: 1,
});

export default mongoose.model<ICharacter>("Character", CharacterSchema);
