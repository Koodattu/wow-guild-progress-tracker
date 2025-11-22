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

  // Check if channels are live
  // Returns a Map of channel name (lowercase) to boolean (true = live, false = offline)
  async getStreamStatus(channelNames: string[]): Promise<Map<string, boolean>> {
    const statusMap = new Map<string, boolean>();

    if (!this.isEnabled()) {
      logger.info("Twitch integration is disabled, returning all streams as offline");
      channelNames.forEach((name) => statusMap.set(name.toLowerCase(), false));
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
      channelNames.forEach((name) => statusMap.set(name.toLowerCase(), false));

      // Mark live channels as online
      data.data.forEach((stream) => {
        if (stream.type === "live") {
          statusMap.set(stream.user_login.toLowerCase(), true);
        }
      });

      const liveCount = data.data.filter((s) => s.type === "live").length;
      logger.info(`Twitch: Checked ${channelNames.length} channel(s), ${liveCount} live`);

      return statusMap;
    } catch (error) {
      logger.error("Error checking Twitch stream status:", error instanceof Error ? error.message : "Unknown error");

      // On error, return all channels as offline
      channelNames.forEach((name) => statusMap.set(name.toLowerCase(), false));
      return statusMap;
    }
  }
}

// Export singleton instance
const twitchService = new TwitchService();
export default twitchService;
