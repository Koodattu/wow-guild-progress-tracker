import mongoose, { Schema, Document } from "mongoose";

export type DiscordEventDeliveryStatus = "pending" | "sent" | "failed";

export interface IDiscordEventDelivery extends Document {
  integrationId: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  discordGuildId: string;
  channelId: string;
  status: DiscordEventDeliveryStatus;
  attempts: number;
  nextAttemptAt: Date;
  sentAt?: Date;
  discordMessageId?: string;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DiscordEventDeliverySchema = new Schema<IDiscordEventDelivery>(
  {
    integrationId: { type: Schema.Types.ObjectId, ref: "DiscordGuildIntegration", required: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    discordGuildId: { type: String, required: true },
    channelId: { type: String, required: true },
    status: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    sentAt: { type: Date },
    discordMessageId: { type: String },
    lastError: { type: String },
  },
  {
    timestamps: true,
  },
);

DiscordEventDeliverySchema.index({ integrationId: 1, eventId: 1 }, { unique: true });
DiscordEventDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
DiscordEventDeliverySchema.index({ eventId: 1 });

export default mongoose.model<IDiscordEventDelivery>("DiscordEventDelivery", DiscordEventDeliverySchema);
