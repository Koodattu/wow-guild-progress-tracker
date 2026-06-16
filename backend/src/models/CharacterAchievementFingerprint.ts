import mongoose, { Document, Schema } from "mongoose";

export interface ICharacterAchievementSignal {
  achievementId: number;
  completedTimestamp: number;
}

export interface ICharacterAchievementFingerprint extends Document {
  characterId: mongoose.Types.ObjectId;
  wclCanonicalCharacterId: number;
  name: string;
  realm: string;
  region: string;
  classID: number;
  signalVersion: string;
  achievementPoints: number;
  totalQuantity: number;
  signals: ICharacterAchievementSignal[];
  signalTokens: string[];
  signalCount: number;
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CharacterAchievementSignalSchema = new Schema<ICharacterAchievementSignal>(
  {
    achievementId: { type: Number, required: true },
    completedTimestamp: { type: Number, required: true },
  },
  { _id: false },
);

const CharacterAchievementFingerprintSchema = new Schema<ICharacterAchievementFingerprint>(
  {
    characterId: { type: Schema.Types.ObjectId, ref: "Character", required: true, index: true },
    wclCanonicalCharacterId: { type: Number, required: true, index: true },
    name: { type: String, required: true },
    realm: { type: String, required: true },
    region: { type: String, required: true },
    classID: { type: Number, required: true, index: true },
    signalVersion: { type: String, required: true, index: true },
    achievementPoints: { type: Number, required: true, default: 0 },
    totalQuantity: { type: Number, required: true, default: 0 },
    signals: { type: [CharacterAchievementSignalSchema], default: [] },
    signalTokens: { type: [String], default: [], index: true },
    signalCount: { type: Number, required: true, default: 0 },
    fetchedAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true },
);

CharacterAchievementFingerprintSchema.index({ characterId: 1, signalVersion: 1 }, { unique: true });
CharacterAchievementFingerprintSchema.index({ signalVersion: 1, signalTokens: 1 });
CharacterAchievementFingerprintSchema.index({ realm: 1, name: 1, region: 1, classID: 1 });

export default mongoose.model<ICharacterAchievementFingerprint>("CharacterAchievementFingerprint", CharacterAchievementFingerprintSchema);
