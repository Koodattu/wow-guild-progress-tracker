export interface BossProgress {
  bossId: number;
  bossName: string;
  kills: number;
  bestPercent: number;
  pullCount: number;
  timeSpent: number;
  firstKillTime?: string;
  firstKillReportCode?: string; // WCL report code for first kill
  firstKillFightId?: number; // Fight ID within the report
  killOrder?: number; // Order in which this boss was first killed (1 = first, 2 = second, etc.)
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
  };
  timestamp: string;
  createdAt: string;
}
