import mongoose, { Schema, Document } from "mongoose";

export interface ICharacterReportGuildSnapshot {
  name: string;
  realm: string;
  region: string;
}

export interface ICharacterReportAppearance extends Document {
  characterId: mongoose.Types.ObjectId;
  wclCanonicalCharacterId: number;
  reportCode: string;
  reportStartTime: Date;
  reportGuildId: mongoose.Types.ObjectId;
  reportGuildName: string;
  reportGuildRealm: string;
  characterName: string;
  characterRealm: string;
  characterRegion: string;
  classID: number;
  hidden: boolean;
  wclGuilds: ICharacterReportGuildSnapshot[];
  createdAt: Date;
  updatedAt: Date;
}

const CharacterReportGuildSnapshotSchema = new Schema<ICharacterReportGuildSnapshot>(
  {
    name: { type: String, required: true },
    realm: { type: String, required: true },
    region: { type: String, required: true },
  },
  { _id: false },
);

const CharacterReportAppearanceSchema = new Schema<ICharacterReportAppearance>(
  {
    characterId: { type: Schema.Types.ObjectId, ref: "Character", required: true, index: true },
    wclCanonicalCharacterId: { type: Number, required: true, index: true },
    reportCode: { type: String, required: true, index: true },
    reportStartTime: { type: Date, required: true, index: true },
    reportGuildId: { type: Schema.Types.ObjectId, ref: "Guild", required: true, index: true },
    reportGuildName: { type: String, required: true },
    reportGuildRealm: { type: String, required: true },
    characterName: { type: String, required: true },
    characterRealm: { type: String, required: true },
    characterRegion: { type: String, required: true },
    classID: { type: Number, required: true },
    hidden: { type: Boolean, required: true, default: false },
    wclGuilds: { type: [CharacterReportGuildSnapshotSchema], default: [] },
  },
  { timestamps: true },
);

CharacterReportAppearanceSchema.index({ reportCode: 1, wclCanonicalCharacterId: 1 }, { unique: true });
CharacterReportAppearanceSchema.index({ wclCanonicalCharacterId: 1, reportStartTime: 1 });
CharacterReportAppearanceSchema.index({ reportGuildId: 1, reportStartTime: 1 });

export default mongoose.model<ICharacterReportAppearance>("CharacterReportAppearance", CharacterReportAppearanceSchema);
