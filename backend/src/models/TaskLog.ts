import mongoose, { Schema, Document } from "mongoose";

export type TaskStatus = "running" | "completed" | "failed";

export interface ITaskLog extends Document {
  taskName: string;
  status: TaskStatus;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

const taskLogSchema = new Schema<ITaskLog>(
  {
    taskName: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      required: true,
      index: true,
    },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date },
    durationMs: { type: Number },
    error: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: false,
  },
);

// Compound index for querying recent tasks by name
taskLogSchema.index({ taskName: 1, startedAt: -1 });

// TTL index: auto-delete logs older than 7 days
taskLogSchema.index({ startedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

const TaskLog = mongoose.model<ITaskLog>("TaskLog", taskLogSchema);
export default TaskLog;
