import winston from "winston";
import path from "path";
import fs from "fs";
import util from "util";

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function formatLogValue(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || value.message || value.name;
  }
  if (typeof value === "string") {
    return value;
  }
  return util.inspect(value, { depth: 6, breakLength: Infinity });
}

// Common format for all loggers
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack } = info;
    const extra = (info[Symbol.for("splat")] as unknown[] | undefined)?.map(formatLogValue).filter(Boolean).join(" ");
    const baseMessage = extra ? `${message} ${extra}` : message;

    if (stack) {
      return `${timestamp} [${level.toUpperCase()}]: ${baseMessage}\n${stack}`;
    }
    return `${timestamp} [${level.toUpperCase()}]: ${baseMessage}`;
  }),
);

// Create general application logger
const generalLogger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), logFormat),
    }),
    // Write all logs to general.log with 7-day rotation
    new winston.transports.File({
      filename: path.join(logsDir, "general.log"),
      maxsize: 10485760, // 10MB
      maxFiles: 7, // Keep 7 days worth of logs
      tailable: true,
    }),
    // Write error logs to error.log
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 10485760, // 10MB
      maxFiles: 7,
      tailable: true,
    }),
  ],
});

// Cache for guild-specific loggers
const guildLoggers = new Map<string, winston.Logger>();

/**
 * Get or create a logger for a specific guild
 * @param guildName - Name of the guild
 * @param realm - Realm of the guild
 * @returns Winston logger instance for the guild
 */
export function getGuildLogger(guildName: string, realm: string): winston.Logger {
  // Create a safe filename from guild name and realm
  const safeFileName = `${guildName}-${realm}`.toLowerCase().replace(/[^a-z0-9-]/g, "_");

  const loggerKey = `${guildName}-${realm}`;

  // Return cached logger if it exists
  if (guildLoggers.has(loggerKey)) {
    return guildLoggers.get(loggerKey)!;
  }

  // Create guild-specific logs directory
  const guildLogsDir = path.join(logsDir, "guilds");
  if (!fs.existsSync(guildLogsDir)) {
    fs.mkdirSync(guildLogsDir, { recursive: true });
  }

  // Create new guild logger
  const guildLogger = winston.createLogger({
    level: "info",
    format: logFormat,
    defaultMeta: { guild: guildName, realm },
    transports: [
      // Write logs to console
      new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), logFormat),
      }),
      // Write to guild-specific log file with 7-day rotation
      new winston.transports.File({
        filename: path.join(guildLogsDir, `${safeFileName}.log`),
        maxsize: 5242880, // 5MB
        maxFiles: 7, // Keep 7 days worth of logs
        tailable: true,
      }),
    ],
  });

  // Cache the logger
  guildLoggers.set(loggerKey, guildLogger);
  return guildLogger;
}

/**
 * Close and remove a cached guild logger after long bulk operations.
 *
 * Guild-specific loggers keep file transports open. Bulk jobs that touch every
 * guild should not retain one logger per guild for the lifetime of the worker.
 */
export function releaseGuildLogger(guildName: string, realm: string): void {
  const loggerKey = `${guildName}-${realm}`;
  const guildLogger = guildLoggers.get(loggerKey);
  if (!guildLogger) return;

  guildLogger.close();
  guildLoggers.delete(loggerKey);
}

/**
 * Main logger instance for general application logs
 */
export const logger = generalLogger;

export default logger;
