import { Router, Request, Response } from "express";
import Guild from "../models/Guild";
import User, { IPickemEntry, IPickemPrediction } from "../models/User";
import discordService from "../services/discord.service";
import { PICKEMS_CONFIG, calculatePickemPoints, DIFFICULTIES } from "../config/guilds";
import logger from "../utils/logger";

const router = Router();

// Helper to get user from session
async function getUserFromSession(req: Request) {
  const sessionId = req.cookies?.session;
  if (!sessionId) return null;
  return discordService.getUserFromSession(sessionId);
}

// Get all available pickems with their status
router.get("/", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const pickems = PICKEMS_CONFIG.filter((p) => p.active).map((p) => ({
      id: p.id,
      name: p.name,
      raidIds: p.raidIds,
      votingStart: p.votingStart,
      votingEnd: p.votingEnd,
      isVotingOpen: now >= p.votingStart && now <= p.votingEnd,
      hasEnded: now > p.votingEnd,
    }));

    res.json(pickems);
  } catch (error) {
    logger.error("Error fetching pickems:", error);
    res.status(500).json({ error: "Failed to fetch pickems" });
  }
});

// Get simple guild list for autocomplete (just name and realm)
router.get("/guilds", async (req: Request, res: Response) => {
  try {
    const guilds = await Guild.find({}, { name: 1, realm: 1, _id: 0 }).lean();
    res.json(guilds);
  } catch (error) {
    logger.error("Error fetching guilds for pickems:", error);
    res.status(500).json({ error: "Failed to fetch guilds" });
  }
});

// Get a specific pickem with leaderboard and user's predictions
router.get("/:pickemId", async (req: Request, res: Response) => {
  try {
    const { pickemId } = req.params;
    const pickem = PICKEMS_CONFIG.find((p) => p.id === pickemId && p.active);

    if (!pickem) {
      return res.status(404).json({ error: "Pickem not found" });
    }

    const now = new Date();
    const isVotingOpen = now >= pickem.votingStart && now <= pickem.votingEnd;
    const hasEnded = now > pickem.votingEnd;

    // Get actual guild rankings based on mythic progress for the raid(s)
    const guildRankings = await getGuildRankingsForPickem(pickem.raidIds);

    // Get user's predictions if logged in
    let userPredictions: IPickemPrediction[] | null = null;
    const user = await getUserFromSession(req);
    if (user) {
      const entry = user.pickems?.find((p: IPickemEntry) => p.pickemId === pickemId);
      if (entry) {
        userPredictions = entry.predictions;
      }
    }

    // Get leaderboard (all users' scores for this pickem)
    const leaderboard = await getPickemLeaderboard(pickemId, guildRankings);

    res.json({
      id: pickem.id,
      name: pickem.name,
      raidIds: pickem.raidIds,
      votingStart: pickem.votingStart,
      votingEnd: pickem.votingEnd,
      isVotingOpen,
      hasEnded,
      guildRankings, // Current actual rankings
      userPredictions, // User's predictions (if logged in)
      leaderboard, // Scoreboard of all participants
    });
  } catch (error) {
    logger.error("Error fetching pickem details:", error);
    res.status(500).json({ error: "Failed to fetch pickem details" });
  }
});

// Submit or update predictions for a pickem
router.post("/:pickemId/predict", async (req: Request, res: Response) => {
  try {
    const { pickemId } = req.params;
    const { predictions } = req.body as { predictions: IPickemPrediction[] };

    // Validate user is logged in
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Validate pickem exists and voting is open
    const pickem = PICKEMS_CONFIG.find((p) => p.id === pickemId && p.active);
    if (!pickem) {
      return res.status(404).json({ error: "Pickem not found" });
    }

    const now = new Date();
    if (now < pickem.votingStart || now > pickem.votingEnd) {
      return res.status(400).json({ error: "Voting is not open for this pickem" });
    }

    // Validate predictions
    if (!predictions || !Array.isArray(predictions) || predictions.length !== 10) {
      return res.status(400).json({ error: "Must provide exactly 10 predictions" });
    }

    // Validate each prediction has required fields and positions are 1-10
    const positions = new Set<number>();
    for (const pred of predictions) {
      if (!pred.guildName || !pred.realm || !pred.position) {
        return res.status(400).json({ error: "Each prediction must have guildName, realm, and position" });
      }
      if (pred.position < 1 || pred.position > 10) {
        return res.status(400).json({ error: "Position must be between 1 and 10" });
      }
      if (positions.has(pred.position)) {
        return res.status(400).json({ error: "Each position must be unique" });
      }
      positions.add(pred.position);
    }

    // Validate guilds exist
    for (const pred of predictions) {
      const guild = await Guild.findOne({ name: pred.guildName, realm: pred.realm });
      if (!guild) {
        return res.status(400).json({ error: `Guild "${pred.guildName}" on "${pred.realm}" not found` });
      }
    }

    // Update or create the pickem entry
    const existingEntryIndex = user.pickems?.findIndex((p: IPickemEntry) => p.pickemId === pickemId) ?? -1;

    if (existingEntryIndex >= 0) {
      // Update existing entry
      user.pickems[existingEntryIndex].predictions = predictions;
      user.pickems[existingEntryIndex].updatedAt = new Date();
    } else {
      // Create new entry
      if (!user.pickems) {
        user.pickems = [];
      }
      user.pickems.push({
        pickemId,
        predictions,
        submittedAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await user.save();

    res.json({
      success: true,
      message: existingEntryIndex >= 0 ? "Predictions updated" : "Predictions submitted",
    });
  } catch (error) {
    logger.error("Error submitting predictions:", error);
    res.status(500).json({ error: "Failed to submit predictions" });
  }
});

// Helper function to get guild rankings for a pickem's raids
async function getGuildRankingsForPickem(raidIds: number[]) {
  // Get all guilds with their progress for the specified raids
  const guilds = await Guild.find({}).lean();

  // Calculate completion status for each guild
  // A guild's rank is determined by:
  // 1. Total mythic bosses killed across all raids
  // 2. Time of last kill (earlier = better rank)
  const guildProgress: {
    name: string;
    realm: string;
    totalBossesKilled: number;
    totalBosses: number;
    lastKillTime: Date | null;
    isComplete: boolean;
  }[] = [];

  for (const guild of guilds) {
    let totalKilled = 0;
    let totalBosses = 0;
    let lastKillTime: Date | null = null;

    for (const raidId of raidIds) {
      const raidProgress = guild.progress?.find((p: { raidId: number; difficulty: string }) => p.raidId === raidId && p.difficulty === "mythic");
      if (raidProgress) {
        totalKilled += raidProgress.bossesDefeated || 0;
        totalBosses += raidProgress.totalBosses || 0;

        // Find the latest kill time among all bosses
        for (const boss of raidProgress.bosses || []) {
          if (boss.firstKillTime) {
            const killTime = new Date(boss.firstKillTime);
            if (!lastKillTime || killTime > lastKillTime) {
              lastKillTime = killTime;
            }
          }
        }
      }
    }

    guildProgress.push({
      name: guild.name,
      realm: guild.realm,
      totalBossesKilled: totalKilled,
      totalBosses,
      lastKillTime,
      isComplete: totalKilled === totalBosses && totalBosses > 0,
    });
  }

  // Sort guilds by:
  // 1. Total bosses killed (descending)
  // 2. Last kill time (ascending - earlier is better)
  guildProgress.sort((a, b) => {
    if (b.totalBossesKilled !== a.totalBossesKilled) {
      return b.totalBossesKilled - a.totalBossesKilled;
    }
    // If same number of kills, earlier completion time wins
    if (a.lastKillTime && b.lastKillTime) {
      return a.lastKillTime.getTime() - b.lastKillTime.getTime();
    }
    // Guilds with kill times rank higher than those without
    if (a.lastKillTime && !b.lastKillTime) return -1;
    if (!a.lastKillTime && b.lastKillTime) return 1;
    return 0;
  });

  // Return top guilds with their rank
  return guildProgress.slice(0, 50).map((g, index) => ({
    rank: index + 1,
    name: g.name,
    realm: g.realm,
    bossesKilled: g.totalBossesKilled,
    totalBosses: g.totalBosses,
    isComplete: g.isComplete,
    lastKillTime: g.lastKillTime,
  }));
}

// Helper function to get pickem leaderboard
async function getPickemLeaderboard(pickemId: string, guildRankings: { rank: number; name: string; realm: string }[]) {
  // Get all users who have made predictions for this pickem
  const users = await User.find({ "pickems.pickemId": pickemId }).lean();

  // Create a map of guild -> actual rank for quick lookup
  const actualRankMap = new Map<string, number>();
  guildRankings.forEach((g) => {
    actualRankMap.set(`${g.name}-${g.realm}`, g.rank);
  });

  // Calculate scores for each user
  const leaderboard: {
    username: string;
    avatarUrl: string;
    totalPoints: number;
    predictions: {
      guildName: string;
      realm: string;
      predictedRank: number;
      actualRank: number | null;
      points: number;
    }[];
  }[] = [];

  for (const user of users) {
    const entry = user.pickems?.find((p: IPickemEntry) => p.pickemId === pickemId);
    if (!entry) continue;

    let totalPoints = 0;
    const predictionResults = [];

    for (const pred of entry.predictions) {
      const key = `${pred.guildName}-${pred.realm}`;
      const actualRank = actualRankMap.get(key) ?? null;

      // Only award points if guild is in top 50 (has a rank)
      const points = actualRank !== null ? calculatePickemPoints(pred.position, actualRank) : 0;
      totalPoints += points;

      predictionResults.push({
        guildName: pred.guildName,
        realm: pred.realm,
        predictedRank: pred.position,
        actualRank,
        points,
      });
    }

    // Sort predictions by predicted rank
    predictionResults.sort((a, b) => a.predictedRank - b.predictedRank);

    leaderboard.push({
      username: user.discord.username,
      avatarUrl: discordService.getAvatarUrl(user.discord.id, user.discord.avatar),
      totalPoints,
      predictions: predictionResults,
    });
  }

  // Sort leaderboard by total points (descending)
  leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);

  return leaderboard;
}

export default router;
