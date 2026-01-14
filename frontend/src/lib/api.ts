import {
  GuildListItem,
  GuildDirectoryItem,
  Guild,
  GuildSummary,
  Event,
  EventsResponse,
  RaidInfo,
  Boss,
  RaidDates,
  RaidProgress,
  GuildSchedule,
  LiveStreamer,
  TierList,
  RaidTierList,
  OverallTierListResponse,
  RaidTierListResponse,
  TierListRaidInfo,
  AnalyticsOverview,
  AnalyticsHourly,
  AnalyticsDaily,
  AnalyticsEndpoint,
  AnalyticsStatusCode,
  AnalyticsRecent,
  AnalyticsRealtime,
  AnalyticsPeakHours,
  AnalyticsTrends,
  AnalyticsSlowEndpoint,
  AnalyticsErrors,
  User,
  WoWCharacter,
  AdminUsersResponse,
  AdminGuildsResponse,
  AdminUserStats,
  AdminGuildStats,
  AdminOverview,
  HomePageData,
  PickemSummary,
  PickemDetails,
  PickemPrediction,
  SimpleGuild,
} from "@/types";

// For client-side: use NEXT_PUBLIC_API_URL (browser requests)
// For server-side: use API_URL (internal Docker network)
const getApiUrl = () => {
  if (typeof window === "undefined") {
    // Server-side: use internal Docker network
    return process.env.API_URL || "http://localhost:3001";
  }
  // Client-side: use public URL
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
};

const API_URL = getApiUrl();

export const api = {
  // Home page endpoint - returns all data for the home page in a single request
  async getHomeData(): Promise<HomePageData> {
    const response = await fetch(`${API_URL}/api/home`);
    if (!response.ok) throw new Error("Failed to fetch home page data");
    return response.json();
  },

  // Guild endpoints
  async getGuilds(raidId?: number): Promise<GuildListItem[]> {
    const url = raidId ? `${API_URL}/api/progress?raidId=${raidId}` : `${API_URL}/api/guilds`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch guilds");
    return response.json();
  },

  async getGuildBossProgress(guildId: string, raidId: number): Promise<RaidProgress[]> {
    const response = await fetch(`${API_URL}/api/guilds/${guildId}/raids/${raidId}/bosses`);
    if (!response.ok) throw new Error("Failed to fetch guild boss progress");
    return response.json();
  },

  async getGuildBossProgressByRealmName(realm: string, name: string, raidId: number): Promise<RaidProgress[]> {
    const encodedRealm = encodeURIComponent(realm);
    const encodedName = encodeURIComponent(name);
    const response = await fetch(`${API_URL}/api/guilds/${encodedRealm}/${encodedName}/raids/${raidId}/bosses`);
    if (!response.ok) throw new Error("Failed to fetch guild boss progress");
    return response.json();
  },

  async getBossPullHistory(realm: string, name: string, raidId: number, bossId: number, difficulty: "mythic" | "heroic"): Promise<any[]> {
    const encodedRealm = encodeURIComponent(realm);
    const encodedName = encodeURIComponent(name);
    const response = await fetch(`${API_URL}/api/guilds/${encodedRealm}/${encodedName}/raids/${raidId}/bosses/${bossId}/pull-history?difficulty=${difficulty}`);
    if (!response.ok) throw new Error("Failed to fetch boss pull history");
    return response.json();
  },

  async getGuild(id: string): Promise<Guild> {
    const response = await fetch(`${API_URL}/api/guilds/${id}`);
    if (!response.ok) throw new Error("Failed to fetch guild");
    return response.json();
  },

  async getGuildSummary(id: string): Promise<GuildSummary> {
    const response = await fetch(`${API_URL}/api/guilds/${id}/summary`);
    if (!response.ok) throw new Error("Failed to fetch guild summary");
    return response.json();
  },

  async getGuildSummaryByRealmName(realm: string, name: string): Promise<GuildSummary> {
    const encodedRealm = encodeURIComponent(realm);
    const encodedName = encodeURIComponent(name);
    const response = await fetch(`${API_URL}/api/guilds/${encodedRealm}/${encodedName}/summary`);
    if (!response.ok) throw new Error("Failed to fetch guild summary");
    return response.json();
  },

  async getGuildFullProfile(id: string): Promise<Guild> {
    const response = await fetch(`${API_URL}/api/guilds/${id}/profile`);
    if (!response.ok) throw new Error("Failed to fetch guild profile");
    return response.json();
  },

  async getAllGuilds(): Promise<GuildListItem[]> {
    const response = await fetch(`${API_URL}/api/guilds`);
    if (!response.ok) throw new Error("Failed to fetch all guilds");
    return response.json();
  },

  async getGuildList(): Promise<GuildDirectoryItem[]> {
    const response = await fetch(`${API_URL}/api/guilds/list`);
    if (!response.ok) throw new Error("Failed to fetch guild list");
    return response.json();
  },

  async getGuildSchedules(): Promise<GuildSchedule[]> {
    const response = await fetch(`${API_URL}/api/guilds/schedules`);
    if (!response.ok) throw new Error("Failed to fetch guild schedules");
    return response.json();
  },

  async getLiveStreamers(): Promise<LiveStreamer[]> {
    const response = await fetch(`${API_URL}/api/guilds/live-streamers`);
    if (!response.ok) throw new Error("Failed to fetch live streamers");
    return response.json();
  },

  async refreshGuild(id: string): Promise<{ message: string; guild: Guild }> {
    const response = await fetch(`${API_URL}/api/guilds/${id}/refresh`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to refresh guild");
    return response.json();
  },

  // Event endpoints
  async getEvents(limit: number = 50): Promise<Event[]> {
    const response = await fetch(`${API_URL}/api/events?limit=${limit}`);
    if (!response.ok) throw new Error("Failed to fetch events");
    const data = await response.json();
    // Support both old (array) and new (paginated) response formats
    return Array.isArray(data) ? data : data.events;
  },

  async getEventsPaginated(page: number = 1, limit: number = 50): Promise<EventsResponse> {
    const response = await fetch(`${API_URL}/api/events?limit=${limit}&page=${page}`);
    if (!response.ok) throw new Error("Failed to fetch events");
    const data = await response.json();
    // If old format (array), convert to new format
    if (Array.isArray(data)) {
      return {
        events: data,
        pagination: {
          page: 1,
          limit: data.length,
          totalPages: 1,
          totalCount: data.length,
        },
      };
    }
    return data;
  },

  async getGuildEvents(guildId: string, limit: number = 50): Promise<Event[]> {
    const response = await fetch(`${API_URL}/api/events/guild/${guildId}?limit=${limit}`);
    if (!response.ok) throw new Error("Failed to fetch guild events");
    const data = await response.json();
    // Support both old (array) and new (paginated) response formats
    return Array.isArray(data) ? data : data.events;
  },

  async getGuildEventsByRealmName(realm: string, name: string, limit: number = 50): Promise<Event[]> {
    const encodedRealm = encodeURIComponent(realm);
    const encodedName = encodeURIComponent(name);
    const response = await fetch(`${API_URL}/api/events/guild/${encodedRealm}/${encodedName}?limit=${limit}`);
    if (!response.ok) throw new Error("Failed to fetch guild events");
    const data = await response.json();
    // Support both old (array) and new (paginated) response formats
    return Array.isArray(data) ? data : data.events;
  },

  // Raid endpoints
  async getRaids(): Promise<RaidInfo[]> {
    const response = await fetch(`${API_URL}/api/raids`);
    if (!response.ok) throw new Error("Failed to fetch raids");
    return response.json();
  },

  async getBosses(raidId: number): Promise<Boss[]> {
    const response = await fetch(`${API_URL}/api/raids/${raidId}/bosses`);
    if (!response.ok) throw new Error("Failed to fetch raid bosses");
    return response.json();
  },

  async getRaidDates(raidId: number): Promise<RaidDates> {
    const response = await fetch(`${API_URL}/api/raids/${raidId}/dates`);
    if (!response.ok) throw new Error("Failed to fetch raid dates");
    return response.json();
  },

  // Tier list endpoints

  // Get full tier list (overall + all raids) - use sparingly, prefer specific endpoints
  async getTierList(): Promise<TierList> {
    const response = await fetch(`${API_URL}/api/tierlists`);
    if (!response.ok) throw new Error("Failed to fetch tier list");
    return response.json();
  },

  // Get overall tier list only (without per-raid data)
  async getOverallTierList(): Promise<OverallTierListResponse> {
    const response = await fetch(`${API_URL}/api/tierlists?type=overall`);
    if (!response.ok) throw new Error("Failed to fetch overall tier list");
    return response.json();
  },

  // Get tier list for a specific raid
  async getTierListForRaid(raidId: number): Promise<RaidTierListResponse> {
    const response = await fetch(`${API_URL}/api/tierlists?raidId=${raidId}`);
    if (!response.ok) throw new Error("Failed to fetch tier list for raid");
    return response.json();
  },

  // Get available raids that have tier list data
  async getTierListRaids(): Promise<TierListRaidInfo[]> {
    const response = await fetch(`${API_URL}/api/tierlists/raids`);
    if (!response.ok) throw new Error("Failed to fetch tier list raids");
    return response.json();
  },

  // Analytics endpoints
  async getAnalyticsOverview(): Promise<AnalyticsOverview> {
    const response = await fetch(`${API_URL}/api/analytics/overview`);
    if (!response.ok) throw new Error("Failed to fetch analytics overview");
    return response.json();
  },

  async getAnalyticsHourly(days: number = 7): Promise<AnalyticsHourly[]> {
    const response = await fetch(`${API_URL}/api/analytics/hourly?days=${days}`);
    if (!response.ok) throw new Error("Failed to fetch hourly analytics");
    return response.json();
  },

  async getAnalyticsDaily(days: number = 30): Promise<AnalyticsDaily[]> {
    const response = await fetch(`${API_URL}/api/analytics/daily?days=${days}`);
    if (!response.ok) throw new Error("Failed to fetch daily analytics");
    return response.json();
  },

  async getAnalyticsEndpoints(days: number = 7): Promise<AnalyticsEndpoint[]> {
    const response = await fetch(`${API_URL}/api/analytics/endpoints?days=${days}`);
    if (!response.ok) throw new Error("Failed to fetch endpoint analytics");
    return response.json();
  },

  async getAnalyticsStatusCodes(days: number = 7): Promise<AnalyticsStatusCode[]> {
    const response = await fetch(`${API_URL}/api/analytics/status-codes?days=${days}`);
    if (!response.ok) throw new Error("Failed to fetch status code analytics");
    return response.json();
  },

  async getAnalyticsRecent(limit: number = 100): Promise<AnalyticsRecent[]> {
    const response = await fetch(`${API_URL}/api/analytics/recent?limit=${limit}`);
    if (!response.ok) throw new Error("Failed to fetch recent requests");
    return response.json();
  },

  async getAnalyticsRealtime(): Promise<AnalyticsRealtime> {
    const response = await fetch(`${API_URL}/api/analytics/realtime`);
    if (!response.ok) throw new Error("Failed to fetch realtime analytics");
    return response.json();
  },

  async getAnalyticsPeakHours(days: number = 7): Promise<AnalyticsPeakHours> {
    const response = await fetch(`${API_URL}/api/analytics/peak-hours?days=${days}`);
    if (!response.ok) throw new Error("Failed to fetch peak hours analytics");
    return response.json();
  },

  async getAnalyticsTrends(): Promise<AnalyticsTrends> {
    const response = await fetch(`${API_URL}/api/analytics/trends`);
    if (!response.ok) throw new Error("Failed to fetch analytics trends");
    return response.json();
  },

  async getAnalyticsSlowEndpoints(days: number = 7): Promise<AnalyticsSlowEndpoint[]> {
    const response = await fetch(`${API_URL}/api/analytics/slow-endpoints?days=${days}`);
    if (!response.ok) throw new Error("Failed to fetch slow endpoints");
    return response.json();
  },

  async getAnalyticsErrors(days: number = 7): Promise<AnalyticsErrors> {
    const response = await fetch(`${API_URL}/api/analytics/errors?days=${days}`);
    if (!response.ok) throw new Error("Failed to fetch error analytics");
    return response.json();
  },

  // Auth endpoints
  async getDiscordLoginUrl(): Promise<{ url: string }> {
    const response = await fetch(`${API_URL}/api/auth/discord/login`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to get Discord login URL");
    return response.json();
  },

  async getCurrentUser(): Promise<User | null> {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
      });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Failed to get current user");
      return response.json();
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  },

  // Twitch account connection
  async getTwitchConnectUrl(): Promise<{ url: string }> {
    const response = await fetch(`${API_URL}/api/auth/twitch/connect`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to get Twitch connect URL");
    return response.json();
  },

  async disconnectTwitch(): Promise<void> {
    const response = await fetch(`${API_URL}/api/auth/twitch/disconnect`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to disconnect Twitch");
  },

  // Battle.net account connection
  async getBattleNetConnectUrl(): Promise<{ url: string }> {
    const response = await fetch(`${API_URL}/api/auth/battlenet/connect`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to get Battle.net connect URL");
    return response.json();
  },

  async disconnectBattleNet(): Promise<void> {
    const response = await fetch(`${API_URL}/api/auth/battlenet/disconnect`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to disconnect Battle.net");
  },

  async getAllWoWCharacters(): Promise<{ characters: WoWCharacter[] }> {
    const response = await fetch(`${API_URL}/api/auth/battlenet/characters`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch WoW characters");
    return response.json();
  },

  async updateCharacterSelection(characterIds: number[]): Promise<{ characters: WoWCharacter[] }> {
    const response = await fetch(`${API_URL}/api/auth/battlenet/characters`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ characterIds }),
    });
    if (!response.ok) throw new Error("Failed to update character selection");
    return response.json();
  },

  async refreshWoWCharacters(): Promise<{ characters: WoWCharacter[] }> {
    const response = await fetch(`${API_URL}/api/auth/battlenet/characters/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Failed to refresh characters" }));
      const error: any = new Error(errorData.error || "Failed to refresh characters");
      error.response = { data: errorData };
      throw error;
    }
    return response.json();
  },

  // Admin endpoints (requires admin authentication)
  async getAdminOverview(): Promise<AdminOverview> {
    const response = await fetch(`${API_URL}/api/admin/overview`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch admin overview");
    return response.json();
  },

  async getAdminUsers(page: number = 1, limit: number = 20): Promise<AdminUsersResponse> {
    const response = await fetch(`${API_URL}/api/admin/users?page=${page}&limit=${limit}`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch users");
    return response.json();
  },

  async getAdminUserStats(): Promise<AdminUserStats> {
    const response = await fetch(`${API_URL}/api/admin/users/stats`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch user stats");
    return response.json();
  },

  async getAdminGuilds(page: number = 1, limit: number = 20): Promise<AdminGuildsResponse> {
    const response = await fetch(`${API_URL}/api/admin/guilds?page=${page}&limit=${limit}`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch guilds");
    return response.json();
  },

  async getAdminGuildStats(): Promise<AdminGuildStats> {
    const response = await fetch(`${API_URL}/api/admin/guilds/stats`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch guild stats");
    return response.json();
  },

  async getAdminAnalyticsOverview(): Promise<AnalyticsOverview> {
    const response = await fetch(`${API_URL}/api/admin/analytics/overview`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch analytics overview");
    return response.json();
  },

  async getAdminAnalyticsDaily(days: number = 30): Promise<AnalyticsDaily[]> {
    const response = await fetch(`${API_URL}/api/admin/analytics/daily?days=${days}`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch daily analytics");
    return response.json();
  },

  async getAdminAnalyticsEndpoints(days: number = 7): Promise<AnalyticsEndpoint[]> {
    const response = await fetch(`${API_URL}/api/admin/analytics/endpoints?days=${days}`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch endpoint analytics");
    return response.json();
  },

  async getAdminAnalyticsRealtime(): Promise<AnalyticsRealtime> {
    const response = await fetch(`${API_URL}/api/admin/analytics/realtime`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch realtime analytics");
    return response.json();
  },

  // Pickems endpoints
  async getPickems(): Promise<PickemSummary[]> {
    const response = await fetch(`${API_URL}/api/pickems`);
    if (!response.ok) throw new Error("Failed to fetch pickems");
    return response.json();
  },

  async getPickemsGuilds(): Promise<SimpleGuild[]> {
    const response = await fetch(`${API_URL}/api/pickems/guilds`);
    if (!response.ok) throw new Error("Failed to fetch guilds for pickems");
    return response.json();
  },

  async getPickemDetails(pickemId: string): Promise<PickemDetails> {
    const response = await fetch(`${API_URL}/api/pickems/${pickemId}`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch pickem details");
    return response.json();
  },

  async submitPickemPredictions(pickemId: string, predictions: PickemPrediction[]): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_URL}/api/pickems/${pickemId}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ predictions }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to submit predictions");
    }
    return response.json();
  },
};
