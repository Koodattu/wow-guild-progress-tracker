// Load environment variables
import dotenv from "dotenv";
dotenv.config();

import express, { Application, Request, Response } from "express";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import path from "path";
import logger from "./utils/logger";
import connectDB from "./config/database";
import guildService from "./services/guild.service";
import blizzardService from "./services/blizzard.service";
import scheduler from "./services/scheduler.service";
import guildsRouter from "./routes/guilds";
import progressRouter from "./routes/progress";
import homeRouter from "./routes/home";
import eventsRouter from "./routes/events";
import raidsRouter from "./routes/raids";
import tierlistsRouter from "./routes/tierlists";
import analyticsRouter from "./routes/analytics";
import raidAnalyticsRouter from "./routes/raid-analytics";
import authRouter from "./routes/auth";
import adminRouter from "./routes/admin";
import characterRankingsRouter from "./routes/character-rankings";
import pickemsRouter from "./routes/pickems";
import pickemService from "./services/pickem.service";
import backgroundGuildProcessor from "./services/background-guild-processor.service";
import { analyticsMiddleware, flushAnalytics } from "./middleware/analytics.middleware";
import cacheService from "./services/cache.service";
import cacheWarmerService from "./services/cache-warmer.service";

const app: Application = express();
const PORT = process.env.PORT || 3001;

// Trust first proxy (nginx) in production for secure cookies
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// ============================================================================
// STARTUP STATE TRACKING
// ============================================================================
interface StartupState {
  status: "starting" | "initializing" | "ready" | "error";
  startedAt: Date;
  readyAt: Date | null;
  currentTask: string | null;
  completedTasks: string[];
  failedTasks: { task: string; error: string }[];
  errors: string[];
}

const startupState: StartupState = {
  status: "starting",
  startedAt: new Date(),
  readyAt: null,
  currentTask: null,
  completedTasks: [],
  failedTasks: [],
  errors: [],
};

/**
 * Update startup state and log progress
 */
function setStartupTask(task: string): void {
  startupState.currentTask = task;
  logger.info(`[Startup] Starting: ${task}`);
}

/**
 * Mark a startup task as complete
 */
function completeStartupTask(task: string): void {
  startupState.completedTasks.push(task);
  startupState.currentTask = null;
  logger.info(`[Startup] Completed: ${task}`);
}

/**
 * Mark a startup task as failed (non-fatal)
 */
function failStartupTask(task: string, error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  startupState.failedTasks.push({ task, error: errorMessage });
  startupState.currentTask = null;
  logger.error(`[Startup] Failed: ${task} - ${errorMessage}`);
}

// ============================================================================
// MIDDLEWARE CONFIGURATION
// ============================================================================
app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? "https://suomiwow.vaarattu.tv" : "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());

// Session configuration with MongoDB store
const sessionConfig: any = {
  secret: process.env.SESSION_SECRET || "your-secret-key-change-in-production",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || "mongodb://localhost:27017/wow_guild_tracker",
    collectionName: "sessions",
    ttl: 7 * 24 * 60 * 60, // 7 days
  }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  },
};

// In production, don't set domain to allow cookies on all subdomains
if (process.env.NODE_ENV === "production") {
  // Domain will be automatically set by the browser
  logger.info("Production session config: secure cookies with sameSite=none");
}

app.use(session(sessionConfig));

// Analytics middleware - tracks all requests automatically
app.use(analyticsMiddleware);

// Serve static icons
app.use("/icons", express.static(path.join(__dirname, "../public/icons")));

// ============================================================================
// ROUTES
// ============================================================================
app.use("/api/guilds", guildsRouter);
app.use("/api/progress", progressRouter);
app.use("/api/home", homeRouter);
app.use("/api/events", eventsRouter);
app.use("/api/raids", raidsRouter);
app.use("/api/tierlists", tierlistsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/raid-analytics", raidAnalyticsRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/pickems", pickemsRouter);
app.use("/api/character-rankings", characterRankingsRouter);

// ============================================================================
// HEALTH CHECK WITH STARTUP STATUS
// ============================================================================
app.get("/health", (req: Request, res: Response) => {
  const isReady = startupState.status === "ready";
  const uptime = Date.now() - startupState.startedAt.getTime();

  const response = {
    status: isReady ? "ok" : "initializing",
    startupStatus: startupState.status,
    timestamp: new Date(),
    uptime: `${Math.floor(uptime / 1000)}s`,
    currentTask: startupState.currentTask,
    completedTasks: startupState.completedTasks.length,
    failedTasks: startupState.failedTasks.length,
    ...(startupState.readyAt && {
      initializationTime: `${Math.floor((startupState.readyAt.getTime() - startupState.startedAt.getTime()) / 1000)}s`,
    }),
  };

  // Return 503 if still initializing (useful for load balancers)
  // But also check query param to allow 200 for basic liveness checks
  if (!isReady && req.query.strict === "true") {
    res.status(503).json(response);
  } else {
    res.json(response);
  }
});

// Detailed startup status endpoint for debugging
app.get("/health/startup", (req: Request, res: Response) => {
  res.json({
    ...startupState,
    uptime: `${Math.floor((Date.now() - startupState.startedAt.getTime()) / 1000)}s`,
  });
});

// ============================================================================
// ASYNC INITIALIZATION TASKS (run in background after server starts)
// ============================================================================

/**
 * Run a startup task with error handling and state tracking.
 * Non-fatal errors are logged but don't stop other tasks.
 */
async function runStartupTask(taskName: string, task: () => Promise<void>): Promise<boolean> {
  setStartupTask(taskName);
  try {
    await task();
    completeStartupTask(taskName);
    return true;
  } catch (error) {
    failStartupTask(taskName, error);
    return false;
  }
}

/**
 * Run all background initialization tasks.
 * These tasks are non-blocking and run after the API is already serving.
 */
async function runBackgroundInitialization(): Promise<void> {
  startupState.status = "initializing";
  const startTime = Date.now();

  logger.info("=".repeat(60));
  logger.info("[Startup] Beginning background initialization...");
  logger.info("=".repeat(60));

  // -------------------------------------------------------------------------
  // Phase 1: Core data initialization (sequential - dependencies exist)
  // -------------------------------------------------------------------------

  // Initialize Blizzard API (check if achievements exist)
  await runStartupTask("Initialize Blizzard API (achievements, crest components)", async () => {
    await blizzardService.initializeIfNeeded();
  });

  // Sync raid data from WarcraftLogs (zones, bosses, etc.)
  await runStartupTask("Sync raid data from WarcraftLogs", async () => {
    await guildService.syncRaidsFromWCL();
  });

  // Initialize guilds from config
  await runStartupTask("Initialize guilds from config", async () => {
    await guildService.initializeGuilds();
  });

  // Sync guild config data (parent_guild and streamers)
  await runStartupTask("Sync guild config data", async () => {
    await guildService.syncGuildConfigData();
  });

  // Seed pickems from config
  await runStartupTask("Seed pickems from config", async () => {
    await pickemService.seedPickems();
  });

  // -------------------------------------------------------------------------
  // Phase 2: Statistics and migrations (conditional)
  // -------------------------------------------------------------------------

  const calculateOnStartup = process.env.CALCULATE_GUILD_STATISTICS_ON_STARTUP !== "false";
  const currentTierOnly = process.env.CURRENT_TIER_ONLY !== "false";

  if (calculateOnStartup) {
    logger.info("CALCULATE_GUILD_STATISTICS_ON_STARTUP is enabled");

    await runStartupTask("Recalculate guild statistics", async () => {
      await guildService.recalculateExistingGuildStatistics(currentTierOnly);
    });

    await runStartupTask("Migrate guilds (WarcraftLogs ID)", async () => {
      await guildService.migrateGuildsWarcraftLogsId();
    });
  } else {
    logger.info("CALCULATE_GUILD_STATISTICS_ON_STARTUP is disabled, skipping statistics recalculation");
  }

  // -------------------------------------------------------------------------
  // Phase 3: Start scheduler and optional startup tasks
  // -------------------------------------------------------------------------

  // Start background scheduler (fast - just sets up timers)
  await runStartupTask("Start background scheduler", async () => {
    scheduler.start();
  });

  // Start background guild processor (handles initial data fetch for new guilds)
  await runStartupTask("Start background guild processor", async () => {
    backgroundGuildProcessor.start();
  });

  // Log death events fetching status
  const fetchDeathEvents = process.env.FETCH_DEATH_EVENTS === "true";
  if (fetchDeathEvents) {
    logger.info("FETCH_DEATH_EVENTS is enabled, death events and actor data will be fetched for fights");
  } else {
    logger.info("FETCH_DEATH_EVENTS is disabled (default), death events will not be fetched to reduce data volume");
  }

  // -------------------------------------------------------------------------
  // Phase 4: Optional startup tasks (can run in parallel)
  // -------------------------------------------------------------------------

  const optionalTasks: Promise<void>[] = [];

  // Check Twitch stream status on startup
  if (process.env.CHECK_TWITCH_STREAMS_ON_STARTUP === "true") {
    logger.info("CHECK_TWITCH_STREAMS_ON_STARTUP is enabled");
    optionalTasks.push(
      runStartupTask("Check Twitch streams", async () => {
        await scheduler.checkStreamsOnStartup();
      }).then(() => {}),
    );
  } else {
    logger.info("CHECK_TWITCH_STREAMS_ON_STARTUP is disabled, skipping startup stream check");
  }

  // Update inactive guilds on startup
  if (process.env.UPDATE_INACTIVE_GUILDS_ON_STARTUP === "true") {
    logger.info("UPDATE_INACTIVE_GUILDS_ON_STARTUP is enabled");
    optionalTasks.push(
      runStartupTask("Update inactive guilds", async () => {
        await scheduler.updateInactiveGuildsOnStartup();
      }).then(() => {}),
    );
  } else {
    logger.info("UPDATE_INACTIVE_GUILDS_ON_STARTUP is disabled, skipping startup inactive guilds update");
  }

  // Update world ranks on startup
  if (process.env.UPDATE_WORLD_RANKS_ON_STARTUP === "true") {
    logger.info("UPDATE_WORLD_RANKS_ON_STARTUP is enabled");
    optionalTasks.push(
      runStartupTask("Update world ranks", async () => {
        await scheduler.updateWorldRanksOnStartup();
      }).then(() => {}),
    );
  } else {
    logger.info("UPDATE_WORLD_RANKS_ON_STARTUP is disabled, skipping startup world ranks update");
  }

  // Update guild crests on startup
  if (process.env.UPDATE_GUILD_CRESTS_ON_STARTUP === "true") {
    logger.info("UPDATE_GUILD_CRESTS_ON_STARTUP is enabled");
    optionalTasks.push(
      runStartupTask("Update guild crests", async () => {
        await scheduler.updateGuildCrestsOnStartup();
      }).then(() => {}),
    );
  } else {
    logger.info("UPDATE_GUILD_CRESTS_ON_STARTUP is disabled, skipping startup guild crests update");
  }

  // Refetch recent reports on startup
  if (process.env.REFETCH_RECENT_REPORTS_ON_STARTUP === "true") {
    logger.info("REFETCH_RECENT_REPORTS_ON_STARTUP is enabled");
    optionalTasks.push(
      runStartupTask("Refetch recent reports", async () => {
        await scheduler.refetchRecentReportsOnStartup();
      }).then(() => {}),
    );
  } else {
    logger.info("REFETCH_RECENT_REPORTS_ON_STARTUP is disabled, skipping startup recent reports refetch");
  }

  // Refresh character rankings on startup
  if (process.env.REFRESH_CHARACTER_RANKINGS_ON_STARTUP === "true") {
    logger.info("REFRESH_CHARACTER_RANKINGS_ON_STARTUP is enabled");
    optionalTasks.push(
      runStartupTask("Refresh character rankings", async () => {
        await scheduler.refreshCharacterRankingsOnStartup();
      }).then(() => {}),
    );
  } else {
    logger.info("REFRESH_CHARACTER_RANKINGS_ON_STARTUP is disabled, skipping startup character rankings refresh");
  }

  // Calculate tier lists on startup
  if (process.env.CALCULATE_TIER_LISTS_ON_STARTUP === "true") {
    logger.info("CALCULATE_TIER_LISTS_ON_STARTUP is enabled");
    optionalTasks.push(
      runStartupTask("Calculate tier lists", async () => {
        await scheduler.calculateTierListsOnStartup();
      }).then(() => {}),
    );
  } else {
    logger.info("CALCULATE_TIER_LISTS_ON_STARTUP is disabled, skipping startup tier list calculation");
  }

  // Calculate raid analytics on startup
  if (process.env.CALCULATE_RAID_ANALYTICS_ON_STARTUP === "true") {
    logger.info("CALCULATE_RAID_ANALYTICS_ON_STARTUP is enabled");
    optionalTasks.push(
      runStartupTask("Calculate raid analytics", async () => {
        await scheduler.calculateRaidAnalyticsOnStartup();
      }).then(() => {}),
    );
  } else {
    logger.info("CALCULATE_RAID_ANALYTICS_ON_STARTUP is disabled, skipping startup raid analytics calculation");
  }

  // Wait for all optional tasks to complete
  if (optionalTasks.length > 0) {
    await Promise.all(optionalTasks);
  }

  // -------------------------------------------------------------------------
  // Phase 5: Cache warming (always runs last)
  // -------------------------------------------------------------------------

  await runStartupTask("Warm API caches", async () => {
    await cacheWarmerService.warmAllCaches();
  });

  // -------------------------------------------------------------------------
  // Initialization complete
  // -------------------------------------------------------------------------

  const duration = Math.floor((Date.now() - startTime) / 1000);
  startupState.status = "ready";
  startupState.readyAt = new Date();
  startupState.currentTask = null;

  logger.info("=".repeat(60));
  logger.info(`[Startup] Background initialization complete in ${duration}s`);
  logger.info(`[Startup] Completed tasks: ${startupState.completedTasks.length}`);
  logger.info(`[Startup] Failed tasks: ${startupState.failedTasks.length}`);
  if (startupState.failedTasks.length > 0) {
    logger.warn(`[Startup] Failed tasks: ${startupState.failedTasks.map((t) => t.task).join(", ")}`);
  }
  logger.info("=".repeat(60));
}

// ============================================================================
// SERVER STARTUP
// ============================================================================

/**
 * Start the server with async initialization.
 * The API starts serving immediately after database connection.
 * All other initialization runs in the background.
 */
const startServer = async () => {
  try {
    logger.info("=".repeat(60));
    logger.info("[Startup] Starting server...");
    logger.info("=".repeat(60));

    // Connect to MongoDB - this is the only blocking requirement
    setStartupTask("Connect to MongoDB");
    await connectDB();
    completeStartupTask("Connect to MongoDB");

    // Initialize cache service (requires MongoDB connection)
    setStartupTask("Initialize cache service");
    await cacheService.initialize();
    completeStartupTask("Initialize cache service");

    // Start Express server IMMEDIATELY after database connection
    app.listen(PORT, () => {
      logger.info(`[Startup] Server running on port ${PORT}`);
      logger.info(`[Startup] API available at http://localhost:${PORT}/api`);
      logger.info(`[Startup] Health check: http://localhost:${PORT}/health`);
      logger.info("[Startup] API is now accepting requests (initialization continuing in background)");
    });

    // Run all other initialization tasks in the background
    // This is intentionally not awaited - we want the server to be available immediately
    runBackgroundInitialization().catch((error) => {
      startupState.status = "error";
      startupState.errors.push(error instanceof Error ? error.message : String(error));
      logger.error("[Startup] Fatal error during background initialization:", error);
    });
  } catch (error) {
    startupState.status = "error";
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle shutdown gracefully
process.on("SIGINT", async () => {
  logger.info("Shutting down gracefully...");
  scheduler.stop();
  backgroundGuildProcessor.stop();
  await flushAnalytics(); // Flush any pending analytics
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down gracefully...");
  scheduler.stop();
  backgroundGuildProcessor.stop();
  await flushAnalytics(); // Flush any pending analytics
  process.exit(0);
});

startServer();
