import mongoose, { Schema, Document } from "mongoose";

// Achievement document from Blizzard API
export interface IAchievement extends Document {
  id: number;
  name: string;
  href: string;
  lastUpdated: Date;
}

// Boss icon cache
export interface IBossIcon extends Document {
  bossName: string;
  blizzardIconUrl: string; // Original Blizzard URL
  iconUrl: string; // Local URL served by our backend
  achievementId: number;
  lastUpdated: Date;
}

// Raid icon cache
export interface IRaidIcon extends Document {
  raidName: string;
  blizzardIconUrl: string; // Original Blizzard URL
  iconUrl: string; // Local URL served by our backend
  achievementId: number;
  lastUpdated: Date;
}

// Auth token for Blizzard API
export interface IAuthToken extends Document {
  service: "blizzard" | "wcl";
  accessToken: string;
  tokenType: string;
  expiresAt: Date;
  createdAt: Date;
}

// Achievement update log to track when we last updated
export interface IAchievementUpdateLog extends Document {
  lastFullUpdate: Date;
  attemptCount: number;
}

// Guild crest emblem cache
export interface IGuildCrestEmblem extends Document {
  id: number;
  imageName: string; // e.g., "emblem_22.png"
  blizzardIconUrl: string; // Original Blizzard URL
  lastUpdated: Date;
}

// Guild crest border cache
export interface IGuildCrestBorder extends Document {
  id: number;
  imageName: string; // e.g., "border_0.png"
  blizzardIconUrl: string; // Original Blizzard URL
  lastUpdated: Date;
}

// Achievement schema
const AchievementSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  href: { type: String, required: true },
  lastUpdated: { type: Date, default: Date.now },
});

// Boss icon schema
const BossIconSchema = new Schema({
  bossName: { type: String, required: true, unique: true },
  blizzardIconUrl: { type: String, required: true },
  iconUrl: { type: String, required: true },
  achievementId: { type: Number, required: true },
  lastUpdated: { type: Date, default: Date.now },
});

// Raid icon schema
const RaidIconSchema = new Schema({
  raidName: { type: String, required: true, unique: true },
  blizzardIconUrl: { type: String, required: true },
  iconUrl: { type: String, required: true },
  achievementId: { type: Number, required: true },
  lastUpdated: { type: Date, default: Date.now },
});

// Auth token schema
const AuthTokenSchema = new Schema({
  service: { type: String, required: true, enum: ["blizzard", "wcl"] },
  accessToken: { type: String, required: true },
  tokenType: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Achievement update log schema
const AchievementUpdateLogSchema = new Schema({
  lastFullUpdate: { type: Date, required: true },
  attemptCount: { type: Number, default: 0 },
});

// Guild crest emblem schema
const GuildCrestEmblemSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  imageName: { type: String, required: true },
  blizzardIconUrl: { type: String, required: true },
  lastUpdated: { type: Date, default: Date.now },
});

// Guild crest border schema
const GuildCrestBorderSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  imageName: { type: String, required: true },
  blizzardIconUrl: { type: String, required: true },
  lastUpdated: { type: Date, default: Date.now },
});

// Add indexes
AchievementSchema.index({ name: "text" }); // For text search
AuthTokenSchema.index({ service: 1 }, { unique: true }); // One token per service

// Export models
export const Achievement = mongoose.model<IAchievement>("Achievement", AchievementSchema);
export const BossIcon = mongoose.model<IBossIcon>("BossIcon", BossIconSchema);
export const RaidIcon = mongoose.model<IRaidIcon>("RaidIcon", RaidIconSchema);
export const AuthToken = mongoose.model<IAuthToken>("AuthToken", AuthTokenSchema);
export const AchievementUpdateLog = mongoose.model<IAchievementUpdateLog>("AchievementUpdateLog", AchievementUpdateLogSchema);
export const GuildCrestEmblem = mongoose.model<IGuildCrestEmblem>("GuildCrestEmblem", GuildCrestEmblemSchema);
export const GuildCrestBorder = mongoose.model<IGuildCrestBorder>("GuildCrestBorder", GuildCrestBorderSchema);
