import { Router, Request, Response } from "express";
import { RequestLog, HourlyStats, DailyStats } from "../models/Analytics";
import logger from "../utils/logger";

const router = Router();

// Helper to format bytes to human readable
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Get overview stats (last 24 hours, 7 days, 30 days)
router.get("/overview", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Aggregate stats for different periods
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

// Get hourly breakdown for a specific date range
router.get("/hourly", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const hourlyStats = await HourlyStats.find({
      hour: { $gte: startDate },
    })
      .sort({ hour: 1 })
      .lean();

    const formatted = hourlyStats.map((stat) => ({
      hour: stat.hour,
      requests: stat.totalRequests,
      avgResponseTime: stat.totalRequests > 0 ? Math.round(stat.totalResponseTime / stat.totalRequests) : 0,
      dataTransferred: stat.totalDataTransferred,
      formattedData: formatBytes(stat.totalDataTransferred),
    }));

    res.json(formatted);
  } catch (error) {
    logger.error("Error fetching hourly analytics:", error);
    res.status(500).json({ error: "Failed to fetch hourly analytics" });
  }
});

// Get daily breakdown
router.get("/daily", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Aggregate hourly stats into daily
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

// Get top endpoints
router.get("/endpoints", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const limit = parseInt(req.query.limit as string) || 100; // Default to 100, allow fetching all
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const endpointStats = await RequestLog.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: "$endpoint",
          count: { $sum: 1 },
          avgResponseTime: { $avg: "$responseTime" },
          totalSize: { $sum: "$responseSize" },
          successCount: {
            $sum: { $cond: [{ $lt: ["$statusCode", 400] }, 1, 0] },
          },
          errorCount: {
            $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] },
          },
          methods: { $addToSet: "$method" },
          lastCalled: { $max: "$timestamp" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    const formatted = endpointStats.map((stat) => ({
      endpoint: stat._id,
      count: stat.count,
      avgResponseTime: Math.round(stat.avgResponseTime),
      totalSize: stat.totalSize,
      formattedSize: formatBytes(stat.totalSize),
      successRate: stat.count > 0 ? Math.round((stat.successCount / stat.count) * 100) : 0,
      errorCount: stat.errorCount,
      methods: stat.methods,
      lastCalled: stat.lastCalled,
    }));

    res.json(formatted);
  } catch (error) {
    logger.error("Error fetching endpoint analytics:", error);
    res.status(500).json({ error: "Failed to fetch endpoint analytics" });
  }
});

// Get status code distribution
router.get("/status-codes", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const statusStats = await RequestLog.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: "$statusCode",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const formatted = statusStats.map((stat) => ({
      statusCode: stat._id,
      count: stat.count,
    }));

    res.json(formatted);
  } catch (error) {
    logger.error("Error fetching status code analytics:", error);
    res.status(500).json({ error: "Failed to fetch status code analytics" });
  }
});

// Get recent requests (for debugging/live view)
router.get("/recent", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const recentLogs = await RequestLog.find().sort({ timestamp: -1 }).limit(limit).lean();

    const formatted = recentLogs.map((log) => ({
      endpoint: log.endpoint,
      method: log.method,
      statusCode: log.statusCode,
      responseTime: log.responseTime,
      responseSize: log.responseSize,
      formattedSize: formatBytes(log.responseSize),
      timestamp: log.timestamp,
    }));

    res.json(formatted);
  } catch (error) {
    logger.error("Error fetching recent requests:", error);
    res.status(500).json({ error: "Failed to fetch recent requests" });
  }
});

// Get real-time stats (current hour)
router.get("/realtime", async (req: Request, res: Response) => {
  try {
    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);

    const [hourlyData, recentRequests] = await Promise.all([
      HourlyStats.findOne({ hour: currentHour }).lean(),
      RequestLog.countDocuments({
        timestamp: { $gte: new Date(Date.now() - 60000) }, // Last minute
      }),
    ]);

    res.json({
      currentHour: hourlyData
        ? {
            requests: hourlyData.totalRequests,
            avgResponseTime: hourlyData.totalRequests > 0 ? Math.round(hourlyData.totalResponseTime / hourlyData.totalRequests) : 0,
            dataTransferred: formatBytes(hourlyData.totalDataTransferred),
          }
        : { requests: 0, avgResponseTime: 0, dataTransferred: "0 B" },
      requestsPerMinute: recentRequests,
    });
  } catch (error) {
    logger.error("Error fetching realtime analytics:", error);
    res.status(500).json({ error: "Failed to fetch realtime analytics" });
  }
});

// Get peak hours analysis (which hours of the day have most traffic)
router.get("/peak-hours", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const peakHours = await HourlyStats.aggregate([
      { $match: { hour: { $gte: startDate } } },
      {
        $group: {
          _id: { $hour: "$hour" },
          totalRequests: { $sum: "$totalRequests" },
          avgRequests: { $avg: "$totalRequests" },
          totalResponseTime: { $sum: "$totalResponseTime" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const formatted = peakHours.map((stat) => ({
      hour: stat._id,
      hourLabel: `${stat._id.toString().padStart(2, "0")}:00`,
      totalRequests: stat.totalRequests,
      avgRequests: Math.round(stat.avgRequests),
      avgResponseTime: stat.totalRequests > 0 ? Math.round(stat.totalResponseTime / stat.totalRequests) : 0,
    }));

    // Find peak hour
    const peak = formatted.reduce((max, h) => (h.avgRequests > max.avgRequests ? h : max), formatted[0] || { hour: 0, avgRequests: 0 });

    res.json({
      hours: formatted,
      peakHour: peak,
    });
  } catch (error) {
    logger.error("Error fetching peak hours analytics:", error);
    res.status(500).json({ error: "Failed to fetch peak hours analytics" });
  }
});

// Get traffic trends (compare periods)
router.get("/trends", async (req: Request, res: Response) => {
  try {
    const now = new Date();

    // Current week vs previous week
    const thisWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Today vs yesterday
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    const [thisWeek, lastWeek, today, yesterday] = await Promise.all([
      HourlyStats.aggregate([
        { $match: { hour: { $gte: thisWeekStart } } },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: "$totalRequests" },
            totalDataTransferred: { $sum: "$totalDataTransferred" },
          },
        },
      ]),
      HourlyStats.aggregate([
        { $match: { hour: { $gte: lastWeekStart, $lt: thisWeekStart } } },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: "$totalRequests" },
            totalDataTransferred: { $sum: "$totalDataTransferred" },
          },
        },
      ]),
      HourlyStats.aggregate([
        { $match: { hour: { $gte: todayStart } } },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: "$totalRequests" },
            totalDataTransferred: { $sum: "$totalDataTransferred" },
          },
        },
      ]),
      HourlyStats.aggregate([
        { $match: { hour: { $gte: yesterdayStart, $lt: todayStart } } },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: "$totalRequests" },
            totalDataTransferred: { $sum: "$totalDataTransferred" },
          },
        },
      ]),
    ]);

    const getStats = (arr: Array<{ totalRequests: number; totalDataTransferred: number }>) => arr[0] || { totalRequests: 0, totalDataTransferred: 0 };

    const thisWeekStats = getStats(thisWeek);
    const lastWeekStats = getStats(lastWeek);
    const todayStats = getStats(today);
    const yesterdayStats = getStats(yesterday);

    const calcChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    res.json({
      weekOverWeek: {
        current: thisWeekStats.totalRequests,
        previous: lastWeekStats.totalRequests,
        change: calcChange(thisWeekStats.totalRequests, lastWeekStats.totalRequests),
        dataChange: calcChange(thisWeekStats.totalDataTransferred, lastWeekStats.totalDataTransferred),
      },
      dayOverDay: {
        current: todayStats.totalRequests,
        previous: yesterdayStats.totalRequests,
        change: calcChange(todayStats.totalRequests, yesterdayStats.totalRequests),
        dataChange: calcChange(todayStats.totalDataTransferred, yesterdayStats.totalDataTransferred),
      },
    });
  } catch (error) {
    logger.error("Error fetching trends analytics:", error);
    res.status(500).json({ error: "Failed to fetch trends analytics" });
  }
});

// Get slowest endpoints (performance issues)
router.get("/slow-endpoints", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const threshold = parseInt(req.query.threshold as string) || 10; // Minimum requests to be considered
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const slowEndpoints = await RequestLog.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: "$endpoint",
          count: { $sum: 1 },
          avgResponseTime: { $avg: "$responseTime" },
          maxResponseTime: { $max: "$responseTime" },
          minResponseTime: { $min: "$responseTime" },
          responseTimes: { $push: "$responseTime" },
        },
      },
      { $match: { count: { $gte: threshold } } },
      { $sort: { avgResponseTime: -1 } },
      { $limit: 10 },
    ]);

    const formatted = slowEndpoints.map((stat) => {
      // Calculate p95 manually
      const sorted = (stat.responseTimes as number[]).sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      const p95 = sorted[p95Index] || stat.maxResponseTime;

      return {
        endpoint: stat._id,
        count: stat.count,
        avgResponseTime: Math.round(stat.avgResponseTime),
        maxResponseTime: stat.maxResponseTime,
        minResponseTime: stat.minResponseTime,
        p95ResponseTime: Math.round(p95),
      };
    });

    res.json(formatted);
  } catch (error) {
    logger.error("Error fetching slow endpoints:", error);
    res.status(500).json({ error: "Failed to fetch slow endpoints" });
  }
});

// Get error breakdown (which endpoints have errors)
router.get("/errors", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const errorStats = await RequestLog.aggregate([
      { $match: { timestamp: { $gte: startDate }, statusCode: { $gte: 400 } } },
      {
        $group: {
          _id: { endpoint: "$endpoint", statusCode: "$statusCode" },
          count: { $sum: 1 },
          lastOccurred: { $max: "$timestamp" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]);

    const formatted = errorStats.map((stat) => ({
      endpoint: stat._id.endpoint,
      statusCode: stat._id.statusCode,
      count: stat.count,
      lastOccurred: stat.lastOccurred,
    }));

    // Group by endpoint for summary
    const byEndpoint = new Map<string, { total: number; codes: Record<number, number> }>();
    for (const err of formatted) {
      if (!byEndpoint.has(err.endpoint)) {
        byEndpoint.set(err.endpoint, { total: 0, codes: {} });
      }
      const entry = byEndpoint.get(err.endpoint)!;
      entry.total += err.count;
      entry.codes[err.statusCode] = (entry.codes[err.statusCode] || 0) + err.count;
    }

    const summary = Array.from(byEndpoint.entries())
      .map(([endpoint, data]) => ({
        endpoint,
        totalErrors: data.total,
        statusCodes: data.codes,
      }))
      .sort((a, b) => b.totalErrors - a.totalErrors);

    res.json({
      details: formatted,
      summary,
    });
  } catch (error) {
    logger.error("Error fetching error analytics:", error);
    res.status(500).json({ error: "Failed to fetch error analytics" });
  }
});

export default router;
