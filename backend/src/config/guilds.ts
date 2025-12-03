export interface TrackedGuild {
  name: string;
  realm: string;
  region: string;
  parent_guild?: string;
  streamers?: string[]; // Twitch channel names
}

export const GUILDS: TrackedGuild[] = [
  { name: "Tuju", realm: "Kazzak", region: "EU", streamers: ["vaarattu", "forsen", "b0aty", "wiba"] },
  { name: "ST-Raid", realm: "Stormreaver", region: "EU", parent_guild: "IHAN SAMA", streamers: ["kukkis12"] },
  { name: "PH-Tiimi", realm: "Stormreaver", region: "EU", parent_guild: "IHAN SAMA", streamers: ["suhruu"] },
  { name: "CE-Tiimi", realm: "Stormreaver", region: "EU", parent_guild: "IHAN SAMA", streamers: ["zetabeachh"] },
  { name: "HinausYhtiö", realm: "Twisting-Nether", region: "EU", streamers: ["aamunkajo_", "rrrrage"] },
  { name: "Kilta", realm: "Ravencrest", region: "EU", streamers: ["nasuxi"] },
  { name: "Kultzipuppelit", realm: "Stormreaver", region: "EU", streamers: ["janeli"] },
  { name: "Näkijän taru", realm: "Bloodfeather", region: "EU", streamers: ["croukou"] },
  { name: "käsipainoilla bodaus", realm: "Stormreaver", region: "EU", streamers: ["ventrixi", "kermisgg", "apepforever"] },
  { name: "Hakkapeliitta", realm: "Darkspear", region: "EU", streamers: ["xofe"] },
];

export const GUILDS_PROD: TrackedGuild[] = [
  { name: "Tuju", realm: "Kazzak", region: "EU", streamers: ["vaarattu", "kahvig", "forsen"] },
  { name: "IHAN SAMA", realm: "Stormreaver", region: "EU" },
  { name: "ST-Raid", realm: "Stormreaver", region: "EU", parent_guild: "IHAN SAMA", streamers: ["kukkis12"] },
  { name: "PH-Tiimi", realm: "Stormreaver", region: "EU", parent_guild: "IHAN SAMA", streamers: ["suhruu"] },
  { name: "CE-Tiimi", realm: "Stormreaver", region: "EU", parent_guild: "IHAN SAMA", streamers: ["zetabeachh"] },
  { name: "Kilta", realm: "Ravencrest", region: "EU", streamers: ["nasuxi"] },
  { name: "käsipainoilla bodaus", realm: "Stormreaver", region: "EU", streamers: ["ventrixi", "kermisgg", "apepforever"] },
  { name: "Nave", realm: "Kazzak", region: "EU" },
  { name: "Pohjoinen", realm: "Kazzak", region: "EU" },
  { name: "Marras", realm: "Kazzak", region: "EU" },
  { name: "LkaksP Issue", realm: "Stormreaver", region: "EU", streamers: ["persecticus", "diskopallo"] },
  { name: "TURTLES KIMBLE", realm: "Tarren-Mill", region: "EU", streamers: ["baldoora", "heiqs"] },
  { name: "Beyond Harmless", realm: "Sylvanas", region: "EU", streamers: ["jonim0", "deeheals"] },
  { name: "HinausYhtiö", realm: "Twisting-Nether", region: "EU", streamers: ["aamunkajo_", "rrrrage"] },
  { name: "Kultzipuppelit", realm: "Stormreaver", region: "EU", streamers: ["janeli"] },
  { name: "Taikaolennot", realm: "Outland", region: "EU" },
  { name: "Hakkapeliitta", realm: "Darkspear", region: "EU", streamers: ["xofe"] },
  { name: "Urheilujätkät", realm: "Stormreaver", region: "EU" },
  { name: "Näkijän taru", realm: "Bloodfeather", region: "EU", streamers: ["croukou"] },
  { name: "Forbidden", realm: "Vashj", region: "EU", streamers: ["byrchi"] },
  { name: "Tony Halme Pro Skater", realm: "Stormreaver", region: "EU", streamers: ["lakuclap", "mjog", "iyni"] },
  { name: "Slack", realm: "Stormreaver", region: "EU", streamers: ["realriski"] },
  { name: "Kelacity", realm: "Stormreaver", region: "EU", parent_guild: "Tony Halme Pro Skater" },
  { name: "Muisted", realm: "Stormreaver", region: "EU", streamers: ["alfamyscars", "purelysofie"] },
  { name: "TURBO SAAB", realm: "Stormreaver", region: "EU", streamers: ["kartssa"] },
  { name: "Rennosti", realm: "Stormreaver", region: "EU" },
  { name: "Winland", realm: "Silvermoon", region: "EU" },
  { name: "Kaaos", realm: "Argent-Dawn", region: "EU" },
  { name: "Noni", realm: "Stormreaver", region: "EU", streamers: ["suomimeme"] },
  { name: "Memento", realm: "Stormreaver", region: "EU" },
  { name: "Memento", realm: "Frostwhisper", region: "EU" },
  { name: "Karanteeni", realm: "Ravencrest", region: "EU" },
  { name: "Intervention", realm: "Stormreaver", region: "EU" },
  { name: "Saunan Taakse", realm: "Stormreaver", region: "EU" },
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

// Manual raid dates for raids not available in Raider.IO API
// These are EU region dates only for now
export const MANUAL_RAID_DATES = [
  {
    id: 4,
    name: "Throne of Thunder",
    euStartDate: "2013-03-06",
    euEndDate: "2013-09-11",
  },
  {
    id: 5,
    name: "Siege of Orgrimmar",
    euStartDate: "2013-09-11",
    euEndDate: "2014-12-03",
  },
  {
    id: 6,
    name: "Highmaul",
    euStartDate: "2014-12-03",
    euEndDate: "2015-02-04",
  },
  {
    id: 7,
    name: "Blackrock Foundry",
    euStartDate: "2015-02-04",
    euEndDate: "2015-06-24",
  },
  {
    id: 8,
    name: "Hellfire Citadel",
    euStartDate: "2015-06-24",
    euEndDate: "2016-07-20",
  },
];
