import { Router, Request, Response } from "express";
import Guild from "../models/Guild";
import User, { IPickemEntry, IPickemPrediction } from "../models/User";
import { calculatePickemPoints, calculateStreakBonus, IPickem } from "../models/Pickem";
import discordService from "../services/discord.service";
import pickemService from "../services/pickem.service";
import { PICK_EM_RWF_GUILDS } from "../config/guilds";
import { cacheMiddleware } from "../middleware/cache.middleware";
import logger from "../utils/logger";

const router = Router();

// In-memory cache for expensive pickem computations (guild rankings & leaderboard)
interface PickemCacheEntry {
  guildRankings: { data: any[]; expiresAt: number } | null;
  leaderboard: { data: any[]; expiresAt: number } | null;
}
const pickemComputationCache = new Map<string, PickemCacheEntry>();
const RANKINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const LEADERBOARD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedOrCompute<T>(
  cache: Map<string, PickemCacheEntry>,
  key: string,
  field: "guildRankings" | "leaderboard",
  ttl: number,
  compute: () => Promise<T>,
): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry[field] && entry[field]!.expiresAt > Date.now()) {
    return entry[field]!.data as T;
  }
  const data = await compute();
  if (!cache.has(key)) {
    cache.set(key, { guildRankings: null, leaderboard: null });
  }
  cache.get(key)![field] = { data: data as any, expiresAt: Date.now() + ttl };
  return data;
}

// Helper to get user from session (updated for express-session)
async function getUserFromSession(req: Request) {
  const userId = req.session.userId;
  if (!userId) return null;
  return discordService.getUserFromSession(userId);
}

// Rate limit: max 10 prediction submissions per minute per session
const PREDICT_RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();

function checkPredictRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const entry = PREDICT_RATE_LIMIT.get(sessionId);
  if (!entry || now > entry.resetAt) {
    PREDICT_RATE_LIMIT.set(sessionId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  entry.count++;
  return entry.count <= 10;
}

// Get all available pickems with their status
router.get(
  "/",
  cacheMiddleware(
    (req) => "pickems:list",
    () => 2 * 60 * 1000,
  ),
  async (req: Request, res: Response) => {
    try {
      const now = new Date();
      const pickems = await pickemService.getActivePickems();

      const result = pickems.map((p) => ({
        id: p.pickemId,
        name: p.name,
        type: p.type || "regular",
        raidIds: p.raidIds,
        guildCount: p.guildCount || (p.type === "rwf" ? 5 : 10),
        votingStart: p.votingStart,
        votingEnd: p.votingEnd,
        isVotingOpen: now >= new Date(p.votingStart) && now <= new Date(p.votingEnd),
        hasEnded: now > new Date(p.votingEnd),
        // RWF finalization status
        finalized: p.finalized ?? false,
        finalRankings: p.finalRankings ?? [],
        finalizedAt: p.finalizedAt ?? null,
        scoringConfig: p.scoringConfig,
        streakConfig: p.streakConfig,
        prizeConfig: p.prizeConfig,
      }));

      res.json(result);
    } catch (error) {
      logger.error("Error fetching pickems:", error);
      res.status(500).json({ error: "Failed to fetch pickems" });
    }
  },
);

// Get simple guild list for autocomplete (just name and realm) - for regular pickems
// Only returns parent guilds (guilds without parent_guild set).
// Child guilds are represented by their parent in pickems — their progress contributes to the parent's ranking.
router.get(
  "/guilds",
  cacheMiddleware(
    (req) => "pickems:guilds",
    () => 30 * 60 * 1000,
  ),
  async (req: Request, res: Response) => {
    try {
      const guilds = await Guild.find({ $or: [{ parent_guild: null }, { parent_guild: "" }, { parent_guild: { $exists: false } }] }, { name: 1, realm: 1, _id: 0 }).lean();
      res.json(guilds);
    } catch (error) {
      logger.error("Error fetching guilds for pickems:", error);
      res.status(500).json({ error: "Failed to fetch guilds" });
    }
  },
);

// Get RWF guild list for autocomplete - for RWF pickems (Race to World First)
router.get(
  "/guilds/rwf",
  cacheMiddleware(
    (req) => "pickems:guilds:rwf",
    () => 60 * 60 * 1000,
  ),
  async (req: Request, res: Response) => {
    try {
      // Return RWF guilds as simple objects with name only (no realm for RWF guilds)
      const guilds = PICK_EM_RWF_GUILDS.map((name) => ({ name, realm: "RWF" }));
      res.json(guilds);
    } catch (error) {
      logger.error("Error fetching RWF guilds for pickems:", error);
      res.status(500).json({ error: "Failed to fetch RWF guilds" });
    }
  },
);

// Get a specific pickem with leaderboard and user's predictions
router.get("/:pickemId", async (req: Request, res: Response) => {
  try {
    const { pickemId } = req.params;
    const pickem = await pickemService.getPickemById(pickemId);

    if (!pickem || !pickem.active) {
      return res.status(404).json({ error: "Pickem not found" });
    }

    const now = new Date();
    const isVotingOpen = now >= new Date(pickem.votingStart) && now <= new Date(pickem.votingEnd);
    const hasEnded = now > new Date(pickem.votingEnd);

    const pickemType = pickem.type || "regular";
    const guildCount = pickem.guildCount || (pickemType === "rwf" ? 5 : 10);

    // Get actual guild rankings based on pickem type
    let guildRankings: { rank: number; name: string; realm: string; bossesKilled?: number; totalBosses?: number; isComplete?: boolean; lastKillTime?: Date | null }[];

    if (pickemType === "rwf") {
      // For RWF pickems, check if finalized - use finalRankings, otherwise show unranked guilds
      if (pickem.finalized && pickem.finalRankings && pickem.finalRankings.length > 0) {
        // Use the manually set final rankings
        guildRankings = pickem.finalRankings.map((name, index) => ({
          rank: index + 1,
          name,
          realm: "RWF",
        }));
      } else {
        // Not finalized yet - return guilds in config order without actual rankings
        // These are just for display/prediction purposes, not for scoring
        guildRankings = PICK_EM_RWF_GUILDS.map((name, index) => ({
          rank: index + 1, // Placeholder rank (not used for scoring until finalized)
          name,
          realm: "RWF",
        }));
      }
    } else {
      // For regular pickems, get rankings from guild progress (cached for 5 min)
      guildRankings = await getCachedOrCompute(pickemComputationCache, `rankings:${pickemId}`, "guildRankings", RANKINGS_CACHE_TTL, () =>
        getGuildRankingsForPickem(pickem.raidIds),
      );
    }

    // Get user's predictions if logged in
    let userPredictions: IPickemPrediction[] | null = null;
    const user = await getUserFromSession(req);
    if (user) {
      const entry = user.pickems?.find((p: IPickemEntry) => p.pickemId === pickemId);
      if (entry) {
        userPredictions = entry.predictions;
      }
    }

    // Get leaderboard (all users' scores for this pickem, cached for 5 min)
    const leaderboard = await getCachedOrCompute(pickemComputationCache, `leaderboard:${pickemId}`, "leaderboard", LEADERBOARD_CACHE_TTL, () =>
      getPickemLeaderboard(pickemId, guildRankings, pickem),
    );

    // Hide prediction details while voting is open to prevent copying strategies
    const sanitizedLeaderboard = isVotingOpen
      ? leaderboard.map((entry: any) => ({
          ...entry,
          predictions: entry.predictions.map((p: any) => ({
            ...p,
            guildName: "Hidden",
            realm: "",
          })),
        }))
      : leaderboard;

    res.json({
      id: pickem.pickemId,
      name: pickem.name,
      type: pickemType,
      raidIds: pickem.raidIds,
      guildCount,
      votingStart: pickem.votingStart,
      votingEnd: pickem.votingEnd,
      isVotingOpen,
      hasEnded,
      // RWF finalization status
      finalized: pickem.finalized ?? false,
      finalRankings: pickem.finalRankings ?? [],
      finalizedAt: pickem.finalizedAt ?? null,
      scoringConfig: pickem.scoringConfig,
      streakConfig: pickem.streakConfig,
      prizeConfig: pickem.prizeConfig,
      guildRankings,
      userPredictions,
      leaderboard: sanitizedLeaderboard,
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

    // Rate limit prediction submissions
    const sessionId = req.session?.id || req.ip || "unknown";
    if (!checkPredictRateLimit(sessionId)) {
      return res.status(429).json({ error: "Too many requests. Please wait a moment before trying again." });
    }

    // Validate user is logged in
    const user = await getUserFromSession(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Validate pickem exists and voting is open
    const pickem = await pickemService.getPickemById(pickemId);
    if (!pickem || !pickem.active) {
      return res.status(404).json({ error: "Pickem not found" });
    }

    const now = new Date();
    if (now < new Date(pickem.votingStart) || now > new Date(pickem.votingEnd)) {
      return res.status(400).json({ error: "Voting is not open for this pickem" });
    }

    const pickemType = pickem.type || "regular";
    const guildCount = pickem.guildCount || (pickemType === "rwf" ? 5 : 10);

    // Validate predictions count matches pickem's guildCount
    if (!predictions || !Array.isArray(predictions) || predictions.length !== guildCount) {
      return res.status(400).json({ error: `Must provide exactly ${guildCount} predictions` });
    }

    // Sanitize and validate string inputs
    for (const pred of predictions) {
      if (typeof pred.guildName !== "string" || typeof pred.realm !== "string") {
        return res.status(400).json({ error: "Invalid prediction data types" });
      }
      pred.guildName = pred.guildName.trim();
      pred.realm = pred.realm.trim();
      if (pred.guildName.length === 0 || pred.guildName.length > 100) {
        return res.status(400).json({ error: "Invalid guild name length" });
      }
      if (pred.realm.length === 0 || pred.realm.length > 100) {
        return res.status(400).json({ error: "Invalid realm name length" });
      }
    }

    // Validate each prediction has required fields and positions are valid
    const positions = new Set<number>();
    for (const pred of predictions) {
      if (!pred.guildName || !pred.realm || !pred.position) {
        return res.status(400).json({ error: "Each prediction must have guildName, realm, and position" });
      }
      if (pred.position < 1 || pred.position > guildCount) {
        return res.status(400).json({ error: `Position must be between 1 and ${guildCount}` });
      }
      if (positions.has(pred.position)) {
        return res.status(400).json({ error: "Each position must be unique" });
      }
      positions.add(pred.position);
    }

    // Validate no duplicate guilds
    const guildKeys = new Set<string>();
    for (const pred of predictions) {
      const key = `${pred.guildName}-${pred.realm}`;
      if (guildKeys.has(key)) {
        return res.status(400).json({ error: "Each guild must be unique in your predictions" });
      }
      guildKeys.add(key);
    }

    // Validate guilds based on pickem type
    if (pickemType === "rwf") {
      // For RWF pickems, validate against PICK_EM_RWF_GUILDS
      for (const pred of predictions) {
        if (!PICK_EM_RWF_GUILDS.includes(pred.guildName)) {
          return res.status(400).json({ error: `Guild "${pred.guildName}" is not a valid RWF guild` });
        }
        // RWF guilds should have "RWF" as realm
        if (pred.realm !== "RWF") {
          return res.status(400).json({ error: `RWF guild "${pred.guildName}" must have realm "RWF"` });
        }
      }
    } else {
      // Batch validate all guilds in a single query — only accept parent guilds (no parent_guild set)
      const guildQueries = predictions.map((p) => ({ name: p.guildName, realm: p.realm }));
      const foundGuilds = await Guild.find({ $or: guildQueries }, { name: 1, realm: 1, parent_guild: 1 }).lean();
      const foundGuildMap = new Map(foundGuilds.map((g) => [`${g.name}-${g.realm}`, g]));
      for (const pred of predictions) {
        const key = `${pred.guildName}-${pred.realm}`;
        const guild = foundGuildMap.get(key);
        if (!guild) {
          return res.status(400).json({ error: `Guild "${pred.guildName}" on "${pred.realm}" not found` });
        }
        if (guild.parent_guild) {
          return res.status(400).json({ error: `Guild "${pred.guildName}" is a sub-guild of "${guild.parent_guild}". Please pick the parent guild instead.` });
        }
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

    // Invalidate leaderboard cache so new prediction shows up
    pickemComputationCache.delete(`leaderboard:${pickemId}`);

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
// Consolidates parent/child guilds: child guild progress is attributed to the parent guild,
// and only the best-performing member of each guild family appears in the rankings.
async function getGuildRankingsForPickem(raidIds: number[]) {
  // Get all guilds with their progress and parent_guild field
  const guilds = await Guild.find({}, { name: 1, realm: 1, parent_guild: 1, progress: 1 }).lean();

  // Build a map of parent guild name -> parent guild (name, realm)
  // A "parent guild" is any guild that has no parent_guild set AND has at least one child pointing to it
  // For guilds without parent/child relationships, they are standalone and ranked individually
  const childToParentName = new Map<string, string>(); // child "name-realm" -> parent guild name
  const parentGuildInfo = new Map<string, { name: string; realm: string }>(); // parent name -> { name, realm }

  for (const guild of guilds) {
    if (guild.parent_guild) {
      childToParentName.set(`${guild.name}-${guild.realm}`, guild.parent_guild);
    }
  }

  // Resolve parent guild info (name + realm) from the DB entries
  for (const guild of guilds) {
    if (!guild.parent_guild) {
      // This guild could be a parent — check if any child references it by name
      const isParent = Array.from(childToParentName.values()).includes(guild.name);
      if (isParent) {
        parentGuildInfo.set(guild.name, { name: guild.name, realm: guild.realm });
      }
    }
  }

  // Calculate progress for every guild individually first
  interface GuildProgressEntry {
    name: string;
    realm: string;
    parentName: string | null; // null = standalone or is the parent itself
    totalBossesKilled: number;
    totalBosses: number;
    lastKillTime: Date | null;
    isComplete: boolean;
  }

  const allProgress: GuildProgressEntry[] = [];

  for (const guild of guilds) {
    let totalKilled = 0;
    let totalBosses = 0;
    let lastKillTime: Date | null = null;

    for (const raidId of raidIds) {
      const raidProgress = guild.progress?.find((p: { raidId: number; difficulty: string }) => p.raidId === raidId && p.difficulty === "mythic");
      if (raidProgress) {
        totalKilled += raidProgress.bossesDefeated || 0;
        totalBosses += raidProgress.totalBosses || 0;

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

    const parentName = childToParentName.get(`${guild.name}-${guild.realm}`) ?? null;

    allProgress.push({
      name: guild.name,
      realm: guild.realm,
      parentName,
      totalBossesKilled: totalKilled,
      totalBosses,
      lastKillTime,
      isComplete: totalKilled === totalBosses && totalBosses > 0,
    });
  }

  // Group guilds into families: parent guild name -> all members (parent + children)
  // Guilds without parent/child relationships are standalone families
  const guildFamilies = new Map<string, GuildProgressEntry[]>();

  for (const entry of allProgress) {
    if (entry.parentName) {
      // This is a child guild — group under parent name
      const familyKey = entry.parentName;
      if (!guildFamilies.has(familyKey)) {
        guildFamilies.set(familyKey, []);
      }
      guildFamilies.get(familyKey)!.push(entry);
    } else if (parentGuildInfo.has(entry.name)) {
      // This is a parent guild — group under its own name
      const familyKey = entry.name;
      if (!guildFamilies.has(familyKey)) {
        guildFamilies.set(familyKey, []);
      }
      guildFamilies.get(familyKey)!.push(entry);
    } else {
      // Standalone guild (no parent/child relationship) — use unique key
      const familyKey = `${entry.name}-${entry.realm}`;
      guildFamilies.set(familyKey, [entry]);
    }
  }

  // For each family, pick the best-performing member
  // The representative uses the parent guild's name+realm (or own name for standalone)
  const consolidatedProgress: {
    name: string;
    realm: string;
    totalBossesKilled: number;
    totalBosses: number;
    lastKillTime: Date | null;
    isComplete: boolean;
  }[] = [];

  for (const [familyKey, members] of guildFamilies) {
    // Sort members: most bosses killed desc, then earliest last kill time asc
    members.sort((a, b) => {
      if (b.totalBossesKilled !== a.totalBossesKilled) {
        return b.totalBossesKilled - a.totalBossesKilled;
      }
      if (a.lastKillTime && b.lastKillTime) {
        return a.lastKillTime.getTime() - b.lastKillTime.getTime();
      }
      if (a.lastKillTime && !b.lastKillTime) return -1;
      if (!a.lastKillTime && b.lastKillTime) return 1;
      return 0;
    });

    const best = members[0];
    const parent = parentGuildInfo.get(familyKey);

    consolidatedProgress.push({
      // Use parent guild identity if this is a guild family, otherwise use the guild's own identity
      name: parent ? parent.name : best.name,
      realm: parent ? parent.realm : best.realm,
      totalBossesKilled: best.totalBossesKilled,
      totalBosses: best.totalBosses,
      lastKillTime: best.lastKillTime,
      isComplete: best.isComplete,
    });
  }

  // Sort consolidated guilds by:
  // 1. Total bosses killed (descending)
  // 2. Last kill time (ascending - earlier is better)
  consolidatedProgress.sort((a, b) => {
    if (b.totalBossesKilled !== a.totalBossesKilled) {
      return b.totalBossesKilled - a.totalBossesKilled;
    }
    if (a.lastKillTime && b.lastKillTime) {
      return a.lastKillTime.getTime() - b.lastKillTime.getTime();
    }
    if (a.lastKillTime && !b.lastKillTime) return -1;
    if (!a.lastKillTime && b.lastKillTime) return 1;
    return 0;
  });

  // Return top guilds with their rank
  return consolidatedProgress.slice(0, 50).map((g, index) => ({
    rank: index + 1,
    name: g.name,
    realm: g.realm,
    bossesKilled: g.totalBossesKilled,
    totalBosses: g.totalBosses,
    isComplete: g.isComplete,
    lastKillTime: g.lastKillTime,
  }));
}

// Helper function to get pickem leaderboard with streak bonuses
async function getPickemLeaderboard(pickemId: string, guildRankings: { rank: number; name: string; realm: string }[], pickem: IPickem) {
  // Get all users who have made predictions for this pickem
  const users = await User.find({ "pickems.pickemId": pickemId }).lean();

  // Create a map of guild -> actual rank for quick lookup
  const actualRankMap = new Map<string, number>();
  guildRankings.forEach((g) => {
    actualRankMap.set(`${g.name}-${g.realm}`, g.rank);
  });

  // For unfinalized RWF pickems, don't calculate scores - everyone gets 0
  const isUnfinalizedRwf = pickem.type === "rwf" && !pickem.finalized;

  // Calculate scores for each user
  const leaderboard: {
    username: string;
    avatarUrl: string;
    totalPoints: number;
    positionPoints: number;
    streakBonus: number;
    streaks: { length: number; guilds: string[] }[];
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

    let positionPoints = 0;
    const predictionResults: {
      guildName: string;
      realm: string;
      predictedRank: number;
      actualRank: number | null;
      points: number;
    }[] = [];

    for (const pred of entry.predictions) {
      const key = `${pred.guildName}-${pred.realm}`;
      const actualRank = actualRankMap.get(key) ?? null;

      // Only award points if guild is in top 50 (has a rank)
      const points = actualRank !== null && !isUnfinalizedRwf ? calculatePickemPoints(pred.position, actualRank, pickem.scoringConfig) : 0;
      positionPoints += points;

      predictionResults.push({
        guildName: pred.guildName,
        realm: pred.realm,
        predictedRank: pred.position,
        actualRank,
        points,
      });
    }

    // Calculate streak bonus (skip for unfinalized RWF)
    const { totalBonus: streakBonus, streaks } = isUnfinalizedRwf ? { totalBonus: 0, streaks: [] } : calculateStreakBonus(predictionResults, pickem.streakConfig);

    // Sort predictions by predicted rank
    predictionResults.sort((a, b) => a.predictedRank - b.predictedRank);

    leaderboard.push({
      username: user.discord.username,
      avatarUrl: discordService.getAvatarUrl(user.discord.id, user.discord.avatar),
      totalPoints: positionPoints + streakBonus,
      positionPoints,
      streakBonus,
      streaks,
      predictions: predictionResults,
    });
  }

  // Sort leaderboard by total points (descending)
  leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);

  return leaderboard;
}

export default router;
