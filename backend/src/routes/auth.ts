import { Router, Request, Response } from "express";
import crypto from "crypto";
import discordService from "../services/discord.service";
import twitchAuthService from "../services/twitch-auth.service";
import battlenetAuthService from "../services/battlenet-auth.service";
import logger from "../utils/logger";

const router = Router();

// State store for OAuth state validation (prevents CSRF)
// In production, consider using Redis for distributed state
const stateStore: Map<string, { userId: string; expiresAt: Date }> = new Map();

// Clean up expired states periodically
setInterval(() => {
  const now = new Date();
  for (const [state, data] of stateStore.entries()) {
    if (data.expiresAt < now) {
      stateStore.delete(state);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

/**
 * Generate a secure state token for OAuth flow
 */
function generateState(userId: string): string {
  const state = crypto.randomBytes(32).toString("hex");
  stateStore.set(state, {
    userId,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  });
  return state;
}

/**
 * Validate and consume a state token
 */
function validateState(state: string): string | null {
  const data = stateStore.get(state);
  if (!data) return null;
  if (data.expiresAt < new Date()) {
    stateStore.delete(state);
    return null;
  }
  stateStore.delete(state); // Consume the state
  return data.userId;
}

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

    // Build response with connected accounts
    const response: Record<string, unknown> = {
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
    };

    // Include Twitch info if connected
    if (user.twitch) {
      response.twitch = {
        id: user.twitch.id,
        login: user.twitch.login,
        displayName: user.twitch.displayName,
        profileImageUrl: user.twitch.profileImageUrl,
        connectedAt: user.twitch.connectedAt,
      };
    }

    // Include Battle.net info if connected
    if (user.battlenet) {
      response.battlenet = {
        id: user.battlenet.id,
        battletag: user.battlenet.battletag,
        connectedAt: user.battlenet.connectedAt,
        characters: user.battlenet.characters,
        lastCharacterSync: user.battlenet.lastCharacterSync,
      };
    }

    res.json(response);
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

// ============================================================
// TWITCH ACCOUNT CONNECTION ROUTES
// ============================================================

// Get Twitch OAuth authorization URL (requires authentication)
router.get("/twitch/connect", async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session;
    if (!sessionId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await discordService.getUserFromSession(sessionId);
    if (!user) {
      return res.status(401).json({ error: "Session expired" });
    }

    if (!twitchAuthService.isEnabled()) {
      return res.status(503).json({ error: "Twitch integration not configured" });
    }

    const state = generateState(user._id.toString());
    const authUrl = twitchAuthService.getAuthorizationUrl(user._id.toString(), state);
    res.json({ url: authUrl });
  } catch (error) {
    logger.error("Error generating Twitch auth URL:", error);
    res.status(500).json({ error: "Failed to generate authorization URL" });
  }
});

// Twitch OAuth callback
router.get("/twitch/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      logger.warn("Twitch callback missing code parameter");
      return res.redirect(getFrontendUrl() + "/profile?error=missing_code");
    }

    if (!state || typeof state !== "string") {
      logger.warn("Twitch callback missing state parameter");
      return res.redirect(getFrontendUrl() + "/profile?error=invalid_state");
    }

    // Validate state and get user ID
    const userId = validateState(state);
    if (!userId) {
      logger.warn("Twitch callback invalid or expired state");
      return res.redirect(getFrontendUrl() + "/profile?error=invalid_state");
    }

    // Exchange code for tokens
    const tokens = await twitchAuthService.exchangeCode(code);

    // Get Twitch user info
    const twitchUser = await twitchAuthService.getUserInfo(tokens.access_token);

    // Connect Twitch account to user
    await twitchAuthService.connectTwitchAccount(userId, twitchUser, tokens);

    res.redirect(getFrontendUrl() + "/profile?connected=twitch");
  } catch (error) {
    logger.error("Error in Twitch OAuth callback:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorMessage.includes("already connected")) {
      res.redirect(getFrontendUrl() + "/profile?error=twitch_already_linked");
    } else {
      res.redirect(getFrontendUrl() + "/profile?error=twitch_failed");
    }
  }
});

// Disconnect Twitch account
router.post("/twitch/disconnect", async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session;
    if (!sessionId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await discordService.getUserFromSession(sessionId);
    if (!user) {
      return res.status(401).json({ error: "Session expired" });
    }

    // Optionally revoke token before disconnecting
    if (user.twitch?.accessToken) {
      await twitchAuthService.revokeToken(user.twitch.accessToken);
    }

    await twitchAuthService.disconnectTwitchAccount(user._id.toString());
    res.json({ success: true });
  } catch (error) {
    logger.error("Error disconnecting Twitch:", error);
    res.status(500).json({ error: "Failed to disconnect Twitch account" });
  }
});

// ============================================================
// BATTLE.NET ACCOUNT CONNECTION ROUTES
// ============================================================

// Get Battle.net OAuth authorization URL (requires authentication)
router.get("/battlenet/connect", async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session;
    if (!sessionId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await discordService.getUserFromSession(sessionId);
    if (!user) {
      return res.status(401).json({ error: "Session expired" });
    }

    if (!battlenetAuthService.isEnabled()) {
      return res.status(503).json({ error: "Battle.net integration not configured" });
    }

    const state = generateState(user._id.toString());
    const authUrl = battlenetAuthService.getAuthorizationUrl(user._id.toString(), state);
    res.json({ url: authUrl });
  } catch (error) {
    logger.error("Error generating Battle.net auth URL:", error);
    res.status(500).json({ error: "Failed to generate authorization URL" });
  }
});

// Battle.net OAuth callback
router.get("/battlenet/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      logger.warn("Battle.net callback missing code parameter");
      return res.redirect(getFrontendUrl() + "/profile?error=missing_code");
    }

    if (!state || typeof state !== "string") {
      logger.warn("Battle.net callback missing state parameter");
      return res.redirect(getFrontendUrl() + "/profile?error=invalid_state");
    }

    // Validate state and get user ID
    const userId = validateState(state);
    if (!userId) {
      logger.warn("Battle.net callback invalid or expired state");
      return res.redirect(getFrontendUrl() + "/profile?error=invalid_state");
    }

    // Exchange code for tokens
    const tokens = await battlenetAuthService.exchangeCode(code);

    // Get Battle.net user info
    const userInfo = await battlenetAuthService.getUserInfo(tokens.access_token);

    // Get WoW characters
    const characters = await battlenetAuthService.getWoWCharacters(tokens.access_token);

    // Connect Battle.net account to user
    await battlenetAuthService.connectBattleNetAccount(userId, userInfo, tokens, characters);

    res.redirect(getFrontendUrl() + "/profile?connected=battlenet");
  } catch (error) {
    logger.error("Error in Battle.net OAuth callback:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorMessage.includes("already connected")) {
      res.redirect(getFrontendUrl() + "/profile?error=battlenet_already_linked");
    } else {
      res.redirect(getFrontendUrl() + "/profile?error=battlenet_failed");
    }
  }
});

// Disconnect Battle.net account
router.post("/battlenet/disconnect", async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session;
    if (!sessionId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await discordService.getUserFromSession(sessionId);
    if (!user) {
      return res.status(401).json({ error: "Session expired" });
    }

    await battlenetAuthService.disconnectBattleNetAccount(user._id.toString());
    res.json({ success: true });
  } catch (error) {
    logger.error("Error disconnecting Battle.net:", error);
    res.status(500).json({ error: "Failed to disconnect Battle.net account" });
  }
});

// Update WoW character selection
router.post("/battlenet/characters", async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session;
    if (!sessionId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await discordService.getUserFromSession(sessionId);
    if (!user) {
      return res.status(401).json({ error: "Session expired" });
    }

    const { characterIds } = req.body;
    if (!Array.isArray(characterIds)) {
      return res.status(400).json({ error: "characterIds must be an array" });
    }

    const updatedUser = await battlenetAuthService.updateCharacterSelection(user._id.toString(), characterIds);

    res.json({
      characters: updatedUser.battlenet?.characters || [],
    });
  } catch (error) {
    logger.error("Error updating character selection:", error);
    res.status(500).json({ error: "Failed to update character selection" });
  }
});

// Refresh WoW characters from Battle.net
router.post("/battlenet/characters/refresh", async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.session;
    if (!sessionId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await discordService.getUserFromSession(sessionId);
    if (!user) {
      return res.status(401).json({ error: "Session expired" });
    }

    const characters = await battlenetAuthService.refreshCharacters(user._id.toString());

    res.json({ characters });
  } catch (error) {
    logger.error("Error refreshing characters:", error);
    res.status(500).json({ error: "Failed to refresh characters" });
  }
});

function getFrontendUrl(): string {
  const isProd = process.env.NODE_ENV === "production";
  return isProd ? "https://suomiwow.vaarattu.tv" : "http://localhost:3000";
}

export default router;
