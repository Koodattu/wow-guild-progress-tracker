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

export interface Guild {
  _id: string;
  name: string;
  realm: string;
  region: string;
  faction?: string;
  iconUrl?: string;
  progress: RaidProgress[];
  lastFetched?: string;
  createdAt: string;
  updatedAt: string;
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

export interface Raid {
  _id: string;
  id: number;
  name: string;
  slug: string;
  expansion: string;
  bosses: Boss[];
  createdAt: string;
  updatedAt: string;
}
