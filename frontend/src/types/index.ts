export interface BestPullPhase {
  phaseId: number;
  phaseName: string;
  bossHealth: number;
  fightCompletion: number;
  displayString: string; // e.g., "45% P3"
}

export interface BossProgress {
  bossId: number;
  bossName: string;
  kills: number;
  bestPercent: number; // Best pull: lowest boss health % reached (0 = kill, 100 = no progress)
  pullCount: number;
  timeSpent: number;
  firstKillTime?: string;
  firstKillReportCode?: string; // WCL report code for first kill
  firstKillFightId?: number; // Fight ID within the report
  killOrder?: number; // Order in which this boss was first killed (1 = first, 2 = second, etc.)
  bestPullPhase?: BestPullPhase; // Phase context for best pull
  lastUpdated: string;
}

// Minimal progress for leaderboard (without detailed bosses array)
export interface RaidProgressSummary {
  raidId: number;
  raidName: string;
  difficulty: "mythic" | "heroic";
  bossesDefeated: number;
  totalBosses: number;
  totalTimeSpent: number;
  currentBossPulls: number;
  bestPullPercent: number;
  bestPullPhase?: BestPullPhase;
  lastKillTime?: string | null; // Timestamp of the most recent boss kill
}

// Full progress with bosses array (for guild detail view)
export interface RaidProgress {
  raidId: number;
  raidName: string;
  difficulty: "mythic" | "heroic";
  bossesDefeated: number;
  totalBosses: number;
  totalTimeSpent: number;
  bosses: BossProgress[];
  lastUpdated: string;
}

// Minimal guild info for leaderboard
export interface GuildListItem {
  _id: string;
  name: string;
  realm: string;
  region: string;
  faction?: string;
  isCurrentlyRaiding: boolean;
  lastFetched?: string;
  progress: RaidProgressSummary[];
}

// Full guild info with detailed boss progress (for detail view)
export interface Guild {
  _id: string;
  name: string;
  realm: string;
  region: string;
  faction?: string;
  isCurrentlyRaiding: boolean;
  lastFetched?: string;
  progress: RaidProgress[];
}

export interface Event {
  _id: string;
  type: "boss_kill" | "best_pull" | "milestone";
  guildId: string;
  guildName: string;
  raidId: number;
  raidName: string;
  bossId: number;
  bossName: string;
  difficulty: "mythic" | "heroic";
  data: {
    killRank?: number;
    pullCount?: number;
    bestPercent?: number;
    timeSpent?: number;
    progressDisplay?: string; // Phase-enhanced display string like "45% P3"
  };
  timestamp: string;
  createdAt: string;
}

export interface Boss {
  id: number;
  name: string;
  slug: string;
  iconUrl?: string;
}

export interface RegionDates {
  us?: string;
  eu?: string;
  tw?: string;
  kr?: string;
  cn?: string;
}

export interface RaidDates {
  starts?: RegionDates;
  ends?: RegionDates;
}

// Minimal raid info (without bosses or dates) - used in raid selector
export interface RaidInfo {
  id: number;
  name: string;
  slug: string;
  expansion: string;
  iconUrl?: string;
}

// Full raid info with bosses and dates - for backward compatibility
export interface Raid extends RaidInfo {
  starts?: RegionDates;
  ends?: RegionDates;
  bosses: Boss[];
  _id?: string; // Optional for backward compatibility
  createdAt?: string; // Optional for backward compatibility
  updatedAt?: string; // Optional for backward compatibility
}
