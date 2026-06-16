import mongoose, { Schema, Document } from "mongoose";

export interface IMechanicsBossScore {
  encounterId: number;
  encounterName: string;
  score: number;
  parseScore: number;
  survivalScore: number | null;
  pulls: number;
  deaths: number;
  survivedPulls: number;
  earlyDeaths: number;
  averageDeathPercent: number | null;
  deathDataAvailable: boolean;
  specName: string;
  rankPercent: number;
}

export interface ICharacterMechanicsLeaderboard extends Document {
  zoneId: number;
  difficulty: number;
  type: "boss" | "overall";
  encounterId: number | null;
  metric: "dps" | "hps";

  characterId: mongoose.Types.ObjectId;
  wclCanonicalCharacterId: number;
  name: string;
  realm: string;
  region: string;
  classID: number;

  specName: string;
  bestSpecName: string;
  role: "dps" | "healer" | "tank";
  ilvl: number;

  score: number;
  parseScore: number;
  survivalScore: number | null;

  encounterName: string;
  rankPercent: number;
  medianPercent: number;
  totalKills: number;
  bestAmount: number;

  pulls: number;
  deaths: number;
  survivedPulls: number;
  earlyDeaths: number;
  averageDeathPercent: number | null;
  deathDataAvailable: boolean;
  bossScores: IMechanicsBossScore[];

  guildName: string | null;
  guildRealm: string | null;
  sourcePartition: number;

  updatedAt: Date;
}

const MechanicsBossScoreSchema = new Schema<IMechanicsBossScore>(
  {
    encounterId: { type: Number, required: true },
    encounterName: { type: String, required: true },
    score: { type: Number, required: true },
    parseScore: { type: Number, required: true },
    survivalScore: { type: Number, default: null },
    pulls: { type: Number, default: 0 },
    deaths: { type: Number, default: 0 },
    survivedPulls: { type: Number, default: 0 },
    earlyDeaths: { type: Number, default: 0 },
    averageDeathPercent: { type: Number, default: null },
    deathDataAvailable: { type: Boolean, default: false },
    specName: { type: String, required: true },
    rankPercent: { type: Number, required: true },
  },
  { _id: false },
);

const CharacterMechanicsLeaderboardSchema = new Schema<ICharacterMechanicsLeaderboard>(
  {
    zoneId: { type: Number, required: true },
    difficulty: { type: Number, required: true },
    type: { type: String, enum: ["boss", "overall"], required: true },
    encounterId: { type: Number, default: null },
    metric: { type: String, enum: ["dps", "hps"], required: true, index: true },

    characterId: { type: Schema.Types.ObjectId, ref: "Character", required: true },
    wclCanonicalCharacterId: { type: Number, required: true },
    name: { type: String, required: true },
    realm: { type: String, required: true },
    region: { type: String, required: true },
    classID: { type: Number, required: true },

    specName: { type: String, required: true },
    bestSpecName: { type: String, default: "" },
    role: { type: String, enum: ["dps", "healer", "tank"], required: true },
    ilvl: { type: Number, default: 0 },

    score: { type: Number, required: true },
    parseScore: { type: Number, required: true },
    survivalScore: { type: Number, default: null },

    encounterName: { type: String, default: "" },
    rankPercent: { type: Number, default: 0 },
    medianPercent: { type: Number, default: 0 },
    totalKills: { type: Number, default: 0 },
    bestAmount: { type: Number, default: 0 },

    pulls: { type: Number, default: 0 },
    deaths: { type: Number, default: 0 },
    survivedPulls: { type: Number, default: 0 },
    earlyDeaths: { type: Number, default: 0 },
    averageDeathPercent: { type: Number, default: null },
    deathDataAvailable: { type: Boolean, default: false },
    bossScores: { type: [MechanicsBossScoreSchema], default: [] },

    guildName: { type: String, default: null },
    guildRealm: { type: String, default: null },
    sourcePartition: { type: Number, default: 0 },

    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

CharacterMechanicsLeaderboardSchema.index({ zoneId: 1, difficulty: 1, type: 1, encounterId: 1, metric: 1, characterId: 1 }, { unique: true });

CharacterMechanicsLeaderboardSchema.index({
  zoneId: 1,
  difficulty: 1,
  type: 1,
  encounterId: 1,
  metric: 1,
  score: -1,
});

CharacterMechanicsLeaderboardSchema.index({
  zoneId: 1,
  difficulty: 1,
  type: 1,
  encounterId: 1,
  metric: 1,
  classID: 1,
  score: -1,
});

CharacterMechanicsLeaderboardSchema.index({
  zoneId: 1,
  difficulty: 1,
  type: 1,
  encounterId: 1,
  metric: 1,
  classID: 1,
  specName: 1,
  score: -1,
});

CharacterMechanicsLeaderboardSchema.index({
  zoneId: 1,
  difficulty: 1,
  type: 1,
  encounterId: 1,
  metric: 1,
  role: 1,
  score: -1,
});

CharacterMechanicsLeaderboardSchema.index({
  zoneId: 1,
  difficulty: 1,
  type: 1,
  encounterId: 1,
  name: 1,
});

CharacterMechanicsLeaderboardSchema.index({
  wclCanonicalCharacterId: 1,
  classID: 1,
  zoneId: -1,
  score: -1,
});

export default mongoose.model<ICharacterMechanicsLeaderboard>("CharacterMechanicsLeaderboard", CharacterMechanicsLeaderboardSchema);
