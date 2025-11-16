import mongoose, { Schema, Document } from "mongoose";

export interface IBestPullPhase {
  phaseId: number;
  phaseName: string;
  bossHealth: number; // Boss health at wipe
  fightCompletion: number; // Fight % at wipe
  displayString: string; // e.g., "45% P3"
}

export interface IBossProgress {
  bossId: number;
  bossName: string;
  kills: number;
  bestPercent: number; // Best pull: lowest fight completion % reached (0 = complete, 100 = no progress) - uses fightPercentage
  bestPhase?: number; // Best phase reached (for multi-phase bosses)
  pullCount: number;
  timeSpent: number; // in seconds
  firstKillTime?: Date;
  firstKillReportCode?: string; // WCL report code for first kill (e.g., "a:1234567890")
  firstKillFightId?: number; // Fight ID within the report for first kill
  killOrder?: number; // Order in which this boss was first killed (1 = first boss killed, 2 = second, etc.)
  bestPullPhase?: IBestPullPhase; // Phase context for best pull
  bestPullReportCode?: string; // WCL report code for best pull (for unkilled bosses)
  bestPullFightId?: number; // Fight ID within the report for best pull (for unkilled bosses)
  lastUpdated: Date;
}

export interface IRaidProgress {
  raidId: number;
  raidName: string;
  difficulty: "mythic" | "heroic";
  bossesDefeated: number;
  totalBosses: number;
  totalTimeSpent: number; // in seconds
  bosses: IBossProgress[];
  worldRank?: number; // World progress rank from WarcraftLogs (always uses highest difficulty)
  worldRankColor?: string; // Color class for the world rank (e.g., "rare", "epic", "legendary")
  guildRank?: number; // Rank among tracked guilds (1 = best)
  lastUpdated: Date;
}

export interface IGuildCrest {
  emblem: {
    id: number;
    imageName: string; // e.g., "emblem_22.png"
    color: {
      r: number;
      g: number;
      b: number;
      a: number;
    };
  };
  border: {
    id: number;
    imageName: string; // e.g., "border_0.png"
    color: {
      r: number;
      g: number;
      b: number;
      a: number;
    };
  };
  background: {
    color: {
      r: number;
      g: number;
      b: number;
      a: number;
    };
  };
}

export interface IRaidScheduleDay {
  day: string; // "Monday", "Tuesday", etc.
  startHour: number; // 0-23.5 (supports half hours: 0, 0.5, 1, 1.5, ..., 23, 23.5)
  endHour: number; // 0-23.5 (supports half hours: 0, 0.5, 1, 1.5, ..., 23, 23.5)
  raidCount: number; // How many raids occurred on this day/time slot
}

export interface IRaidSchedule {
  days: IRaidScheduleDay[]; // Most common raiding days and hours
  lastCalculated?: Date;
}

export interface IGuild extends Document {
  name: string;
  realm: string;
  region: string;
  faction?: string;
  warcraftlogsId?: number; // WarcraftLogs guild ID
  iconUrl?: string;
  crest?: IGuildCrest;
  parent_guild?: string; // Parent guild name if this is a team/sub-guild
  progress: IRaidProgress[];
  raidSchedule?: IRaidSchedule; // Calculated raiding schedule for current tier
  isCurrentlyRaiding: boolean;
  lastLogEndTime?: Date; // End time of the most recent log (for activity tracking)
  activityStatus?: "active" | "inactive"; // active = logs within 30 days, inactive = no logs for 30+ days
  lastFetched?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BossProgressSchema: Schema = new Schema(
  {
    bossId: { type: Number, required: true },
    bossName: { type: String, required: true },
    kills: { type: Number, default: 0 },
    bestPercent: { type: Number, default: 100 }, // Default 100 = worst (full health), track lowest (best)
    bestPhase: { type: Number },
    pullCount: { type: Number, default: 0 },
    timeSpent: { type: Number, default: 0 },
    firstKillTime: { type: Date },
    firstKillReportCode: { type: String },
    firstKillFightId: { type: Number },
    killOrder: { type: Number },
    bestPullPhase: {
      phaseId: { type: Number },
      phaseName: { type: String },
      bossHealth: { type: Number },
      fightCompletion: { type: Number },
      displayString: { type: String },
    },
    bestPullReportCode: { type: String },
    bestPullFightId: { type: Number },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

const RaidProgressSchema: Schema = new Schema(
  {
    raidId: { type: Number, required: true },
    raidName: { type: String, required: true },
    difficulty: { type: String, enum: ["mythic", "heroic"], required: true },
    bossesDefeated: { type: Number, default: 0 },
    totalBosses: { type: Number, required: true },
    totalTimeSpent: { type: Number, default: 0 },
    bosses: [BossProgressSchema],
    worldRank: { type: Number }, // World progress rank from WarcraftLogs
    worldRankColor: { type: String }, // Color class for the world rank
    guildRank: { type: Number }, // Rank among tracked guilds (1 = best)
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

const GuildSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    realm: { type: String, required: true },
    region: { type: String, required: true, default: "EU" },
    faction: { type: String },
    warcraftlogsId: { type: Number }, // WarcraftLogs guild ID
    iconUrl: { type: String },
    crest: {
      emblem: {
        id: { type: Number },
        imageName: { type: String },
        color: {
          r: { type: Number },
          g: { type: Number },
          b: { type: Number },
          a: { type: Number },
        },
      },
      border: {
        id: { type: Number },
        imageName: { type: String },
        color: {
          r: { type: Number },
          g: { type: Number },
          b: { type: Number },
          a: { type: Number },
        },
      },
      background: {
        color: {
          r: { type: Number },
          g: { type: Number },
          b: { type: Number },
          a: { type: Number },
        },
      },
    },
    parent_guild: { type: String }, // Parent guild name if this is a team/sub-guild
    progress: [RaidProgressSchema],
    raidSchedule: {
      days: [
        {
          day: { type: String, required: true },
          startHour: { type: Number, required: true },
          endHour: { type: Number, required: true },
          raidCount: { type: Number, required: true },
        },
      ],
      lastCalculated: { type: Date },
    },
    isCurrentlyRaiding: { type: Boolean, default: false },
    lastLogEndTime: { type: Date }, // End time of the most recent log
    activityStatus: { type: String, enum: ["active", "inactive"], default: "active" }, // Track guild activity
    lastFetched: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Compound index for guild lookup
GuildSchema.index({ name: 1, realm: 1, region: 1 }, { unique: true });

export default mongoose.model<IGuild>("Guild", GuildSchema);
