import mongoose, { Schema, Document } from "mongoose";

export interface ICharacterRaidParticipation extends Document {
  characterId: mongoose.Types.ObjectId;
  wclCanonicalCharacterId: number;
  zoneId: number;
  reportGuildId: mongoose.Types.ObjectId;
  reportGuildName: string;
  reportGuildRealm: string;
  characterName: string;
  characterRealm: string;
  characterRegion: string;
  classID: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  reportCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const CharacterRaidParticipationSchema = new Schema<ICharacterRaidParticipation>(
  {
    characterId: { type: Schema.Types.ObjectId, ref: "Character", required: true, index: true },
    wclCanonicalCharacterId: { type: Number, required: true, index: true },
    zoneId: { type: Number, required: true, index: true },
    reportGuildId: { type: Schema.Types.ObjectId, ref: "Guild", required: true, index: true },
    reportGuildName: { type: String, required: true },
    reportGuildRealm: { type: String, required: true },
    characterName: { type: String, required: true },
    characterRealm: { type: String, required: true },
    characterRegion: { type: String, required: true },
    classID: { type: Number, required: true },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    reportCount: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

CharacterRaidParticipationSchema.index({ reportGuildId: 1, zoneId: 1, characterRealm: 1, characterName: 1, classID: 1 });
CharacterRaidParticipationSchema.index({ characterRealm: 1, characterName: 1, classID: 1 });
CharacterRaidParticipationSchema.index(
  {
    wclCanonicalCharacterId: 1,
    zoneId: 1,
    reportGuildId: 1,
    characterName: 1,
    characterRealm: 1,
    characterRegion: 1,
    classID: 1,
  },
  { unique: true },
);

export default mongoose.model<ICharacterRaidParticipation>("CharacterRaidParticipation", CharacterRaidParticipationSchema);
