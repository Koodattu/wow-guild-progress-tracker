import { Request, Response, NextFunction } from "express";
import { RequestLog, HourlyStats } from "../models/Analytics";
import logger from "../utils/logger";

// In-memory buffer to batch writes (reduces database load)
interface LogEntry {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  responseSize: number;
  userAgent?: string;
  referer?: string;
  timestamp: Date;
}

const logBuffer: LogEntry[] = [];
const BUFFER_SIZE = 50; // Flush every 50 requests
const FLUSH_INTERVAL = 30000; // Or every 30 seconds

// Normalize endpoint paths to group dynamic parameters
// e.g., /api/guilds/draenor/some-guild -> /api/guilds/:realm/:name
const normalizeEndpoint = (path: string): string => {
  // Remove query strings
  const pathWithoutQuery = path.split("?")[0];

  // Common patterns to normalize
  const patterns = [
    // Guild routes: /api/guilds/:realm/:name/...
    { regex: /^\/api\/guilds\/([^/]+)\/([^/]+)\/raids\/(\d+)\/bosses$/, replacement: "/api/guilds/:realm/:name/raids/:raidId/bosses" },
    { regex: /^\/api\/guilds\/([^/]+)\/([^/]+)\/summary$/, replacement: "/api/guilds/:realm/:name/summary" },
    { regex: /^\/api\/guilds\/([^/]+)\/([^/]+)\/reports$/, replacement: "/api/guilds/:realm/:name/reports" },
    { regex: /^\/api\/guilds\/([^/]+)\/([^/]+)$/, replacement: "/api/guilds/:realm/:name" },
    // ObjectId-based routes
    { regex: /^\/api\/guilds\/[a-f0-9]{24}\/raids\/(\d+)\/bosses$/, replacement: "/api/guilds/:id/raids/:raidId/bosses" },
    { regex: /^\/api\/guilds\/[a-f0-9]{24}\/summary$/, replacement: "/api/guilds/:id/summary" },
    { regex: /^\/api\/guilds\/[a-f0-9]{24}$/, replacement: "/api/guilds/:id" },
    // Raid routes
    { regex: /^\/api\/raids\/(\d+)\/dates$/, replacement: "/api/raids/:raidId/dates" },
    { regex: /^\/api\/raids\/(\d+)$/, replacement: "/api/raids/:raidId" },
    // Icon routes
    { regex: /^\/icons\/.*$/, replacement: "/icons/:file" },
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(pathWithoutQuery)) {
      return pattern.replacement;
    }
  }

  return pathWithoutQuery;
};

// Flush buffer to database
const flushBuffer = async () => {
  if (logBuffer.length === 0) return;

  const logsToFlush = [...logBuffer];
  logBuffer.length = 0;

  try {
    // Insert request logs
    await RequestLog.insertMany(logsToFlush, { ordered: false });

    // Update hourly stats
    const hourlyUpdates = new Map<
      string,
      {
        totalRequests: number;
        totalResponseTime: number;
        totalDataTransferred: number;
        endpoints: Map<string, { count: number; totalResponseTime: number; totalSize: number; statusCodes: Map<string, number> }>;
        statusCodes: Map<string, number>;
      }
    >();

    for (const log of logsToFlush) {
      const hourKey = new Date(log.timestamp);
      hourKey.setMinutes(0, 0, 0);
      const hourKeyStr = hourKey.toISOString();

      if (!hourlyUpdates.has(hourKeyStr)) {
        hourlyUpdates.set(hourKeyStr, {
          totalRequests: 0,
          totalResponseTime: 0,
          totalDataTransferred: 0,
          endpoints: new Map(),
          statusCodes: new Map(),
        });
      }

      const hourData = hourlyUpdates.get(hourKeyStr)!;
      hourData.totalRequests++;
      hourData.totalResponseTime += log.responseTime;
      hourData.totalDataTransferred += log.responseSize;

      // Update status code count
      const statusKey = log.statusCode.toString();
      hourData.statusCodes.set(statusKey, (hourData.statusCodes.get(statusKey) || 0) + 1);

      // Update endpoint stats
      if (!hourData.endpoints.has(log.endpoint)) {
        hourData.endpoints.set(log.endpoint, { count: 0, totalResponseTime: 0, totalSize: 0, statusCodes: new Map() });
      }
      const endpointData = hourData.endpoints.get(log.endpoint)!;
      endpointData.count++;
      endpointData.totalResponseTime += log.responseTime;
      endpointData.totalSize += log.responseSize;
      endpointData.statusCodes.set(statusKey, (endpointData.statusCodes.get(statusKey) || 0) + 1);
    }

    // Upsert hourly stats
    for (const [hourStr, data] of hourlyUpdates) {
      const hour = new Date(hourStr);

      // Convert Maps to objects for MongoDB
      const endpointsObj: Record<string, { count: number; totalResponseTime: number; totalSize: number; statusCodes: Record<string, number> }> = {};
      for (const [endpoint, stats] of data.endpoints) {
        const sanitizedEndpoint = endpoint.replace(/\./g, "_"); // MongoDB doesn't like dots in keys
        endpointsObj[sanitizedEndpoint] = {
          count: stats.count,
          totalResponseTime: stats.totalResponseTime,
          totalSize: stats.totalSize,
          statusCodes: Object.fromEntries(stats.statusCodes),
        };
      }

      await HourlyStats.findOneAndUpdate(
        { hour },
        {
          $inc: {
            totalRequests: data.totalRequests,
            totalResponseTime: data.totalResponseTime,
            totalDataTransferred: data.totalDataTransferred,
          },
          $set: {
            [`endpoints`]: endpointsObj,
            [`statusCodes`]: Object.fromEntries(data.statusCodes),
          },
        },
        { upsert: true }
      ).catch(() => {
        // If update fails, try with $inc for all fields
        return HourlyStats.findOneAndUpdate(
          { hour },
          {
            $inc: {
              totalRequests: data.totalRequests,
              totalResponseTime: data.totalResponseTime,
              totalDataTransferred: data.totalDataTransferred,
            },
          },
          { upsert: true }
        );
      });
    }
  } catch (error) {
    logger.error("Failed to flush analytics buffer:", error);
  }
};

// Start periodic flush
setInterval(flushBuffer, FLUSH_INTERVAL);

// Middleware function
export const analyticsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip tracking for analytics endpoints to avoid recursion
  if (req.path.startsWith("/api/analytics")) {
    return next();
  }

  const startTime = Date.now();

  // Track response size
  let responseSize = 0;
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function (body) {
    if (body) {
      responseSize = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(String(body));
    }
    return originalSend.call(this, body);
  };

  res.json = function (body) {
    if (body) {
      responseSize = Buffer.byteLength(JSON.stringify(body));
    }
    return originalJson.call(this, body);
  };

  // On response finish, log the request
  res.on("finish", () => {
    const responseTime = Date.now() - startTime;
    const endpoint = normalizeEndpoint(req.path);

    const logEntry: LogEntry = {
      endpoint,
      method: req.method,
      statusCode: res.statusCode,
      responseTime,
      responseSize,
      userAgent: req.get("user-agent"),
      referer: req.get("referer"),
      timestamp: new Date(),
    };

    logBuffer.push(logEntry);

    // Flush if buffer is full
    if (logBuffer.length >= BUFFER_SIZE) {
      flushBuffer();
    }
  });

  next();
};

// Graceful shutdown - flush remaining logs
export const flushAnalytics = flushBuffer;
