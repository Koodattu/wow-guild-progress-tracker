import mongoose, { Schema, Document } from "mongoose";
import { EventType } from "./Event";

export type DiscordEventDifficulty = "mythic" | "heroic";

export interface IDiscordEventConfig {
  enabled: boolean;
  channelId?: string;
  channelName?: string;
  guildIds: mongoose.Types.ObjectId[];
  eventTypes: EventType[];
  difficulties: DiscordEventDifficulty[];
  raidIds: number[];
}

export interface IDiscordFeatures {
  search: boolean;
  events: boolean;
}

export interface IDiscordGuildIntegration extends Document {
  discordGuildId: string;
  discordGuildName: string;
  discordGuildIcon?: string | null;
  installedByUserId: mongoose.Types.ObjectId;
  installedByDiscordId: string;
  features: IDiscordFeatures;
  eventConfig: IDiscordEventConfig;
  isInstalled: boolean;
  installedAt: Date;
  lastSyncedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DiscordGuildIntegrationSchema = new Schema<IDiscordGuildIntegration>(
  {
    discordGuildId: { type: String, required: true, unique: true },
    discordGuildName: { type: String, required: true },
    discordGuildIcon: { type: String, default: null },
    installedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    installedByDiscordId: { type: String, required: true },
    features: {
      search: { type: Boolean, default: true },
      events: { type: Boolean, default: false },
    },
    eventConfig: {
      enabled: { type: Boolean, default: false },
      channelId: { type: String },
      channelName: { type: String },
      guildIds: [{ type: Schema.Types.ObjectId, ref: "Guild" }],
      eventTypes: {
        type: [String],
        enum: ["boss_kill", "best_pull", "milestone", "hiatus", "regress", "reproge"],
        default: ["boss_kill", "best_pull"],
      },
      difficulties: {
        type: [String],
        enum: ["mythic", "heroic"],
        default: ["mythic"],
      },
      raidIds: { type: [Number], default: [] },
    },
    isInstalled: { type: Boolean, default: true },
    installedAt: { type: Date, default: Date.now },
    lastSyncedAt: { type: Date },
    lastError: { type: String },
  },
  {
    timestamps: true,
  },
);

DiscordGuildIntegrationSchema.index({ isInstalled: 1 });
DiscordGuildIntegrationSchema.index({ "features.events": 1, "eventConfig.enabled": 1 });

export default mongoose.model<IDiscordGuildIntegration>("DiscordGuildIntegration", DiscordGuildIntegrationSchema);
