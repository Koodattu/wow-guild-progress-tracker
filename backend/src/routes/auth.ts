import { Router, Request, Response } from "express";
import discordService from "../services/discord.service";
import logger from "../utils/logger";

const router = Router();

// Get Discord OAuth authorization URL
router.get("/discord/login", (req: Request, res: Response) => {
  try {
    const authUrl = discordService.getAuthorizationUrl();
    res.json({ url: authUrl });
  } catch (error) {
    logger.error("Error generating Discord auth URL:", error);
    res.status(500).json({ error: "Failed to generate authorization URL" });
  }
});

// Discord OAuth callback
router.get("/discord/callback", async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== "string") {
      logger.warn("Discord callback missing code parameter");
      return res.redirect(getFrontendUrl() + "?error=missing_code");
    }

    // Exchange code for tokens
    const tokens = await discordService.exchangeCode(code);

    // Get user info from Discord
    const discordUser = await discordService.getUserInfo(tokens.access_token);

    // Find or create user in database
    const user = await discordService.findOrCreateUser(discordUser, tokens);

    // Create session
    const sessionId = discordService.createSession(user._id.toString());

    // Redirect to frontend with session cookie
    const frontendUrl = getFrontendUrl();

    // Set cookie and redirect
    res.cookie("session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });

    res.redirect(frontendUrl + "/profile");
  } catch (error) {
    logger.error("Error in Discord OAuth callback:", error);
    res.redirect(getFrontendUrl() + "?error=auth_failed");
  }
});

// Get current user
router.get("/me", async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session;

    if (!sessionId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await discordService.getUserFromSession(sessionId);

    if (!user) {
      return res.status(401).json({ error: "Session expired" });
    }

    // Return user info (without sensitive data)
    res.json({
      id: user._id,
      discord: {
        id: user.discord.id,
        username: user.discord.username,
        discriminator: user.discord.discriminator,
        avatar: user.discord.avatar,
        avatarUrl: discordService.getAvatarUrl(user.discord.id, user.discord.avatar),
      },
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    });
  } catch (error) {
    logger.error("Error getting current user:", error);
    res.status(500).json({ error: "Failed to get user info" });
  }
});

// Logout
router.post("/logout", (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session;

    if (sessionId) {
      discordService.deleteSession(sessionId);
    }

    res.clearCookie("session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    res.json({ success: true });
  } catch (error) {
    logger.error("Error logging out:", error);
    res.status(500).json({ error: "Failed to logout" });
  }
});

function getFrontendUrl(): string {
  const isProd = process.env.NODE_ENV === "production";
  return isProd ? "https://suomiwow.vaarattu.tv" : "http://localhost:3000";
}

export default router;
