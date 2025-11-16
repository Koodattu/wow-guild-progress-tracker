// Load environment variables
import dotenv from "dotenv";
dotenv.config();

import express, { Application, Request, Response } from "express";
import cors from "cors";
import path from "path";
import connectDB from "./config/database";
import guildService from "./services/guild.service";
import blizzardService from "./services/blizzard.service";
import scheduler from "./services/scheduler.service";
import guildsRouter from "./routes/guilds";
import eventsRouter from "./routes/events";
import raidsRouter from "./routes/raids";

const app: Application = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static icons
app.use("/icons", express.static(path.join(__dirname, "../public/icons")));

// Routes
app.use("/api/guilds", guildsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/raids", raidsRouter);

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

    // Recalculate statistics for existing guilds if enabled
    const calculateOnStartup = process.env.CALCULATE_GUILD_STATISTICS_ON_STARTUP !== "false";
    const currentTierOnly = process.env.CURRENT_TIER_ONLY !== "false";

    if (calculateOnStartup) {
      console.log("CALCULATE_GUILD_STATISTICS_ON_STARTUP is enabled");
      await guildService.recalculateExistingGuildStatistics(currentTierOnly);
    } else {
      console.log("CALCULATE_GUILD_STATISTICS_ON_STARTUP is disabled, skipping statistics recalculation");
    }

    // Migrate existing guilds to add WarcraftLogs guild ID
    // This runs on every startup to ensure all guilds have the ID
    if (calculateOnStartup) {
      console.log("Migrating guilds to add WarcraftLogs guild ID...");
      await guildService.migrateGuildsWarcraftLogsId();
    }

    // Start background scheduler
    scheduler.start();

    // Start express server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle shutdown gracefully
process.on("SIGINT", () => {
  console.log("Shutting down gracefully...");
  scheduler.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down gracefully...");
  scheduler.stop();
  process.exit(0);
});

startServer();
