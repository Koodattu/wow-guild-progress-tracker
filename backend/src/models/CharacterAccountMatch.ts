import mongoose, { Document, Schema } from "mongoose";

export type CharacterAccountMatchConfidence = "high" | "medium";

export interface ICharacterAccountMatch extends Document {
  signalVersion: string;
  characterAId: mongoose.Types.ObjectId;
  characterBId: mongoose.Types.ObjectId;
  score: number;
  confidence: CharacterAccountMatchConfidence;
  exactTokenMatches: number;
  comparableSignals: number;
  exactRate: number;
  matchedTokenSamples: string[];
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CharacterAccountMatchSchema = new Schema<ICharacterAccountMatch>(
  {
    signalVersion: { type: String, required: true, index: true },
    characterAId: { type: Schema.Types.ObjectId, ref: "Character", required: true, index: true },
    characterBId: { type: Schema.Types.ObjectId, ref: "Character", required: true, index: true },
    score: { type: Number, required: true, default: 0 },
    confidence: { type: String, enum: ["high", "medium"], required: true, index: true },
    exactTokenMatches: { type: Number, required: true, default: 0 },
    comparableSignals: { type: Number, required: true, default: 0 },
    exactRate: { type: Number, required: true, default: 0 },
    matchedTokenSamples: { type: [String], default: [] },
    evaluatedAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true },
);

CharacterAccountMatchSchema.index({ signalVersion: 1, characterAId: 1, characterBId: 1 }, { unique: true });
CharacterAccountMatchSchema.index({ signalVersion: 1, confidence: 1, score: -1 });

export default mongoose.model<ICharacterAccountMatch>("CharacterAccountMatch", CharacterAccountMatchSchema);
