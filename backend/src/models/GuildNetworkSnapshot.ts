import mongoose, { Document, Schema } from "mongoose";

export interface IGuildNetworkSnapshot extends Document {
  schemaVersion: number;
  active: boolean;
  generatedAt: Date;
  sourceUpdatedAt?: Date | null;
  rowCount: number;
  tierCount: number;
  guildCount: number;
  characterCount: number;
  byteLength: number;
  chunkCount: number;
  chunkSize: number;
  etag: string;
  createdAt: Date;
  updatedAt: Date;
}

const GuildNetworkSnapshotSchema = new Schema<IGuildNetworkSnapshot>(
  {
    schemaVersion: { type: Number, required: true },
    active: { type: Boolean, required: true, default: false, index: true },
    generatedAt: { type: Date, required: true, index: true },
    sourceUpdatedAt: { type: Date, default: null },
    rowCount: { type: Number, required: true },
    tierCount: { type: Number, required: true },
    guildCount: { type: Number, required: true },
    characterCount: { type: Number, required: true },
    byteLength: { type: Number, required: true },
    chunkCount: { type: Number, required: true },
    chunkSize: { type: Number, required: true },
    etag: { type: String, required: true },
  },
  { timestamps: true },
);

GuildNetworkSnapshotSchema.index({ active: 1, generatedAt: -1 });
GuildNetworkSnapshotSchema.index({ generatedAt: -1 });

export default mongoose.model<IGuildNetworkSnapshot>("GuildNetworkSnapshot", GuildNetworkSnapshotSchema);
