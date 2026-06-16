import mongoose, { Document, Schema } from "mongoose";

export interface ICharacterAchievementToken extends Document {
  signalVersion: string;
  token: string;
  achievementId: number;
  completedTimestamp: number;
  characterIds: mongoose.Types.ObjectId[];
  characterCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const CharacterAchievementTokenSchema = new Schema<ICharacterAchievementToken>(
  {
    signalVersion: { type: String, required: true, index: true },
    token: { type: String, required: true, index: true },
    achievementId: { type: Number, required: true, index: true },
    completedTimestamp: { type: Number, required: true },
    characterIds: { type: [Schema.Types.ObjectId], ref: "Character", default: [], index: true },
    characterCount: { type: Number, required: true, default: 0, index: true },
  },
  { timestamps: true },
);

CharacterAchievementTokenSchema.index({ signalVersion: 1, token: 1 }, { unique: true });
CharacterAchievementTokenSchema.index({ signalVersion: 1, characterCount: 1 });

export default mongoose.model<ICharacterAchievementToken>("CharacterAchievementToken", CharacterAchievementTokenSchema);
