export interface TrackedGuild {
  name: string;
  realm: string;
  region: string;
}

export const GUILDS: TrackedGuild[] = [{ name: "Tuju", realm: "Kazzak", region: "EU" }];

// Manaforge Omega (latest raid as of request)
export const CURRENT_RAID = {
  id: 44, // Correct zone ID for Manaforge Omega
  name: "Manaforge Omega",
  slug: "manaforge-omega",
};

export const DIFFICULTIES = {
  MYTHIC: 5,
  HEROIC: 4,
  NORMAL: 3,
  LFR: 1,
};
