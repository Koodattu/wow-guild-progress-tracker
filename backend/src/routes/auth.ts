import { Router, Request, Response } from "express";
import crypto from "crypto";
import discordService from "../services/discord.service";
import twitchAuthService from "../services/twitch-auth.service";
import battlenetAuthService from "../services/battlenet-auth.service";
import logger from "../utils/logger";
import { IUser } from "../models/User";

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const router = Router();

/**
 * Helper function to get authenticated user from session
 */
async function getAuthenticatedUser(req: Request): Promise<IUser | null> {
  const userId = req.session.userId;
  if (!userId) {
    return null;
  }
  return discordService.getUserFromSession(userId);
}

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

    // Store user ID in session (managed by express-session)
    req.session.userId = user._id.toString();

    logger.info(`Discord OAuth: Session created for user ${user.discord.username} (${user._id})`);

    // Save session and redirect
    req.session.save((err) => {
      if (err) {
        logger.error("Error saving session:", err);
        return res.redirect(getFrontendUrl() + "?error=session_error");
      }
      logger.info(`Session saved successfully, redirecting to profile. Session ID: ${req.sessionID}`);
      res.redirect(getFrontendUrl() + "/profile");
    });
  } catch (error) {
    logger.error("Error in Discord OAuth callback:", error);
    res.redirect(getFrontendUrl() + "?error=auth_failed");
  }
});

// Get current user
router.get("/me", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;

    logger.info(`GET /me request - Session ID: ${req.sessionID}, User ID in session: ${userId || "none"}`);

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await discordService.getUserFromSession(userId);

    if (!user) {
      logger.warn(`Session exists but user not found in DB: ${userId}`);
      return res.status(401).json({ error: "Session expired" });
    }

    // Build response with connected accounts (minimal data)
    const response: Record<string, unknown> = {
      discord: {
        username: user.discord.username,
        avatarUrl: discordService.getAvatarUrl(user.discord.id, user.discord.avatar),
      },
      isAdmin: discordService.isAdmin(user.discord.username),
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };

    // Include Twitch info if connected
    if (user.twitch) {
      response.twitch = {
        displayName: user.twitch.displayName,
        profileImageUrl: user.twitch.profileImageUrl,
        connectedAt: user.twitch.connectedAt,
      };
    }

    // Include Battle.net info if connected
    if (user.battlenet) {
      // Only return selected characters with minimal fields
      const selectedCharacters = user.battlenet.characters
        .filter((c) => c.selected)
        .map((c) => ({
          name: c.name,
          realm: c.realm,
          class: c.class,
          race: c.race,
          level: c.level,
          faction: c.faction,
          guild: c.guild,
          selected: c.selected,
          inactive: c.inactive,
        }));

      response.battlenet = {
        battletag: user.battlenet.battletag,
        connectedAt: user.battlenet.connectedAt,
        characters: selectedCharacters,
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
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        logger.error("Error destroying session:", err);
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ success: true });
    });
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
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
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
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
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
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
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
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    await battlenetAuthService.disconnectBattleNetAccount(user._id.toString());
    res.json({ success: true });
  } catch (error) {
    logger.error("Error disconnecting Battle.net:", error);
    res.status(500).json({ error: "Failed to disconnect Battle.net account" });
  }
});

// Get all WoW characters (for character selection dialog)
router.get("/battlenet/characters", async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!user.battlenet) {
      return res.status(400).json({ error: "No Battle.net account connected" });
    }

    // Return all characters with minimal fields (exclude realmSlug, guildRealm, guildRealmSlug)
    // Keep id for selection purposes
    const characters = user.battlenet.characters.map((c) => ({
      id: c.id,
      name: c.name,
      realm: c.realm,
      class: c.class,
      race: c.race,
      level: c.level,
      faction: c.faction,
      guild: c.guild,
      selected: c.selected,
      inactive: c.inactive,
    }));

    res.json({ characters });
  } catch (error) {
    logger.error("Error fetching characters:", error);
    res.status(500).json({ error: "Failed to fetch characters" });
  }
});

// Update WoW character selection
router.post("/battlenet/characters", async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { characterIds } = req.body;
    if (!Array.isArray(characterIds)) {
      return res.status(400).json({ error: "characterIds must be an array" });
    }

    const updatedUser = await battlenetAuthService.updateCharacterSelection(user._id.toString(), characterIds);

    // Return only selected characters with minimal fields
    const selectedCharacters =
      updatedUser.battlenet?.characters
        .filter((c) => c.selected)
        .map((c) => ({
          name: c.name,
          realm: c.realm,
          class: c.class,
          race: c.race,
          level: c.level,
          faction: c.faction,
          guild: c.guild,
          selected: c.selected,
          inactive: c.inactive,
        })) || [];

    res.json({
      characters: selectedCharacters,
    });
  } catch (error) {
    logger.error("Error updating character selection:", error);
    res.status(500).json({ error: "Failed to update character selection" });
  }
});

// Refresh WoW characters from Battle.net
router.post("/battlenet/characters/refresh", async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
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
