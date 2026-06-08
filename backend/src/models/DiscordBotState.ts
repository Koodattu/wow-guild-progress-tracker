import mongoose, { Schema, Document } from "mongoose";

export interface IDiscordBotState extends Document {
  key: string;
  lastEventCreatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DiscordBotStateSchema = new Schema<IDiscordBotState>(
  {
    key: { type: String, required: true, unique: true },
    lastEventCreatedAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

DiscordBotStateSchema.index({ key: 1 }, { unique: true });

export default mongoose.model<IDiscordBotState>("DiscordBotState", DiscordBotStateSchema);
