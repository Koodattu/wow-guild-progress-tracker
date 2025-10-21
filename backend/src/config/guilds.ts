export interface TrackedGuild {
  name: string;
  realm: string;
  region: string;
}

export const GUILDS: TrackedGuild[] = [
  { name: "Tuju", realm: "Kazzak", region: "EU" },
  { name: "LkaksP Issue", realm: "Stormreaver", region: "EU" },
  { name: "TURTLES KIMBLE", realm: "Tarren-Mill", region: "EU" },
];

// Raid zones to track (IDs only - names and encounter info come from DB)
export const TRACKED_RAIDS = [
  44, // Manaforge Omega
  42, // Liberation of Undermine
];

// Use the first/latest raid as the current one
export const CURRENT_RAID_ID = TRACKED_RAIDS[0];

export const DIFFICULTIES = {
  MYTHIC: 5,
  HEROIC: 4,
  NORMAL: 3,
  LFR: 1,
};
