import mongoose, { Schema, Document } from "mongoose";

// Statistics for a single boss
export interface IBossAnalytics {
  bossId: number;
  bossName: string;
  guildsKilled: number; // Number of guilds that have killed this boss
  guildsProgressing: number; // Number of guilds currently progressing (pulled but not killed)
  pullCount: {
    average: number;
    lowest: number;
    highest: number;
    lowestGuild?: { name: string; realm: string; count: number };
    highestGuild?: { name: string; realm: string; count: number };
  };
  timeSpent: {
    average: number; // in seconds
    lowest: number;
    highest: number;
    lowestGuild?: { name: string; realm: string; time: number };
    highestGuild?: { name: string; realm: string; time: number };
  };
  // Kill progression over time (for cumulative chart)
  killProgression: {
    date: Date;
    killCount: number; // Cumulative kills up to this date
  }[];
  // Guild distribution for visualization (only guilds that killed)
  guildDistribution: {
    name: string;
    realm: string;
    pullCount: number;
    timeSpent: number; // in seconds
  }[];
}

// Overall raid statistics
export interface IRaidOverallAnalytics {
  guildsCleared: number; // Guilds that killed all bosses
  guildsProgressing: number; // Guilds that started but haven't cleared
  pullCount: {
    average: number;
    lowest: number;
    highest: number;
    lowestGuild?: { name: string; realm: string; count: number };
    highestGuild?: { name: string; realm: string; count: number };
  };
  timeSpent: {
    average: number; // in seconds
    lowest: number;
    highest: number;
    lowestGuild?: { name: string; realm: string; time: number };
    highestGuild?: { name: string; realm: string; time: number };
  };
  // Clear progression over time (guilds that cleared the full raid)
  clearProgression: {
    date: Date;
    clearCount: number; // Cumulative clears up to this date
  }[];
  // Guild distribution for visualization (only guilds that cleared)
  guildDistribution: {
    name: string;
    realm: string;
    pullCount: number;
    timeSpent: number; // in seconds
  }[];
}

export interface IRaidAnalytics extends Document {
  raidId: number;
  raidName: string;
  difficulty: "mythic";
  overall: IRaidOverallAnalytics;
  bosses: IBossAnalytics[];
  raidStart?: Date; // When the raid season started (EU)
  raidEnd?: Date; // When the raid season ended (EU), if applicable
  lastCalculated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BossAnalyticsSchema = new Schema(
  {
    bossId: { type: Number, required: true },
    bossName: { type: String, required: true },
    guildsKilled: { type: Number, default: 0 },
    guildsProgressing: { type: Number, default: 0 },
    pullCount: {
      average: { type: Number, default: 0 },
      lowest: { type: Number, default: 0 },
      highest: { type: Number, default: 0 },
      lowestGuild: {
        name: String,
        realm: String,
        count: Number,
      },
      highestGuild: {
        name: String,
        realm: String,
        count: Number,
      },
    },
    timeSpent: {
      average: { type: Number, default: 0 },
      lowest: { type: Number, default: 0 },
      highest: { type: Number, default: 0 },
      lowestGuild: {
        name: String,
        realm: String,
        time: Number,
      },
      highestGuild: {
        name: String,
        realm: String,
        time: Number,
      },
    },
    killProgression: [
      {
        date: { type: Date, required: true },
        killCount: { type: Number, required: true },
      },
    ],
    guildDistribution: [
      {
        name: { type: String, required: true },
        realm: { type: String, required: true },
        pullCount: { type: Number, required: true },
        timeSpent: { type: Number, required: true },
      },
    ],
  },
  { _id: false }
);

const RaidOverallAnalyticsSchema = new Schema(
  {
    guildsCleared: { type: Number, default: 0 },
    guildsProgressing: { type: Number, default: 0 },
    pullCount: {
      average: { type: Number, default: 0 },
      lowest: { type: Number, default: 0 },
      highest: { type: Number, default: 0 },
      lowestGuild: {
        name: String,
        realm: String,
        count: Number,
      },
      highestGuild: {
        name: String,
        realm: String,
        count: Number,
      },
    },
    timeSpent: {
      average: { type: Number, default: 0 },
      lowest: { type: Number, default: 0 },
      highest: { type: Number, default: 0 },
      lowestGuild: {
        name: String,
        realm: String,
        time: Number,
      },
      highestGuild: {
        name: String,
        realm: String,
        time: Number,
      },
    },
    clearProgression: [
      {
        date: { type: Date, required: true },
        clearCount: { type: Number, required: true },
      },
    ],
    guildDistribution: [
      {
        name: { type: String, required: true },
        realm: { type: String, required: true },
        pullCount: { type: Number, required: true },
        timeSpent: { type: Number, required: true },
      },
    ],
  },
  { _id: false }
);

const RaidAnalyticsSchema: Schema = new Schema(
  {
    raidId: { type: Number, required: true, unique: true },
    raidName: { type: String, required: true },
    difficulty: { type: String, enum: ["mythic"], default: "mythic" },
    overall: { type: RaidOverallAnalyticsSchema, required: true },
    bosses: [BossAnalyticsSchema],
    raidStart: { type: Date },
    raidEnd: { type: Date },
    lastCalculated: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IRaidAnalytics>("RaidAnalytics", RaidAnalyticsSchema);
