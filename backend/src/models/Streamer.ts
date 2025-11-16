import mongoose, { Schema, Document } from "mongoose";

export interface IStreamer {
  channelName: string; // Twitch channel name (login name)
  isLive: boolean; // Current live status
  lastChecked?: Date; // Last time we checked the status
}

const StreamerSchema = new Schema<IStreamer>(
  {
    channelName: { type: String, required: true },
    isLive: { type: Boolean, required: true, default: false },
    lastChecked: { type: Date },
  },
  { _id: false } // Don't create separate _id for subdocuments
);

export default StreamerSchema;
