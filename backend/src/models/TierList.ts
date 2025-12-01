import mongoose, { Schema, Document } from "mongoose";
import { IGuildCrest } from "./Guild";

export interface IGuildTierScore {
  guildId: mongoose.Types.ObjectId;
  guildName: string;
  realm: string;
  faction?: string;
  crest?: IGuildCrest;
  parent_guild?: string;
  overallScore: number;
  speedScore: number;
  efficiencyScore: number;
}

export interface IRaidTierList {
  raidId: number;
  raidName: string;
  guilds: IGuildTierScore[];
}

export interface ITierList extends Document {
  calculatedAt: Date;
  overall: IGuildTierScore[]; // Combined scores across all raids
  raids: IRaidTierList[]; // Per-raid tier lists
}

const GuildTierScoreSchema = new Schema<IGuildTierScore>(
  {
    guildId: { type: Schema.Types.ObjectId, ref: "Guild", required: true },
    guildName: { type: String, required: true },
    realm: { type: String, required: true },
    faction: { type: String },
    crest: { type: Schema.Types.Mixed },
    parent_guild: { type: String },
    overallScore: { type: Number, required: true },
    speedScore: { type: Number, required: true },
    efficiencyScore: { type: Number, required: true },
  },
  { _id: false }
);

const RaidTierListSchema = new Schema<IRaidTierList>(
  {
    raidId: { type: Number, required: true },
    raidName: { type: String, required: true },
    guilds: [GuildTierScoreSchema],
  },
  { _id: false }
);

const TierListSchema = new Schema<ITierList>({
  calculatedAt: { type: Date, required: true, default: Date.now },
  overall: [GuildTierScoreSchema],
  raids: [RaidTierListSchema],
});

// Always keep only the latest tier list
TierListSchema.index({ calculatedAt: -1 });

export default mongoose.model<ITierList>("TierList", TierListSchema);
