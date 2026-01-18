import { Router, Request, Response } from "express";
import { requireAdmin } from "../middleware/admin.middleware";
import User from "../models/User";
import Guild from "../models/Guild";
import { RequestLog, HourlyStats } from "../models/Analytics";
import pickemService from "../services/pickem.service";
import logger from "../utils/logger";

const router = Router();

// Apply admin middleware to all routes
router.use(requireAdmin);

// ============================================================
// USER MANAGEMENT
// ============================================================

// Get all users with pagination
router.get("/users", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find()
        .select({
          "discord.id": 1,
          "discord.username": 1,
          "discord.avatar": 1,
          "twitch.displayName": 1,
          "twitch.connectedAt": 1,
          "battlenet.battletag": 1,
          "battlenet.connectedAt": 1,
          createdAt: 1,
          lastLoginAt: 1,
        })
        .sort({ lastLoginAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(),
    ]);

    // Format users for response (don't expose sensitive tokens)
    const formattedUsers = users.map((user) => ({
      id: user._id,
      discord: {
        id: user.discord.id,
        username: user.discord.username,
        hasAvatar: !!user.discord.avatar,
      },
      twitch: user.twitch
        ? {
            displayName: user.twitch.displayName,
            connectedAt: user.twitch.connectedAt,
          }
        : null,
      battlenet: user.battlenet
        ? {
            battletag: user.battlenet.battletag,
            connectedAt: user.battlenet.connectedAt,
          }
        : null,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    }));

    res.json({
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Get user count stats
router.get("/users/stats", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [total, activeDay, activeWeek, activeMonth, withTwitch, withBattlenet] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastLoginAt: { $gte: last24h } }),
      User.countDocuments({ lastLoginAt: { $gte: last7d } }),
      User.countDocuments({ lastLoginAt: { $gte: last30d } }),
      User.countDocuments({ twitch: { $exists: true } }),
      User.countDocuments({ battlenet: { $exists: true } }),
    ]);

    res.json({
      total,
      active: {
        last24Hours: activeDay,
        last7Days: activeWeek,
        last30Days: activeMonth,
      },
      connections: {
        twitch: withTwitch,
        battlenet: withBattlenet,
      },
    });
  } catch (error) {
    logger.error("Error fetching user stats:", error);
    res.status(500).json({ error: "Failed to fetch user stats" });
  }
});

// ============================================================
// GUILD MANAGEMENT
// ============================================================

// Get all guilds with pagination
router.get("/guilds", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [guilds, total] = await Promise.all([
      Guild.find()
        .select({
          name: 1,
          realm: 1,
          region: 1,
          faction: 1,
          warcraftlogsId: 1,
          parent_guild: 1,
          isCurrentlyRaiding: 1,
          lastFetched: 1,
          createdAt: 1,
          "progress.raidId": 1,
          "progress.raidName": 1,
          "progress.difficulty": 1,
          "progress.bossesDefeated": 1,
          "progress.totalBosses": 1,
        })
        .sort({ lastFetched: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Guild.countDocuments(),
    ]);

    // Format guilds for response
    const formattedGuilds = guilds.map((guild) => ({
      id: guild._id,
      name: guild.name,
      realm: guild.realm,
      region: guild.region,
      faction: guild.faction,
      warcraftlogsId: guild.warcraftlogsId,
      parentGuild: guild.parent_guild,
      isCurrentlyRaiding: guild.isCurrentlyRaiding,
      lastFetched: guild.lastFetched,
      createdAt: guild.createdAt,
      progress: guild.progress?.map((p: any) => ({
        raidName: p.raidName,
        difficulty: p.difficulty,
        bossesDefeated: p.bossesDefeated,
        totalBosses: p.totalBosses,
      })),
    }));

    res.json({
      guilds: formattedGuilds,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Error fetching guilds:", error);
    res.status(500).json({ error: "Failed to fetch guilds" });
  }
});

// Get guild stats
router.get("/guilds/stats", async (req: Request, res: Response) => {
  try {
    const [total, currentlyRaiding, withWarcraftlogsId, factionCounts] = await Promise.all([
      Guild.countDocuments(),
      Guild.countDocuments({ isCurrentlyRaiding: true }),
      Guild.countDocuments({ warcraftlogsId: { $exists: true } }),
      Guild.aggregate([{ $group: { _id: "$faction", count: { $sum: 1 } } }]),
    ]);

    const factions: Record<string, number> = {};
    factionCounts.forEach((f: { _id: string; count: number }) => {
      factions[f._id || "unknown"] = f.count;
    });

    res.json({
      total,
      currentlyRaiding,
      withWarcraftlogsId,
      factions,
    });
  } catch (error) {
    logger.error("Error fetching guild stats:", error);
    res.status(500).json({ error: "Failed to fetch guild stats" });
  }
});

// ============================================================
// ANALYTICS (moved from public analytics routes)
// ============================================================

// Helper to format bytes to human readable
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Get overview stats (last 24 hours, 7 days, 30 days)
router.get("/analytics/overview", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [stats24h, stats7d, stats30d] = await Promise.all([
      HourlyStats.aggregate([
        { $match: { hour: { $gte: last24h } } },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: "$totalRequests" },
            totalResponseTime: { $sum: "$totalResponseTime" },
            totalDataTransferred: { $sum: "$totalDataTransferred" },
          },
        },
      ]),
      HourlyStats.aggregate([
        { $match: { hour: { $gte: last7d } } },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: "$totalRequests" },
            totalResponseTime: { $sum: "$totalResponseTime" },
            totalDataTransferred: { $sum: "$totalDataTransferred" },
          },
        },
      ]),
      HourlyStats.aggregate([
        { $match: { hour: { $gte: last30d } } },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: "$totalRequests" },
            totalResponseTime: { $sum: "$totalResponseTime" },
            totalDataTransferred: { $sum: "$totalDataTransferred" },
          },
        },
      ]),
    ]);

    const formatPeriodStats = (stats: Array<{ totalRequests: number; totalResponseTime: number; totalDataTransferred: number }>) => {
      if (!stats || stats.length === 0) {
        return { totalRequests: 0, avgResponseTime: 0, totalDataTransferred: 0, formattedData: "0 B" };
      }
      const s = stats[0];
      return {
        totalRequests: s.totalRequests || 0,
        avgResponseTime: s.totalRequests > 0 ? Math.round(s.totalResponseTime / s.totalRequests) : 0,
        totalDataTransferred: s.totalDataTransferred || 0,
        formattedData: formatBytes(s.totalDataTransferred || 0),
      };
    };

    res.json({
      last24Hours: formatPeriodStats(stats24h),
      last7Days: formatPeriodStats(stats7d),
      last30Days: formatPeriodStats(stats30d),
    });
  } catch (error) {
    logger.error("Error fetching analytics overview:", error);
    res.status(500).json({ error: "Failed to fetch analytics overview" });
  }
});

// Get daily breakdown
router.get("/analytics/daily", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const dailyStats = await HourlyStats.aggregate([
      { $match: { hour: { $gte: startDate } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$hour" },
          },
          totalRequests: { $sum: "$totalRequests" },
          totalResponseTime: { $sum: "$totalResponseTime" },
          totalDataTransferred: { $sum: "$totalDataTransferred" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const formatted = dailyStats.map((stat) => ({
      date: stat._id,
      requests: stat.totalRequests,
      avgResponseTime: stat.totalRequests > 0 ? Math.round(stat.totalResponseTime / stat.totalRequests) : 0,
      dataTransferred: stat.totalDataTransferred,
      formattedData: formatBytes(stat.totalDataTransferred),
    }));

    res.json(formatted);
  } catch (error) {
    logger.error("Error fetching daily analytics:", error);
    res.status(500).json({ error: "Failed to fetch daily analytics" });
  }
});

// Get endpoint statistics
router.get("/analytics/endpoints", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const endpointStats = await RequestLog.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: "$endpoint",
          count: { $sum: 1 },
          totalResponseTime: { $sum: "$responseTime" },
          avgResponseTime: { $avg: "$responseTime" },
          errorCount: { $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] } },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]);

    const formatted = endpointStats.map((stat) => ({
      endpoint: stat._id,
      count: stat.count,
      avgResponseTime: Math.round(stat.avgResponseTime),
      errorCount: stat.errorCount,
    }));

    res.json(formatted);
  } catch (error) {
    logger.error("Error fetching endpoint analytics:", error);
    res.status(500).json({ error: "Failed to fetch endpoint analytics" });
  }
});

// Get realtime stats
router.get("/analytics/realtime", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const currentHourStart = new Date(now);
    currentHourStart.setMinutes(0, 0, 0);

    const lastMinute = new Date(now.getTime() - 60 * 1000);

    const [currentHourStats, lastMinuteCount] = await Promise.all([
      HourlyStats.findOne({ hour: currentHourStart }),
      RequestLog.countDocuments({ timestamp: { $gte: lastMinute } }),
    ]);

    res.json({
      currentHour: {
        requests: currentHourStats?.totalRequests || 0,
        avgResponseTime: currentHourStats?.totalRequests ? Math.round(currentHourStats.totalResponseTime / currentHourStats.totalRequests) : 0,
        dataTransferred: formatBytes(currentHourStats?.totalDataTransferred || 0),
      },
      requestsPerMinute: lastMinuteCount,
    });
  } catch (error) {
    logger.error("Error fetching realtime analytics:", error);
    res.status(500).json({ error: "Failed to fetch realtime analytics" });
  }
});

// ============================================================
// DATABASE OVERVIEW
// ============================================================

// Get database overview
router.get("/overview", async (req: Request, res: Response) => {
  try {
    const [userCount, guildCount, recentLogins, recentGuildUpdates] = await Promise.all([
      User.countDocuments(),
      Guild.countDocuments(),
      User.countDocuments({
        lastLoginAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
      Guild.countDocuments({
        lastFetched: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    res.json({
      users: {
        total: userCount,
        activeToday: recentLogins,
      },
      guilds: {
        total: guildCount,
        updatedToday: recentGuildUpdates,
      },
    });
  } catch (error) {
    logger.error("Error fetching admin overview:", error);
    res.status(500).json({ error: "Failed to fetch overview" });
  }
});

// ============================================================
// PICKEM MANAGEMENT
// ============================================================

// Get all pickems (including inactive ones)
router.get("/pickems", async (req: Request, res: Response) => {
  try {
    const pickems = await pickemService.getAllPickems();
    const stats = await pickemService.getPickemStats();

    res.json({
      pickems,
      stats,
    });
  } catch (error) {
    logger.error("Error fetching pickems:", error);
    res.status(500).json({ error: "Failed to fetch pickems" });
  }
});

// Get a specific pickem by ID
router.get("/pickems/:pickemId", async (req: Request, res: Response) => {
  try {
    const { pickemId } = req.params;
    const pickem = await pickemService.getPickemById(pickemId);

    if (!pickem) {
      return res.status(404).json({ error: "Pickem not found" });
    }

    res.json(pickem);
  } catch (error) {
    logger.error("Error fetching pickem:", error);
    res.status(500).json({ error: "Failed to fetch pickem" });
  }
});

// Create a new pickem
router.post("/pickems", async (req: Request, res: Response) => {
  try {
    const { pickemId, name, raidIds, votingStart, votingEnd, active, scoringConfig, streakConfig, type, guildCount } = req.body;

    // Determine pickem type (default to 'regular' for backwards compatibility)
    const pickemType = type === "rwf" ? "rwf" : "regular";

    // Validate required fields (raidIds only required for regular pickems)
    if (!pickemId || !name || !votingStart || !votingEnd) {
      return res.status(400).json({
        error: "Missing required fields: pickemId, name, votingStart, votingEnd",
      });
    }

    // Validate raidIds for regular pickems
    if (pickemType === "regular") {
      if (!raidIds || !Array.isArray(raidIds) || raidIds.length === 0) {
        return res.status(400).json({ error: "raidIds must be a non-empty array for regular pickems" });
      }
    }

    // Validate pickemId format (alphanumeric with dashes)
    if (!/^[a-z0-9-]+$/.test(pickemId)) {
      return res.status(400).json({
        error: "pickemId must contain only lowercase letters, numbers, and dashes",
      });
    }

    // Validate dates
    const startDate = new Date(votingStart);
    const endDate = new Date(votingEnd);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }
    if (startDate >= endDate) {
      return res.status(400).json({ error: "votingEnd must be after votingStart" });
    }

    // Validate guildCount if provided
    const finalGuildCount = guildCount ?? (pickemType === "rwf" ? 5 : 10);
    if (typeof finalGuildCount !== "number" || finalGuildCount < 1 || finalGuildCount > 20) {
      return res.status(400).json({ error: "guildCount must be a number between 1 and 20" });
    }

    const pickem = await pickemService.createPickem({
      pickemId,
      name,
      raidIds: pickemType === "regular" ? raidIds : [],
      votingStart: startDate,
      votingEnd: endDate,
      active: active ?? true,
      scoringConfig,
      streakConfig,
      type: pickemType,
      guildCount: finalGuildCount,
    });

    res.status(201).json(pickem);
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "A pickem with this ID already exists" });
    }
    logger.error("Error creating pickem:", error);
    res.status(500).json({ error: "Failed to create pickem" });
  }
});

// Update an existing pickem
router.put("/pickems/:pickemId", async (req: Request, res: Response) => {
  try {
    const { pickemId } = req.params;
    const updates = req.body;

    // Don't allow changing the pickemId or type (type changes could break existing predictions)
    delete updates.pickemId;
    delete updates.type;

    // Validate dates if provided
    if (updates.votingStart) {
      updates.votingStart = new Date(updates.votingStart);
      if (isNaN(updates.votingStart.getTime())) {
        return res.status(400).json({ error: "Invalid votingStart date format" });
      }
    }
    if (updates.votingEnd) {
      updates.votingEnd = new Date(updates.votingEnd);
      if (isNaN(updates.votingEnd.getTime())) {
        return res.status(400).json({ error: "Invalid votingEnd date format" });
      }
    }

    // Validate guildCount if provided
    if (updates.guildCount !== undefined) {
      if (typeof updates.guildCount !== "number" || updates.guildCount < 1 || updates.guildCount > 20) {
        return res.status(400).json({ error: "guildCount must be a number between 1 and 20" });
      }
    }

    const pickem = await pickemService.updatePickem(pickemId, updates);

    if (!pickem) {
      return res.status(404).json({ error: "Pickem not found" });
    }

    res.json(pickem);
  } catch (error) {
    logger.error("Error updating pickem:", error);
    res.status(500).json({ error: "Failed to update pickem" });
  }
});

// Delete a pickem
router.delete("/pickems/:pickemId", async (req: Request, res: Response) => {
  try {
    const { pickemId } = req.params;
    const result = await pickemService.deletePickem(pickemId);

    if (!result) {
      return res.status(404).json({ error: "Pickem not found" });
    }

    res.json({ success: true, message: "Pickem deleted" });
  } catch (error) {
    logger.error("Error deleting pickem:", error);
    res.status(500).json({ error: "Failed to delete pickem" });
  }
});

// Toggle pickem active status
router.patch("/pickems/:pickemId/toggle", async (req: Request, res: Response) => {
  try {
    const { pickemId } = req.params;
    const pickem = await pickemService.getPickemById(pickemId);

    if (!pickem) {
      return res.status(404).json({ error: "Pickem not found" });
    }

    const updated = await pickemService.updatePickem(pickemId, { active: !pickem.active });
    res.json(updated);
  } catch (error) {
    logger.error("Error toggling pickem:", error);
    res.status(500).json({ error: "Failed to toggle pickem" });
  }
});

// Finalize an RWF pickem with final rankings
router.post("/pickems/:pickemId/finalize", async (req: Request, res: Response) => {
  try {
    const { pickemId } = req.params;
    const { finalRankings } = req.body;

    // Validate finalRankings is an array of strings
    if (!Array.isArray(finalRankings) || finalRankings.length === 0) {
      return res.status(400).json({ error: "finalRankings must be a non-empty array of guild names" });
    }

    if (!finalRankings.every((g: unknown) => typeof g === "string")) {
      return res.status(400).json({ error: "All items in finalRankings must be strings" });
    }

    const result = await pickemService.finalizeRwfPickem(pickemId, finalRankings);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, pickem: result.pickem });
  } catch (error) {
    logger.error("Error finalizing pickem:", error);
    res.status(500).json({ error: "Failed to finalize pickem" });
  }
});

// Unfinalize an RWF pickem (admin correction)
router.post("/pickems/:pickemId/unfinalize", async (req: Request, res: Response) => {
  try {
    const { pickemId } = req.params;

    const result = await pickemService.unfinalizeRwfPickem(pickemId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, pickem: result.pickem });
  } catch (error) {
    logger.error("Error unfinalizing pickem:", error);
    res.status(500).json({ error: "Failed to unfinalize pickem" });
  }
});

export default router;
