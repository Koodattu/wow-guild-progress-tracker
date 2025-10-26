import { GuildListItem, Guild, Event, RaidInfo, Boss, RaidDates, RaidProgress } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
    return response.json();
  },

  async getGuildEvents(guildId: string, limit: number = 50): Promise<Event[]> {
    const response = await fetch(`${API_URL}/api/events/guild/${guildId}?limit=${limit}`);
    if (!response.ok) throw new Error("Failed to fetch guild events");
    return response.json();
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
