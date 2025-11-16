export interface TrackedGuild {
  name: string;
  realm: string;
  region: string;
  parent_guild?: string;
}

export const GUILDS: TrackedGuild[] = [
  { name: "Tuju", realm: "Kazzak", region: "EU" },
  { name: "ST-Raid", realm: "Stormreaver", region: "EU", parent_guild: "IHAN SAMA" },
  { name: "PH-Tiimi", realm: "Stormreaver", region: "EU", parent_guild: "IHAN SAMA" },
  { name: "CE-Tiimi", realm: "Stormreaver", region: "EU", parent_guild: "IHAN SAMA" },
  { name: "käsipainoilla bodaus", realm: "Stormreaver", region: "EU" },
];

export const GUILDS_PROD: TrackedGuild[] = [
  { name: "Tuju", realm: "Kazzak", region: "EU" },
  { name: "IHAN SAMA", realm: "Stormreaver", region: "EU" },
  { name: "ST-Raid", realm: "Stormreaver", region: "EU", parent_guild: "IHAN SAMA" },
  { name: "PH-Tiimi", realm: "Stormreaver", region: "EU", parent_guild: "IHAN SAMA" },
  { name: "CE-Tiimi", realm: "Stormreaver", region: "EU", parent_guild: "IHAN SAMA" },
  { name: "Kilta", realm: "Ravencrest", region: "EU" },
  { name: "käsipainoilla bodaus", realm: "Stormreaver", region: "EU" },
  { name: "Nave", realm: "Kazzak", region: "EU" },
  { name: "Pohjoinen", realm: "Kazzak", region: "EU" },
  { name: "Marras", realm: "Kazzak", region: "EU" },
  { name: "LkaksP Issue", realm: "Stormreaver", region: "EU" },
  { name: "TURTLES KIMBLE", realm: "Tarren-Mill", region: "EU" },
  { name: "Beyond Harmless", realm: "Sylvanas", region: "EU" },
  { name: "HinausYhtiö", realm: "Twisting-Nether", region: "EU" },
  { name: "Kultzipuppelit", realm: "Stormreaver", region: "EU" },
  { name: "Taikaolennot", realm: "Outland", region: "EU" },
  { name: "Hakkapeliitta", realm: "Darkspear", region: "EU" },
  { name: "Urheilujätkät", realm: "Stormreaver", region: "EU" },
  { name: "Näkijän taru", realm: "Bloodfeather", region: "EU" },
  { name: "Forbidden", realm: "Vashj", region: "EU" },
  { name: "Tony Halme Pro Skater", realm: "Stormreaver", region: "EU" },
  { name: "Slack", realm: "Stormreaver", region: "EU" },
  { name: "Kelacity", realm: "Stormreaver", region: "EU", parent_guild: "Tony Halme Pro Skater" },
  { name: "Muisted", realm: "Stormreaver", region: "EU" },
  { name: "TURBO SAAB", realm: "Stormreaver", region: "EU" },
  { name: "Rennosti", realm: "Stormreaver", region: "EU" },
  { name: "Winland", realm: "Silvermoon", region: "EU" },
  { name: "Kaaos", realm: "Argent-Dawn", region: "EU" },
  { name: "Noni", realm: "Stormreaver", region: "EU" },
  { name: "Memento", realm: "Stormreaver", region: "EU" },
  { name: "Memento", realm: "Frostwhisper", region: "EU" },
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

// Current raids that are actively being tracked for updates
// Multiple raids can be current at the same time during expansion transitions
export const CURRENT_RAID_IDS = [TRACKED_RAIDS[0]];

export const DIFFICULTIES = {
  MYTHIC: 5,
  HEROIC: 4,
  NORMAL: 3,
  LFR: 1,
};
