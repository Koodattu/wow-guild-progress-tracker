import mongoose, { Schema, Document } from "mongoose";

/**
 * Processing status for a guild in the queue
 */
export type ProcessingStatus = "pending" | "in_progress" | "completed" | "failed" | "paused";

/**
 * Interface for guild processing queue entry
 */
export interface IGuildProcessingQueue extends Document {
  guildId: mongoose.Types.ObjectId;
  guildName: string;
  guildRealm: string;
  guildRegion: string;

  // Processing status
  status: ProcessingStatus;
  priority: number; // Lower = higher priority (0 = highest)

  // Progress tracking
  progress: {
    totalReportsEstimate: number; // Estimated total reports (from first fetch)
    reportsFetched: number; // Reports processed so far
    fightsSaved: number; // Total fights saved
    currentPage: number; // Current page being fetched
    percentComplete: number; // Calculated completion percentage
  };

  // Error tracking
  lastError?: string;
  errorCount: number;
  lastErrorAt?: Date;
  errorType?: "guild_not_found" | "rate_limited" | "network_error" | "api_error" | "database_error" | "unknown";
  isPermanentError?: boolean;
  failureReason?: string;

  // Timing
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  pausedAt?: Date;
  lastActivityAt: Date;

  // Retry tracking
  retryCount: number;
  maxRetries: number;

  // Instance methods
  updateProgress(reportsFetched: number, fightsSaved: number, currentPage: number, totalEstimate?: number): Promise<void>;
  markCompleted(): Promise<void>;
  markFailed(error: string, errorType?: string, isPermanent?: boolean, failureReason?: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
}

/**
 * Schema for guild processing queue
 */
const GuildProcessingQueueSchema = new Schema<IGuildProcessingQueue>(
  {
    guildId: {
      type: Schema.Types.ObjectId,
      ref: "Guild",
      required: true,
    },
    guildName: {
      type: String,
      required: true,
    },
    guildRealm: {
      type: String,
      required: true,
    },
    guildRegion: {
      type: String,
      required: true,
    },

    // Processing status
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "failed", "paused"],
      default: "pending",
      index: true,
    },
    priority: {
      type: Number,
      default: 10,
      index: true,
    },

    // Progress tracking
    progress: {
      totalReportsEstimate: { type: Number, default: 0 },
      reportsFetched: { type: Number, default: 0 },
      fightsSaved: { type: Number, default: 0 },
      currentPage: { type: Number, default: 0 },
      percentComplete: { type: Number, default: 0 },
    },

    // Error tracking
    lastError: { type: String },
    errorCount: { type: Number, default: 0 },
    lastErrorAt: { type: Date },
    errorType: {
      type: String,
      enum: ["guild_not_found", "rate_limited", "network_error", "api_error", "database_error", "unknown"],
    },
    isPermanentError: { type: Boolean, default: false },
    failureReason: { type: String },

    // Timing
    startedAt: { type: Date },
    completedAt: { type: Date },
    pausedAt: { type: Date },
    lastActivityAt: { type: Date, default: Date.now },

    // Retry tracking
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  },
);

// Compound index for efficient queue queries
GuildProcessingQueueSchema.index({ status: 1, priority: 1, createdAt: 1 });

// Ensure one queue entry per guild
GuildProcessingQueueSchema.index({ guildId: 1 }, { unique: true });

/**
 * Static method to get next item to process
 */
GuildProcessingQueueSchema.statics.getNextToProcess = async function () {
  return this.findOneAndUpdate(
    {
      status: "pending",
    },
    {
      $set: {
        status: "in_progress",
        startedAt: new Date(),
        lastActivityAt: new Date(),
      },
    },
    {
      sort: { priority: 1, createdAt: 1 }, // Lowest priority number first, then oldest
      new: true,
    },
  );
};

/**
 * Static method to get queue statistics
 */
GuildProcessingQueueSchema.statics.getQueueStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalReports: { $sum: "$progress.reportsFetched" },
        totalFights: { $sum: "$progress.fightsSaved" },
      },
    },
  ]);

  const result: Record<string, { count: number; totalReports: number; totalFights: number }> = {};
  for (const stat of stats) {
    result[stat._id] = {
      count: stat.count,
      totalReports: stat.totalReports,
      totalFights: stat.totalFights,
    };
  }

  return result;
};

/**
 * Instance method to update progress
 */
GuildProcessingQueueSchema.methods.updateProgress = async function (reportsFetched: number, fightsSaved: number, currentPage: number, totalEstimate?: number) {
  this.progress.reportsFetched = reportsFetched;
  this.progress.fightsSaved = fightsSaved;
  this.progress.currentPage = currentPage;
  this.lastActivityAt = new Date();

  if (totalEstimate !== undefined && totalEstimate > 0) {
    this.progress.totalReportsEstimate = totalEstimate;
  }

  // Calculate percent complete
  if (this.progress.totalReportsEstimate > 0) {
    this.progress.percentComplete = Math.min(100, Math.round((reportsFetched / this.progress.totalReportsEstimate) * 100));
  }

  await this.save();
};

/**
 * Instance method to mark as completed
 */
GuildProcessingQueueSchema.methods.markCompleted = async function () {
  this.status = "completed";
  this.completedAt = new Date();
  this.lastActivityAt = new Date();
  this.progress.percentComplete = 100;
  await this.save();
};

/**
 * Instance method to mark as failed
 */
GuildProcessingQueueSchema.methods.markFailed = async function (error: string, errorType?: string, isPermanent?: boolean, failureReason?: string) {
  this.errorCount += 1;
  this.lastError = error;
  this.lastErrorAt = new Date();
  this.lastActivityAt = new Date();

  // Set error classification fields if provided
  if (errorType) {
    this.errorType = errorType;
  }
  if (failureReason) {
    this.failureReason = failureReason;
  }

  // Handle permanent errors - fail immediately without retry
  if (isPermanent) {
    this.isPermanentError = true;
    this.status = "failed";
  } else if (this.retryCount < this.maxRetries) {
    // Queue for retry
    this.status = "pending";
    this.retryCount += 1;
  } else {
    // Max retries exceeded
    this.status = "failed";
  }

  await this.save();
};

/**
 * Instance method to pause processing
 */
GuildProcessingQueueSchema.methods.pause = async function () {
  this.status = "paused";
  this.pausedAt = new Date();
  this.lastActivityAt = new Date();
  await this.save();
};

/**
 * Instance method to resume processing
 */
GuildProcessingQueueSchema.methods.resume = async function () {
  this.status = "pending";
  this.pausedAt = undefined;
  this.lastActivityAt = new Date();
  await this.save();
};

// Type for the model with statics
interface IGuildProcessingQueueModel extends mongoose.Model<IGuildProcessingQueue> {
  getNextToProcess(): Promise<IGuildProcessingQueue | null>;
  getQueueStats(): Promise<Record<string, { count: number; totalReports: number; totalFights: number }>>;
}

const GuildProcessingQueue = mongoose.model<IGuildProcessingQueue, IGuildProcessingQueueModel>("GuildProcessingQueue", GuildProcessingQueueSchema);

export default GuildProcessingQueue;
