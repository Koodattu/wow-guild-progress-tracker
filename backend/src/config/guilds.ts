export interface TrackedGuild {
  name: string;
  realm: string;
  region: string;
}

export const GUILDS: TrackedGuild[] = [
  { name: "Tuju", realm: "Kazzak", region: "EU" },
  { name: "Kilta", realm: "Ravencrest", region: "EU" },
  //{ name: "LkaksP Issue", realm: "Stormreaver", region: "EU" },
  //{ name: "TURTLES KIMBLE", realm: "Tarren-Mill", region: "EU" },
];

// Raid zones to track (IDs only - names and encounter info come from DB)
export const TRACKED_RAIDS = [
  44, // Manaforge Omega
  42, // Liberation of Undermine
  38, // Nerubar Palace
  35, // Amirdrassil the Dreams Hope
  33, // Aberrus, the Shadowed Crucible
  31, // Vault of the Incarnates
  29, // Sepulcher of the First Ones
  28, // Sanctum of Domination
  26, // Castle Nathria
  24, // Ny'alotha, the Waking City
  23, // The Eternal Palace
  22, // Crucible of Storms
  21, // Battle of Dazar'alor
  19, // Uldir
  17, // Antorus, the Burning Throne
  13, // Tomb of Sargeras
  12, // Trial of Valor
  11, // The Nighthold
  10, // Emerald Nightmare
  8, // Hellfire Citadel
  7, // Blackrock Foundry
  6, // Highmaul
  5, // Siege of Orgrimmar
  4, // Throne of Thunder
];

// Use the first/latest raid as the current one
export const CURRENT_RAID_ID = TRACKED_RAIDS[0];

export const DIFFICULTIES = {
  MYTHIC: 5,
  HEROIC: 4,
  NORMAL: 3,
  LFR: 1,
};
