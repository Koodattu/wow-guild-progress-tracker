import express, { Application, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import connectDB from "./config/database";
import guildService from "./services/guild.service";
import blizzardService from "./services/blizzard.service";
import scheduler from "./services/scheduler.service";
import guildsRouter from "./routes/guilds";
import eventsRouter from "./routes/events";
import raidsRouter from "./routes/raids";

// Load environment variables
dotenv.config();

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
