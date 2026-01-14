import { Request, Response, NextFunction } from "express";
import discordService from "../services/discord.service";
import logger from "../utils/logger";

/**
 * Middleware to require admin authentication
 * Checks if the logged-in user is an admin based on ADMIN_DISCORD_NAMES env var
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await discordService.getUserFromSession(userId);

    if (!user) {
      return res.status(401).json({ error: "Session expired" });
    }

    if (!discordService.isAdmin(user.discord.username)) {
      logger.warn(`Unauthorized admin access attempt by user: ${user.discord.username}`);
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    // Attach user to request for downstream handlers
    (req as any).user = user;
    next();
  } catch (error) {
    logger.error("Error in admin middleware:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
