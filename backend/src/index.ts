// Load environment variables
import dotenv from "dotenv";
dotenv.config();

import express, { Application, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import logger from "./utils/logger";
import connectDB from "./config/database";
import guildService from "./services/guild.service";
import blizzardService from "./services/blizzard.service";
import scheduler from "./services/scheduler.service";
import guildsRouter from "./routes/guilds";
import eventsRouter from "./routes/events";
import raidsRouter from "./routes/raids";
import tierlistsRouter from "./routes/tierlists";
import analyticsRouter from "./routes/analytics";
import authRouter from "./routes/auth";
import { analyticsMiddleware, flushAnalytics } from "./middleware/analytics.middleware";

const app: Application = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? "https://suomiwow.vaarattu.tv" : "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Analytics middleware - tracks all requests automatically
app.use(analyticsMiddleware);

// Serve static icons
app.use("/icons", express.static(path.join(__dirname, "../public/icons")));

// Routes
app.use("/api/guilds", guildsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/raids", raidsRouter);
app.use("/api/tierlists", tierlistsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/auth", authRouter);

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// Initialize and start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Initialize Blizzard API (check if achievements exist)
    await blizzardService.initializeIfNeeded();

    // Sync raid data from WarcraftLogs (zones, bosses, etc.)
    // This will also fetch achievements from Blizzard if needed
    await guildService.syncRaidsFromWCL();

    // Initialize guilds from config
    await guildService.initializeGuilds();

    // Sync guild config data (parent_guild and streamers)
    await guildService.syncGuildConfigData();

    // Recalculate statistics for existing guilds if enabled
    const calculateOnStartup = process.env.CALCULATE_GUILD_STATISTICS_ON_STARTUP !== "false";
    const currentTierOnly = process.env.CURRENT_TIER_ONLY !== "false";

    if (calculateOnStartup) {
      logger.info("CALCULATE_GUILD_STATISTICS_ON_STARTUP is enabled");
      await guildService.recalculateExistingGuildStatistics(currentTierOnly);
    } else {
      logger.info("CALCULATE_GUILD_STATISTICS_ON_STARTUP is disabled, skipping statistics recalculation");
    }

    // Migrate existing guilds to add WarcraftLogs guild ID
    // This runs on every startup to ensure all guilds have the ID
    if (calculateOnStartup) {
      logger.info("Migrating guilds to add WarcraftLogs guild ID...");
      await guildService.migrateGuildsWarcraftLogsId();
    }

    // Start background scheduler
    scheduler.start();

    // Check Twitch stream status on startup if enabled
    const checkStreamsOnStartup = process.env.CHECK_TWITCH_STREAMS_ON_STARTUP === "true";
    if (checkStreamsOnStartup) {
      logger.info("CHECK_TWITCH_STREAMS_ON_STARTUP is enabled");
      await scheduler.checkStreamsOnStartup();
    } else {
      logger.info("CHECK_TWITCH_STREAMS_ON_STARTUP is disabled, skipping startup stream check");
    }

    // Update inactive guilds on startup if enabled
    const updateInactiveGuildsOnStartup = process.env.UPDATE_INACTIVE_GUILDS_ON_STARTUP === "true";
    if (updateInactiveGuildsOnStartup) {
      logger.info("UPDATE_INACTIVE_GUILDS_ON_STARTUP is enabled");
      await scheduler.updateInactiveGuildsOnStartup();
    } else {
      logger.info("UPDATE_INACTIVE_GUILDS_ON_STARTUP is disabled, skipping startup inactive guilds update");
    }

    // Update world ranks on startup if enabled
    const updateWorldRanksOnStartup = process.env.UPDATE_WORLD_RANKS_ON_STARTUP === "true";
    if (updateWorldRanksOnStartup) {
      logger.info("UPDATE_WORLD_RANKS_ON_STARTUP is enabled");
      await scheduler.updateWorldRanksOnStartup();
    } else {
      logger.info("UPDATE_WORLD_RANKS_ON_STARTUP is disabled, skipping startup world ranks update");
    }

    // Log death events fetching status
    const fetchDeathEvents = process.env.FETCH_DEATH_EVENTS === "true";
    if (fetchDeathEvents) {
      logger.info("FETCH_DEATH_EVENTS is enabled, death events and actor data will be fetched for fights");
    } else {
      logger.info("FETCH_DEATH_EVENTS is disabled (default), death events will not be fetched to reduce data volume");
    }

    // Update guild crests on startup if enabled
    const updateGuildCrestsOnStartup = process.env.UPDATE_GUILD_CRESTS_ON_STARTUP === "true";
    if (updateGuildCrestsOnStartup) {
      logger.info("UPDATE_GUILD_CRESTS_ON_STARTUP is enabled");
      await scheduler.updateGuildCrestsOnStartup();
    } else {
      logger.info("UPDATE_GUILD_CRESTS_ON_STARTUP is disabled, skipping startup guild crests update");
    }

    // Refetch recent reports on startup if enabled
    const refetchRecentReportsOnStartup = process.env.REFETCH_RECENT_REPORTS_ON_STARTUP === "true";
    if (refetchRecentReportsOnStartup) {
      logger.info("REFETCH_RECENT_REPORTS_ON_STARTUP is enabled");
      await scheduler.refetchRecentReportsOnStartup();
    } else {
      logger.info("REFETCH_RECENT_REPORTS_ON_STARTUP is disabled, skipping startup recent reports refetch");
    }

    // Calculate tier lists on startup if enabled
    const calculateTierListsOnStartup = process.env.CALCULATE_TIER_LISTS_ON_STARTUP === "true";
    if (calculateTierListsOnStartup) {
      logger.info("CALCULATE_TIER_LISTS_ON_STARTUP is enabled");
      await scheduler.calculateTierListsOnStartup();
    } else {
      logger.info("CALCULATE_TIER_LISTS_ON_STARTUP is disabled, skipping startup tier list calculation");
    }

    // Start express server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle shutdown gracefully
process.on("SIGINT", async () => {
  logger.info("Shutting down gracefully...");
  scheduler.stop();
  await flushAnalytics(); // Flush any pending analytics
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down gracefully...");
  scheduler.stop();
  await flushAnalytics(); // Flush any pending analytics
  process.exit(0);
});

startServer();
