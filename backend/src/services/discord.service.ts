import logger from "../utils/logger";
import User, { IUser } from "../models/User";
import crypto from "crypto";

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface DiscordUserResponse {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name?: string;
}

// Simple in-memory session store (consider Redis for production scaling)
const sessions: Map<string, { userId: string; expiresAt: Date }> = new Map();

// Clean up expired sessions periodically
setInterval(() => {
  const now = new Date();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(sessionId);
    }
  }
}, 60 * 60 * 1000); // Clean up every hour

class DiscordService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.DISCORD_CLIENT_ID || "";
    this.clientSecret = process.env.DISCORD_CLIENT_SECRET || "";

    // Determine redirect URI based on environment
    const isProd = process.env.NODE_ENV === "production";
    this.redirectUri = isProd ? "https://suomiwow.vaarattu.tv/api/auth/discord/callback" : "http://localhost:3001/api/auth/discord/callback";

    if (!this.clientId || !this.clientSecret) {
      logger.warn("Discord OAuth credentials not configured");
    } else {
      logger.info(`Discord OAuth configured with redirect URI: ${this.redirectUri}`);
    }
  }

  /**
   * Get the Discord OAuth authorization URL
   */
  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: "identify",
    });

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string): Promise<DiscordTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: this.redirectUri,
    });

    logger.info(`[API REQUEST] POST https://discord.com/api/oauth2/token`);
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error("Failed to exchange Discord code:", error);
      throw new Error("Failed to exchange authorization code");
    }

    return response.json() as Promise<DiscordTokenResponse>;
  }

  /**
   * Get Discord user info using access token
   */
  async getUserInfo(accessToken: string): Promise<DiscordUserResponse> {
    logger.info(`[API REQUEST] GET https://discord.com/api/users/@me`);
    const response = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error("Failed to get Discord user info:", error);
      throw new Error("Failed to get user info");
    }

    return response.json() as Promise<DiscordUserResponse>;
  }

  /**
   * Find or create user from Discord OAuth
   */
  async findOrCreateUser(discordUser: DiscordUserResponse, tokens: DiscordTokenResponse): Promise<IUser> {
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    let user = await User.findOne({ "discord.id": discordUser.id });

    if (user) {
      // Update existing user
      user.discord.username = discordUser.username;
      user.discord.discriminator = discordUser.discriminator;
      user.discord.avatar = discordUser.avatar;
      user.discord.accessToken = tokens.access_token;
      user.discord.refreshToken = tokens.refresh_token;
      user.discord.tokenExpiresAt = tokenExpiresAt;
      user.lastLoginAt = new Date();
      await user.save();
      logger.info(`User logged in: ${discordUser.username} (${discordUser.id})`);
    } else {
      // Create new user
      user = await User.create({
        discord: {
          id: discordUser.id,
          username: discordUser.username,
          discriminator: discordUser.discriminator,
          avatar: discordUser.avatar,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt,
        },
        lastLoginAt: new Date(),
      });
      logger.info(`New user created: ${discordUser.username} (${discordUser.id})`);
    }

    return user;
  }

  /**
   * Create a session for a user
   */
  createSession(userId: string): string {
    const sessionId = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    sessions.set(sessionId, { userId, expiresAt });

    return sessionId;
  }

  /**
   * Get user from session
   */
  async getUserFromSession(sessionId: string): Promise<IUser | null> {
    const session = sessions.get(sessionId);

    if (!session) {
      return null;
    }

    if (session.expiresAt < new Date()) {
      sessions.delete(sessionId);
      return null;
    }

    return User.findById(session.userId);
  }

  /**
   * Delete a session (logout)
   */
  deleteSession(sessionId: string): void {
    sessions.delete(sessionId);
  }

  /**
   * Get Discord avatar URL
   */
  getAvatarUrl(discordId: string, avatarHash: string | null): string {
    if (!avatarHash) {
      // Default avatar based on user ID
      const defaultIndex = parseInt(discordId) % 5;
      return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
    }
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png`;
  }

  /**
   * Check if a Discord username is an admin
   */
  isAdmin(discordUsername: string): boolean {
    const adminNames = process.env.ADMIN_DISCORD_NAMES || "";
    if (!adminNames) return false;
    const adminList = adminNames.split(",").map((name) => name.trim().toLowerCase());
    return adminList.includes(discordUsername.toLowerCase());
  }
}

export default new DiscordService();
