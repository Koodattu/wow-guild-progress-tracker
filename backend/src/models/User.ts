import mongoose, { Schema, Document } from "mongoose";

export interface IDiscordAccount {
  id: string; // Discord user ID
  username: string;
  discriminator: string;
  avatar: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
}

export interface IUser extends Document {
  discord: IDiscordAccount;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date;
}

const DiscordAccountSchema = new Schema<IDiscordAccount>(
  {
    id: { type: String, required: true },
    username: { type: String, required: true },
    discriminator: { type: String, default: "0" },
    avatar: { type: String, default: null },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    tokenExpiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    discord: { type: DiscordAccountSchema, required: true },
    lastLoginAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Index for fast lookup by Discord ID
UserSchema.index({ "discord.id": 1 }, { unique: true });

export default mongoose.model<IUser>("User", UserSchema);
