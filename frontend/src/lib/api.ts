import { GuildListItem, Guild, GuildSummary, Event, EventsResponse, RaidInfo, Boss, RaidDates, RaidProgress, GuildSchedule } from "@/types";

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
  // Guild endpoints
  async getGuilds(raidId?: number): Promise<GuildListItem[]> {
    const url = raidId ? `${API_URL}/api/guilds?raidId=${raidId}` : `${API_URL}/api/guilds`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch guilds");
    return response.json();
  },

  async getGuildBossProgress(guildId: string, raidId: number): Promise<RaidProgress[]> {
    const response = await fetch(`${API_URL}/api/guilds/${guildId}/raids/${raidId}/bosses`);
    if (!response.ok) throw new Error("Failed to fetch guild boss progress");
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

  async getGuildSchedules(): Promise<GuildSchedule[]> {
    const response = await fetch(`${API_URL}/api/guilds/schedules`);
    if (!response.ok) throw new Error("Failed to fetch guild schedules");
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
};
