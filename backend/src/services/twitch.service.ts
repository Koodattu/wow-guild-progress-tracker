import fetch from "node-fetch";
import logger from "../utils/logger";

interface TwitchTokenResponse {
  access_token: string;
  expires_in: number; // Seconds until expiration
  token_type: string;
}

interface TwitchStreamData {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: "live" | "";
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
}

interface TwitchStreamsResponse {
  data: TwitchStreamData[];
}

export interface TwitchVideoData {
  id: string;
  stream_id?: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: "archive" | "highlight" | "upload";
  duration: string;
  muted_segments?: Array<{ duration: number; offset: number }> | null;
}

interface TwitchVideosResponse {
  data: TwitchVideoData[];
}

export interface TwitchUserData {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
  created_at: string;
}

interface TwitchUsersResponse {
  data: TwitchUserData[];
}

export interface StreamStatus {
  isLive: boolean;
  isPlayingWoW: boolean;
  gameName?: string;
  twitchUserId?: string;
  streamId?: string;
  startedAt?: string;
}

class TwitchService {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0; // Timestamp when token expires

  constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID || "";
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET || "";

    if (!this.clientId || !this.clientSecret) {
      logger.warn("⚠️  Twitch API credentials not configured. Streamer status updates will be disabled.");
    }
  }

  // Check if Twitch integration is enabled
  isEnabled(): boolean {
    return this.clientId !== "" && this.clientSecret !== "";
  }

  // Get app access token using OAuth Client Credentials flow
  private async getAccessToken(): Promise<string> {
    // If we have a valid token, return it
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    // Request new token
    try {
      logger.info(`[API REQUEST] POST https://id.twitch.tv/oauth2/token`);
      const response = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: "client_credentials",
        }).toString(),
      });

      if (!response.ok) {
        throw new Error(`Failed to get Twitch access token: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as TwitchTokenResponse;

      // Store token and calculate expiration time (with 5 minute buffer)
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;

      logger.info(`✅ Twitch access token obtained (expires in ${data.expires_in}s)`);
      return this.accessToken;
    } catch (error) {
      logger.error("Error getting Twitch access token:", error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  }

  // Check if channels are live and what game they're playing
  // Returns a Map of channel name (lowercase) to StreamStatus
  async getStreamStatus(channelNames: string[]): Promise<Map<string, StreamStatus>> {
    const statusMap = new Map<string, StreamStatus>();

    if (!this.isEnabled()) {
      logger.info("Twitch integration is disabled, returning all streams as offline");
      channelNames.forEach((name) => statusMap.set(name.toLowerCase(), { isLive: false, isPlayingWoW: false }));
      return statusMap;
    }

    if (channelNames.length === 0) {
      return statusMap;
    }

    try {
      const token = await this.getAccessToken();

      // Twitch API supports up to 100 channels per request
      // Build query string with user_login parameters
      const queryParams = channelNames.map((name) => `user_login=${encodeURIComponent(name.toLowerCase())}`).join("&");

      logger.info(`[API REQUEST] GET https://api.twitch.tv/helix/streams?${queryParams}`);
      const response = await fetch(`https://api.twitch.tv/helix/streams?${queryParams}`, {
        headers: {
          "Client-ID": this.clientId,
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Twitch API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as TwitchStreamsResponse;

      // Initialize all channels as offline
      channelNames.forEach((name) => statusMap.set(name.toLowerCase(), { isLive: false, isPlayingWoW: false }));

      // Update status for live channels with game information
      data.data.forEach((stream) => {
        if (stream.type === "live") {
          const isPlayingWoW = stream.game_name.toLowerCase() === "world of warcraft";
          statusMap.set(stream.user_login.toLowerCase(), {
            isLive: true,
            isPlayingWoW: isPlayingWoW,
            gameName: stream.game_name,
            twitchUserId: stream.user_id,
            streamId: stream.id,
            startedAt: stream.started_at,
          });
        }
      });

      const liveCount = data.data.filter((s) => s.type === "live").length;
      const wowCount = data.data.filter((s) => s.type === "live" && s.game_name.toLowerCase() === "world of warcraft").length;
      logger.info(`Twitch: Checked ${channelNames.length} channel(s), ${liveCount} live (${wowCount} playing WoW)`);

      return statusMap;
    } catch (error) {
      logger.error("Error checking Twitch stream status:", error instanceof Error ? error.message : "Unknown error");

      // On error, return all channels as offline
      channelNames.forEach((name) => statusMap.set(name.toLowerCase(), { isLive: false, isPlayingWoW: false }));
      return statusMap;
    }
  }

  async getRecentArchiveVideos(userId: string, first: number = 10): Promise<TwitchVideoData[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const token = await this.getAccessToken();
    const params = new URLSearchParams({
      user_id: userId,
      type: "archive",
      sort: "time",
      first: Math.min(Math.max(first, 1), 100).toString(),
    });

    logger.info(`[API REQUEST] GET https://api.twitch.tv/helix/videos?${params.toString()}`);
    const response = await fetch(`https://api.twitch.tv/helix/videos?${params.toString()}`, {
      headers: {
        "Client-ID": this.clientId,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Twitch videos API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as TwitchVideosResponse;
    return data.data || [];
  }

  async getUsersByLogins(logins: string[]): Promise<Map<string, TwitchUserData>> {
    const usersByLogin = new Map<string, TwitchUserData>();

    if (!this.isEnabled() || logins.length === 0) {
      return usersByLogin;
    }

    const uniqueLogins = Array.from(new Set(logins.map((login) => login.trim().toLowerCase()).filter(Boolean)));
    const token = await this.getAccessToken();

    for (let i = 0; i < uniqueLogins.length; i += 100) {
      const batch = uniqueLogins.slice(i, i + 100);
      const params = new URLSearchParams();
      batch.forEach((login) => params.append("login", login));

      logger.info(`[API REQUEST] GET https://api.twitch.tv/helix/users?${params.toString()}`);
      const response = await fetch(`https://api.twitch.tv/helix/users?${params.toString()}`, {
        headers: {
          "Client-ID": this.clientId,
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Twitch users API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as TwitchUsersResponse;
      (data.data || []).forEach((user) => {
        usersByLogin.set(user.login.toLowerCase(), user);
      });
    }

    return usersByLogin;
  }
}

// Export singleton instance
const twitchService = new TwitchService();
export default twitchService;
