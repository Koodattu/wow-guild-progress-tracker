import mongoose, { Document, Schema } from "mongoose";

export interface IGuildNetworkSnapshotChunk extends Document {
  snapshotId: mongoose.Types.ObjectId;
  index: number;
  data: string;
  createdAt: Date;
}

const GuildNetworkSnapshotChunkSchema = new Schema<IGuildNetworkSnapshotChunk>(
  {
    snapshotId: { type: Schema.Types.ObjectId, ref: "GuildNetworkSnapshot", required: true, index: true },
    index: { type: Number, required: true },
    data: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

GuildNetworkSnapshotChunkSchema.index({ snapshotId: 1, index: 1 }, { unique: true });
GuildNetworkSnapshotChunkSchema.index({ createdAt: 1 });

export default mongoose.model<IGuildNetworkSnapshotChunk>("GuildNetworkSnapshotChunk", GuildNetworkSnapshotChunkSchema);
