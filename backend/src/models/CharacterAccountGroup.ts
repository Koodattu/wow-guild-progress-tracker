import mongoose, { Document, Schema } from "mongoose";

export interface ICharacterAccountGroupMember {
  characterId: mongoose.Types.ObjectId;
  name: string;
  realm: string;
  region: string;
  classID: number;
  guildName?: string | null;
  guildRealm?: string | null;
  lastMythicSeenAt?: Date | null;
}

export interface ICharacterAccountGroup extends Document {
  signalVersion: string;
  groupKey: string;
  characterIds: mongoose.Types.ObjectId[];
  members: ICharacterAccountGroupMember[];
  edgeCount: number;
  minScore: number;
  maxScore: number;
  avgScore: number;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CharacterAccountGroupMemberSchema = new Schema<ICharacterAccountGroupMember>(
  {
    characterId: { type: Schema.Types.ObjectId, ref: "Character", required: true },
    name: { type: String, required: true },
    realm: { type: String, required: true },
    region: { type: String, required: true },
    classID: { type: Number, required: true },
    guildName: { type: String, default: null },
    guildRealm: { type: String, default: null },
    lastMythicSeenAt: { type: Date, default: null },
  },
  { _id: false },
);

const CharacterAccountGroupSchema = new Schema<ICharacterAccountGroup>(
  {
    signalVersion: { type: String, required: true, index: true },
    groupKey: { type: String, required: true, index: true },
    characterIds: { type: [Schema.Types.ObjectId], ref: "Character", default: [], index: true },
    members: { type: [CharacterAccountGroupMemberSchema], default: [] },
    edgeCount: { type: Number, required: true, default: 0 },
    minScore: { type: Number, required: true, default: 0 },
    maxScore: { type: Number, required: true, default: 0 },
    avgScore: { type: Number, required: true, default: 0 },
    generatedAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true },
);

CharacterAccountGroupSchema.index({ signalVersion: 1, groupKey: 1 }, { unique: true });
CharacterAccountGroupSchema.index({ signalVersion: 1, characterIds: 1 });

export default mongoose.model<ICharacterAccountGroup>("CharacterAccountGroup", CharacterAccountGroupSchema);
