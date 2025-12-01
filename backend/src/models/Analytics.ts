import mongoose, { Schema, Document } from "mongoose";

// Individual request log (for detailed analysis, auto-expires after 30 days)
export interface IRequestLog extends Document {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number; // in milliseconds
  responseSize: number; // in bytes
  userAgent?: string;
  referer?: string;
  timestamp: Date;
}

const RequestLogSchema: Schema = new Schema(
  {
    endpoint: { type: String, required: true },
    method: { type: String, required: true },
    statusCode: { type: Number, required: true },
    responseTime: { type: Number, required: true },
    responseSize: { type: Number, required: true },
    userAgent: { type: String },
    referer: { type: String },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: false,
  }
);

// TTL index: automatically delete logs older than 30 days
RequestLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
// Index for querying
RequestLogSchema.index({ endpoint: 1, timestamp: -1 });
RequestLogSchema.index({ timestamp: -1 });

// Hourly aggregated stats (for long-term storage)
export interface IHourlyStats extends Document {
  hour: Date; // Rounded to hour (e.g., 2025-12-01T14:00:00Z)
  totalRequests: number;
  totalResponseTime: number;
  totalDataTransferred: number;
  endpoints: Map<
    string,
    {
      count: number;
      totalResponseTime: number;
      totalSize: number;
      statusCodes: Map<string, number>;
    }
  >;
  statusCodes: Map<string, number>;
}

const HourlyStatsSchema: Schema = new Schema(
  {
    hour: { type: Date, required: true, unique: true },
    totalRequests: { type: Number, required: true, default: 0 },
    totalResponseTime: { type: Number, required: true, default: 0 },
    totalDataTransferred: { type: Number, required: true, default: 0 },
    endpoints: {
      type: Map,
      of: {
        count: { type: Number, default: 0 },
        totalResponseTime: { type: Number, default: 0 },
        totalSize: { type: Number, default: 0 },
        statusCodes: { type: Map, of: Number },
      },
      default: {},
    },
    statusCodes: { type: Map, of: Number, default: {} },
  },
  {
    timestamps: false,
  }
);

HourlyStatsSchema.index({ hour: -1 });

// Daily aggregated stats (for dashboard view)
export interface IDailyStats extends Document {
  date: Date; // Rounded to day (e.g., 2025-12-01T00:00:00Z)
  totalRequests: number;
  totalResponseTime: number;
  totalDataTransferred: number;
  uniqueEndpoints: number;
  topEndpoints: Array<{
    endpoint: string;
    count: number;
    avgResponseTime: number;
  }>;
  statusCodeSummary: Map<string, number>;
  hourlyBreakdown: Array<{
    hour: number;
    requests: number;
  }>;
}

const DailyStatsSchema: Schema = new Schema(
  {
    date: { type: Date, required: true, unique: true },
    totalRequests: { type: Number, required: true, default: 0 },
    totalResponseTime: { type: Number, required: true, default: 0 },
    totalDataTransferred: { type: Number, required: true, default: 0 },
    uniqueEndpoints: { type: Number, default: 0 },
    topEndpoints: [
      {
        endpoint: { type: String },
        count: { type: Number },
        avgResponseTime: { type: Number },
      },
    ],
    statusCodeSummary: { type: Map, of: Number, default: {} },
    hourlyBreakdown: [
      {
        hour: { type: Number },
        requests: { type: Number },
      },
    ],
  },
  {
    timestamps: false,
  }
);

DailyStatsSchema.index({ date: -1 });

export const RequestLog = mongoose.model<IRequestLog>("RequestLog", RequestLogSchema);
export const HourlyStats = mongoose.model<IHourlyStats>("HourlyStats", HourlyStatsSchema);
export const DailyStats = mongoose.model<IDailyStats>("DailyStats", DailyStatsSchema);
