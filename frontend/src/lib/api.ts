import {
  GuildListItem,
  GuildDirectoryItem,
  Guild,
  GuildSummary,
  Event,
  EventsResponse,
  RaidInfo,
  Raid,
  Boss,
  RaidDates,
  RaidProgress,
  GuildSchedule,
  LiveStreamer,
  TierList,
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
  AuthUser,
  UserProfile,
  WoWCharacter,
  AdminUsersResponse,
  AdminGuildsResponse,
  AdminUserStats,
  AdminGuildStats,
  AdminOverview,
  AdminCharactersResponse,
  AdminCharacterStats,
  HomePageData,
  PickemSummary,
  PickemDetails,
  PickemPrediction,
  SimpleGuild,
  AdminPickemsResponse,
  AdminPickem,
  CreatePickemInput,
  UpdatePickemInput,
  BossPullHistoryResponse,
  RaidAnalytics,
  RaidAnalyticsListItem,
  CharacterRankingRow,
  RateLimitResponse,
  RateLimitStatus,
  ProcessingQueueStatsResponse,
  ProcessingQueueResponse,
  ProcessingQueueErrorsResponse,
  ProcessingStatus,
  ProcessorStatus,
  QueueItem,
  ErrorType,
  TriggerResponse,
  AdminGuildDetail,
  VerifyReportsResponse,
  QueueRescanResponse,
  CreateGuildInput,
  CreateGuildResponse,
  DeleteGuildPreviewResponse,
  DeleteGuildResponse,
  UpdateGuildInput,
  UpdateGuildResponse,
  DeleteCharacterResponse,
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

  async getBossPullHistory(realm: string, name: string, raidId: number, bossId: number, difficulty: "mythic" | "heroic"): Promise<BossPullHistoryResponse> {
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

  async getRaid(raidId: number): Promise<Raid> {
    const response = await fetch(`${API_URL}/api/raids/${raidId}`);
    if (!response.ok) throw new Error("Failed to fetch raid");
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

  async getCurrentUser(): Promise<AuthUser | null> {
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

  async getProfile(): Promise<UserProfile | null> {
    try {
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        credentials: "include",
      });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Failed to get user profile");
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

  async getAdminGuilds(page: number = 1, limit: number = 20, search?: string): Promise<AdminGuildsResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.append("search", search);

    const response = await fetch(`${API_URL}/api/admin/guilds?${params}`, {
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

  async createAdminGuild(input: CreateGuildInput): Promise<CreateGuildResponse> {
    const response = await fetch(`${API_URL}/api/admin/guilds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create guild");
    }
    return response.json();
  },

  async getAdminGuildDeletePreview(guildId: string): Promise<DeleteGuildPreviewResponse> {
    const response = await fetch(`${API_URL}/api/admin/guilds/${guildId}/delete-preview`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch deletion preview");
    return response.json();
  },

  async deleteAdminGuild(guildId: string): Promise<DeleteGuildResponse> {
    const response = await fetch(`${API_URL}/api/admin/guilds/${guildId}?confirm=true`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to delete guild");
    }
    return response.json();
  },

  async updateAdminGuild(guildId: string, input: UpdateGuildInput): Promise<UpdateGuildResponse> {
    const response = await fetch(`${API_URL}/api/admin/guilds/${guildId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update guild");
    }
    return response.json();
  },

  async deleteAdminCharacter(characterId: string): Promise<DeleteCharacterResponse> {
    const response = await fetch(`${API_URL}/api/admin/characters/${characterId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to delete character");
    }
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

  async getPickemsRwfGuilds(): Promise<SimpleGuild[]> {
    const response = await fetch(`${API_URL}/api/pickems/guilds/rwf`);
    if (!response.ok) throw new Error("Failed to fetch RWF guilds for pickems");
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

  // Admin Pickem endpoints
  async getAdminPickems(): Promise<AdminPickemsResponse> {
    const response = await fetch(`${API_URL}/api/admin/pickems`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch pickems");
    return response.json();
  },

  async getAdminPickem(pickemId: string): Promise<AdminPickem> {
    const response = await fetch(`${API_URL}/api/admin/pickems/${pickemId}`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch pickem");
    return response.json();
  },

  async createAdminPickem(input: CreatePickemInput): Promise<AdminPickem> {
    const response = await fetch(`${API_URL}/api/admin/pickems`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create pickem");
    }
    return response.json();
  },

  async updateAdminPickem(pickemId: string, input: UpdatePickemInput): Promise<AdminPickem> {
    const response = await fetch(`${API_URL}/api/admin/pickems/${pickemId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update pickem");
    }
    return response.json();
  },

  async deleteAdminPickem(pickemId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_URL}/api/admin/pickems/${pickemId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to delete pickem");
    }
    return response.json();
  },

  async toggleAdminPickem(pickemId: string): Promise<AdminPickem> {
    const response = await fetch(`${API_URL}/api/admin/pickems/${pickemId}/toggle`, {
      method: "PATCH",
      credentials: "include",
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to toggle pickem");
    }
    return response.json();
  },

  async finalizeRwfPickem(pickemId: string, finalRankings: string[]): Promise<{ success: boolean; pickem: AdminPickem }> {
    const response = await fetch(`${API_URL}/api/admin/pickems/${pickemId}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ finalRankings }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to finalize pickem");
    }
    return response.json();
  },

  async unfinalizeRwfPickem(pickemId: string): Promise<{ success: boolean; pickem: AdminPickem }> {
    const response = await fetch(`${API_URL}/api/admin/pickems/${pickemId}/unfinalize`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to unfinalize pickem");
    }
    return response.json();
  },

  async getCharacterRankings(queryString = ""): Promise<{
    data: CharacterRankingRow[];
    pagination: {
      totalItems: number;
      totalRankedItems: number;
      totalPages: number;
      currentPage: number;
      pageSize: number;
    };
    jumpTo?: {
      rank: number;
      wclCanonicalCharacterId: number;
    };
  }> {
    const response = await fetch(`${API_URL}/api/character-rankings${queryString}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Failed to fetch character rankings");
    }
    return response.json();
  },

  // ============================================================================
  // RAID ANALYTICS
  // ============================================================================

  async getRaidAnalyticsRaids(): Promise<RaidAnalyticsListItem[]> {
    const response = await fetch(`${API_URL}/api/raid-analytics/raids`);
    if (!response.ok) {
      throw new Error("Failed to fetch raid analytics raids");
    }
    return response.json();
  },

  async getRaidAnalytics(raidId: number): Promise<RaidAnalytics> {
    const response = await fetch(`${API_URL}/api/raid-analytics/${raidId}`);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("No analytics available for this raid");
      }
      throw new Error("Failed to fetch raid analytics");
    }
    return response.json();
  },

  async getAllRaidAnalytics(): Promise<RaidAnalytics[]> {
    const response = await fetch(`${API_URL}/api/raid-analytics/all`);
    if (!response.ok) {
      throw new Error("Failed to fetch all raid analytics");
    }
    return response.json();
  },

  // ============================================================================
  // RATE LIMIT & PROCESSING QUEUE (Admin)
  // ============================================================================

  async getAdminRateLimitStatus(): Promise<RateLimitResponse> {
    const response = await fetch(`${API_URL}/api/admin/rate-limit`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch rate limit status");
    return response.json();
  },

  async setAdminRateLimitPause(paused: boolean): Promise<{ success: boolean; isPaused: boolean; status: RateLimitStatus }> {
    const response = await fetch(`${API_URL}/api/admin/rate-limit/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ paused }),
    });
    if (!response.ok) throw new Error("Failed to toggle rate limit pause");
    return response.json();
  },

  async getAdminProcessingQueueStats(): Promise<ProcessingQueueStatsResponse> {
    const response = await fetch(`${API_URL}/api/admin/processing-queue/stats`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch processing queue stats");
    return response.json();
  },

  async getAdminProcessingQueue(page: number = 1, limit: number = 20, status?: ProcessingStatus): Promise<ProcessingQueueResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (status) params.append("status", status);

    const response = await fetch(`${API_URL}/api/admin/processing-queue?${params}`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch processing queue");
    return response.json();
  },

  async setAdminProcessingQueuePauseAll(paused: boolean): Promise<{ success: boolean; processor: ProcessorStatus }> {
    const response = await fetch(`${API_URL}/api/admin/processing-queue/pause-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ paused }),
    });
    if (!response.ok) throw new Error("Failed to toggle processing queue pause");
    return response.json();
  },

  async pauseAdminProcessingQueueGuild(guildId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_URL}/api/admin/processing-queue/${guildId}/pause`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to pause guild processing");
    return response.json();
  },

  async resumeAdminProcessingQueueGuild(guildId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_URL}/api/admin/processing-queue/${guildId}/resume`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to resume guild processing");
    return response.json();
  },

  async retryAdminProcessingQueueGuild(guildId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_URL}/api/admin/processing-queue/${guildId}/retry`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to retry guild processing");
    return response.json();
  },

  async removeAdminProcessingQueueGuild(guildId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_URL}/api/admin/processing-queue/${guildId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to remove guild from processing queue");
    return response.json();
  },

  async queueAdminGuildForProcessing(guildId: string, priority?: number): Promise<{ success: boolean; queueItem: QueueItem }> {
    const response = await fetch(`${API_URL}/api/admin/processing-queue/queue-guild`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ guildId, priority }),
    });
    if (!response.ok) throw new Error("Failed to queue guild for processing");
    return response.json();
  },

  async getAdminProcessingQueueErrors(page: number = 1, limit: number = 20, errorType?: ErrorType): Promise<ProcessingQueueErrorsResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (errorType) {
      params.append("errorType", errorType);
    }

    const response = await fetch(`${API_URL}/api/admin/processing-queue/errors?${params}`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch processing queue errors");
    }

    return response.json();
  },

  async clearAdminProcessingQueueCompleted(): Promise<{
    success: boolean;
    deletedCount: number;
    message: string;
  }> {
    const response = await fetch(`${API_URL}/api/admin/processing-queue/clear-completed`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to clear completed guilds");
    return response.json();
  },

  async clearAdminProcessingQueueErrors(action: "reset" | "remove" = "reset"): Promise<{
    success: boolean;
    deletedCount?: number;
    modifiedCount?: number;
    message: string;
  }> {
    const response = await fetch(`${API_URL}/api/admin/processing-queue/clear-errors?action=${action}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to clear errors");
    return response.json();
  },

  async getAdminCharacters(page = 1, limit = 50, search?: string): Promise<AdminCharactersResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.append("search", search);
    const response = await fetch(`${API_URL}/api/admin/characters?${params}`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch characters");
    return response.json();
  },

  async getAdminCharacterStats(): Promise<AdminCharacterStats> {
    const response = await fetch(`${API_URL}/api/admin/characters/stats`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to fetch character stats");
    return response.json();
  },
};

// ==================== Admin Trigger Functions ====================

export async function triggerRefreshCharacterRankings(): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/refresh-character-rankings`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger character rankings refresh");
  return response.json();
}

export async function triggerCalculateAllStatistics(currentTierOnly: boolean = true): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/calculate-all-statistics`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentTierOnly }),
  });
  if (!response.ok) throw new Error("Failed to trigger statistics calculation");
  return response.json();
}

export async function triggerCalculateTierLists(): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/calculate-tier-lists`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger tier list calculation");
  return response.json();
}

export async function triggerCheckTwitchStreams(): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/check-twitch-streams`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger Twitch stream check");
  return response.json();
}

export async function triggerUpdateWorldRanks(): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/update-world-ranks`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger world ranks update");
  return response.json();
}

export async function triggerCalculateRaidAnalytics(): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/calculate-raid-analytics`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger raid analytics calculation");
  return response.json();
}

export async function triggerUpdateActiveGuilds(): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/update-active-guilds`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger active guilds update");
  return response.json();
}

export async function triggerUpdateInactiveGuilds(): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/update-inactive-guilds`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger inactive guilds update");
  return response.json();
}

export async function triggerUpdateAllGuilds(): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/update-all-guilds`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger all guilds update");
  return response.json();
}

export async function triggerRefetchRecentReports(): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/refetch-recent-reports`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger recent reports refetch");
  return response.json();
}

export async function triggerUpdateGuildCrests(): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/update-guild-crests`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger guild crests update");
  return response.json();
}

export async function triggerRescanDeathEvents(): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/rescan-death-events`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger death events rescan");
  return response.json();
}

export async function triggerRescanCharacters(): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/trigger/rescan-characters`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger character rescan");
  return response.json();
}

// ==================== Admin Guild Management Functions ====================

export async function getAdminGuildDetail(guildId: string): Promise<AdminGuildDetail> {
  const response = await fetch(`${API_URL}/api/admin/guilds/${guildId}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch guild details");
  return response.json();
}

export async function recalculateGuildStats(guildId: string): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/guilds/${guildId}/recalculate-stats`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger guild stats recalculation");
  return response.json();
}

export async function updateGuildWorldRanks(guildId: string): Promise<TriggerResponse> {
  const response = await fetch(`${API_URL}/api/admin/guilds/${guildId}/update-world-ranks`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to trigger guild world ranks update");
  return response.json();
}

export async function queueGuildRescan(guildId: string): Promise<QueueRescanResponse> {
  const response = await fetch(`${API_URL}/api/admin/guilds/${guildId}/queue-rescan`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to queue guild for rescan");
  }
  return response.json();
}

export async function queueGuildRescanDeaths(guildId: string): Promise<QueueRescanResponse> {
  const response = await fetch(`${API_URL}/api/admin/guilds/${guildId}/queue-rescan-deaths`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to queue guild for death events rescan");
  }
  return response.json();
}

export async function queueGuildRescanCharacters(guildId: string): Promise<QueueRescanResponse> {
  const response = await fetch(`${API_URL}/api/admin/guilds/${guildId}/queue-rescan-characters`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to queue guild for character rescan");
  }
  return response.json();
}

export async function verifyGuildReports(guildId: string): Promise<VerifyReportsResponse> {
  const response = await fetch(`${API_URL}/api/admin/guilds/${guildId}/verify-reports`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to verify guild reports");
  return response.json();
}
