import { ReactNode } from "react";

export interface BestPullPhase {
  phaseId: number;
  phaseName: string;
  bossHealth: number;
  fightCompletion: number;
  displayString: string; // e.g., "45% P3"
}

// Pull history entry for progress charts
export interface PullHistoryEntry {
  pullNumber: number;
  fightPercentage: number; // 0-100, where 0 = kill, 100 = instant wipe
  phase?: string; // Phase identifier like "P1", "P2", "I1" etc.
  isKill: boolean;
}

// Phase distribution for pie chart
export interface PhaseDistribution {
  phase: string;
  count: number;
}

// Response from getBossPullHistory API
export interface BossPullHistoryResponse {
  pullHistory: PullHistoryEntry[];
  phaseDistribution: PhaseDistribution[];
}

export interface GuildCrest {
  emblem: {
    id: number;
    imageName: string;
    color: {
      r: number;
      g: number;
      b: number;
      a: number;
    };
  };
  border: {
    id: number;
    imageName: string;
    color: {
      r: number;
      g: number;
      b: number;
      a: number;
    };
  };
  background: {
    color: {
      r: number;
      g: number;
      b: number;
      a: number;
    };
  };
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
  bestPullReportCode?: string; // WCL report code for best pull (for unkilled bosses)
  bestPullFightId?: number; // Fight ID within the report for best pull (for unkilled bosses)
  pullHistory?: PullHistoryEntry[]; // Pull history for progress charts (up to first kill)
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
  worldRank?: number; // World progress rank from WarcraftLogs
  worldRankColor?: string; // Color class for the world rank
  guildRank?: number; // Rank among tracked guilds (1 = best)
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
  worldRank?: number; // World progress rank from WarcraftLogs
  worldRankColor?: string; // Color class for the world rank
  guildRank?: number; // Rank among tracked guilds (1 = best)
  lastUpdated: string;
}

export interface ScheduleDisplay {
  totalDays: number;
  averageHours: number;
}

export interface Streamer {
  channelName: string;
  isLive: boolean;
}

export interface LiveStreamer {
  channelName: string;
  isLive: boolean;
  isPlayingWoW: boolean;
  gameName?: string;
  guild: {
    name: string;
    realm: string;
    region: string;
    parent_guild?: string;
  };
  bestPull?: {
    bossName: string;
    pullCount: number;
    bestPercent: number;
    bestPullPhase?: BestPullPhase;
  };
}

// Ultra-minimal guild info for directory/list page
export interface GuildDirectoryItem {
  name: string;
  realm: string;
  region: string;
  parent_guild?: string;
  warcraftlogsId?: number;
  isCurrentlyRaiding: boolean;
}

// Minimal guild info for leaderboard
export interface GuildListItem {
  _id: string;
  name: string;
  realm: string;
  region: string;
  faction?: string;
  warcraftlogsId?: number;
  crest?: GuildCrest;
  parent_guild?: string; // Parent guild name if this is a team/sub-guild
  isCurrentlyRaiding: boolean;
  isStreaming?: boolean; // Computed field: true if any streamer is live
  lastFetched?: string;
  progress: RaidProgressSummary[];
  scheduleDisplay?: ScheduleDisplay | null;
}

// Tier score for a single category
export interface TierScoreEntry {
  overallScore: number;
  speedScore: number;
  efficiencyScore: number;
}

// Tier score for a specific raid
export interface RaidTierScoreEntry extends TierScoreEntry {
  raidId: number;
  raidName: string;
}

// Guild tier scores (overall + current raids)
export interface GuildTierScores {
  overall: TierScoreEntry | null;
  raids: RaidTierScoreEntry[];
}

// Guild with summary progress (for guild profile page initial load)
export interface GuildSummary {
  _id: string;
  name: string;
  realm: string;
  region: string;
  faction?: string;
  warcraftlogsId?: number;
  crest?: GuildCrest;
  parent_guild?: string; // Parent guild name if this is a team/sub-guild
  isCurrentlyRaiding: boolean;
  lastFetched?: string;
  progress: RaidProgressSummary[];
  scheduleDisplay?: ScheduleDisplay | null;
  raidSchedule?: RaidSchedule;
  streamers?: Streamer[]; // Twitch streamers for this guild
  tierScores?: GuildTierScores | null; // Tier list scores for this guild
}

// Full guild info with detailed boss progress (for detail view)
export interface Guild {
  _id: string;
  name: string;
  realm: string;
  region: string;
  faction?: string;
  warcraftlogsId?: number;
  crest?: GuildCrest;
  parent_guild?: string; // Parent guild name if this is a team/sub-guild
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

// Home page data response (single endpoint with all data)
export interface HomePageData {
  raid: {
    id: number;
    name: string;
    slug: string;
    expansion: string;
    iconUrl?: string;
  };
  dates: RaidDates;
  guilds: GuildListItem[];
  events: Event[];
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

export interface PaginationInfo {
  page: number;
  limit: number;
  totalPages: number;
  totalCount: number;
}

export interface EventsResponse {
  events: Event[];
  pagination: PaginationInfo;
}

export interface RaidScheduleDay {
  day: string; // "Monday", "Tuesday", etc.
  startHour: number; // 0-23.5 (supports half hours)
  endHour: number; // 0-23.5 (supports half hours)
}

export interface RaidSchedule {
  days: RaidScheduleDay[];
  lastCalculated?: string;
}

export interface GuildSchedule {
  _id: string;
  name: string;
  realm: string;
  region: string;
  parent_guild?: string;
  raidSchedule: RaidSchedule;
}

// Tier List types
export interface GuildTierScore {
  guildId: string;
  guildName: string;
  realm: string;
  faction?: string;
  crest?: GuildCrest;
  parent_guild?: string;
  overallScore: number;
  speedScore: number;
  efficiencyScore: number;
}

export interface RaidTierList {
  raidId: number;
  raidName: string;
  guilds: GuildTierScore[];
}

export interface TierList {
  calculatedAt: string;
  overall: GuildTierScore[];
  raids: RaidTierList[];
}

// Response for overall tier list only (without per-raid data)
export interface OverallTierListResponse {
  calculatedAt: string;
  guilds: GuildTierScore[];
}

// Response for a specific raid tier list
export interface RaidTierListResponse {
  calculatedAt: string;
  raidId: number;
  raidName: string;
  guilds: GuildTierScore[];
}

// Available raid info from tier list
export interface TierListRaidInfo {
  raidId: number;
  raidName: string;
}

// Analytics types
export interface AnalyticsPeriodStats {
  totalRequests: number;
  avgResponseTime: number;
  totalDataTransferred: number;
  formattedData: string;
}

export interface AnalyticsOverview {
  last24Hours: AnalyticsPeriodStats;
  last7Days: AnalyticsPeriodStats;
  last30Days: AnalyticsPeriodStats;
}

export interface AnalyticsHourly {
  hour: string;
  requests: number;
  avgResponseTime: number;
  dataTransferred: number;
  formattedData: string;
}

export interface AnalyticsDaily {
  date: string;
  requests: number;
  avgResponseTime: number;
  dataTransferred: number;
  formattedData: string;
}

export interface AnalyticsEndpoint {
  endpoint: string;
  count: number;
  avgResponseTime: number;
  totalSize: number;
  formattedSize: string;
  successRate: number;
  errorCount: number;
  methods?: string[];
  lastCalled?: string;
}

export interface AnalyticsStatusCode {
  statusCode: number;
  count: number;
}

export interface AnalyticsRecent {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  responseSize: number;
  formattedSize: string;
  timestamp: string;
}

export interface AnalyticsRealtime {
  currentHour: {
    requests: number;
    avgResponseTime: number;
    dataTransferred: string;
  };
  requestsPerMinute: number;
}

export interface AnalyticsPeakHour {
  hour: number;
  hourLabel: string;
  totalRequests: number;
  avgRequests: number;
  avgResponseTime: number;
}

export interface AnalyticsPeakHours {
  hours: AnalyticsPeakHour[];
  peakHour: AnalyticsPeakHour;
}

export interface AnalyticsTrends {
  weekOverWeek: {
    current: number;
    previous: number;
    change: number;
    dataChange: number;
  };
  dayOverDay: {
    current: number;
    previous: number;
    change: number;
    dataChange: number;
  };
}

export interface AnalyticsSlowEndpoint {
  endpoint: string;
  count: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  p95ResponseTime: number;
}

export interface AnalyticsErrorDetail {
  endpoint: string;
  statusCode: number;
  count: number;
  lastOccurred: string;
}

export interface AnalyticsErrorSummary {
  endpoint: string;
  totalErrors: number;
  statusCodes: Record<number, number>;
}

export interface AnalyticsErrors {
  details: AnalyticsErrorDetail[];
  summary: AnalyticsErrorSummary[];
}

// User/Auth types
export interface DiscordUserInfo {
  username: string;
  avatarUrl: string;
}

export interface TwitchUserInfo {
  displayName: string;
  profileImageUrl: string | null;
  connectedAt: string;
}

export interface WoWCharacter {
  id: number;
  name: string;
  realm: string;
  realmSlug?: string; // Only present when fetching all characters
  class: string;
  race: string;
  level: number;
  faction: "ALLIANCE" | "HORDE";
  guild?: string;
  selected: boolean;
  inactive?: boolean;
}

export interface BattleNetUserInfo {
  battletag: string;
  connectedAt: string;
  characters: WoWCharacter[];
  lastCharacterSync: string | null;
}

export interface User {
  discord: DiscordUserInfo;
  twitch?: TwitchUserInfo;
  battlenet?: BattleNetUserInfo;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string;
}

// Admin Panel types
export interface AdminUser {
  id: string;
  discord: {
    id: string;
    username: string;
    hasAvatar: boolean;
  };
  twitch: {
    displayName: string;
    connectedAt: string;
  } | null;
  battlenet: {
    battletag: string;
    connectedAt: string;
  } | null;
  createdAt: string;
  lastLoginAt: string;
}

export interface AdminGuild {
  id: string;
  name: string;
  realm: string;
  region: string;
  faction?: string;
  warcraftlogsId?: number;
  parentGuild?: string;
  isCurrentlyRaiding: boolean;
  lastFetched?: string;
  createdAt?: string;
  progress?: {
    raidName: string;
    difficulty: string;
    bossesDefeated: number;
    totalBosses: number;
  }[];
}

export interface AdminPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminUsersResponse {
  users: AdminUser[];
  pagination: AdminPagination;
}

export interface AdminGuildsResponse {
  guilds: AdminGuild[];
  pagination: AdminPagination;
}

export interface AdminUserStats {
  total: number;
  active: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  };
  connections: {
    twitch: number;
    battlenet: number;
  };
}

export interface AdminGuildStats {
  total: number;
  currentlyRaiding: number;
  withWarcraftlogsId: number;
  factions: Record<string, number>;
}

export interface AdminOverview {
  users: {
    total: number;
    activeToday: number;
  };
  guilds: {
    total: number;
    updatedToday: number;
  };
}

// Pickems types
export type PickemType = "regular" | "rwf";

export interface ScoringConfig {
  exactMatch: number;
  offByOne: number;
  offByTwo: number;
  offByThree: number;
  offByFour: number;
  offByFiveOrMore: number;
}

export interface StreakConfig {
  enabled: boolean;
  minLength: number;
  bonusPerGuild: number;
}

export interface PickemSummary {
  id: string;
  name: string;
  type: PickemType;
  raidIds: number[];
  guildCount: number;
  votingStart: string;
  votingEnd: string;
  isVotingOpen: boolean;
  hasEnded: boolean;
  scoringConfig?: ScoringConfig;
  streakConfig?: StreakConfig;
  finalized: boolean;
  finalRankings: string[];
  finalizedAt: string | null;
}

export interface PickemPrediction {
  guildName: string;
  realm: string;
  position: number;
}

export interface GuildRanking {
  rank: number;
  name: string;
  realm: string;
  bossesKilled?: number;
  totalBosses?: number;
  isComplete?: boolean;
  lastKillTime?: string | null;
}

export interface LeaderboardPrediction {
  guildName: string;
  realm: string;
  predictedRank: number;
  actualRank: number | null;
  points: number;
}

export interface StreakInfo {
  length: number;
  guilds: string[];
}

export interface LeaderboardEntry {
  username: string;
  avatarUrl: string;
  totalPoints: number;
  positionPoints?: number;
  streakBonus?: number;
  streaks?: StreakInfo[];
  predictions: LeaderboardPrediction[];
}

export interface PickemDetails {
  id: string;
  name: string;
  type: PickemType;
  raidIds: number[];
  guildCount: number;
  votingStart: string;
  votingEnd: string;
  isVotingOpen: boolean;
  hasEnded: boolean;
  scoringConfig?: ScoringConfig;
  streakConfig?: StreakConfig;
  finalized: boolean;
  finalRankings: string[];
  finalizedAt: string | null;
  guildRankings: GuildRanking[];
  userPredictions: PickemPrediction[] | null;
  leaderboard: LeaderboardEntry[];
}

export interface SimpleGuild {
  name: string;
  realm: string;
}

// Admin Pickem types
export interface AdminPickem {
  _id: string;
  pickemId: string;
  name: string;
  type: PickemType;
  raidIds: number[];
  guildCount: number;
  votingStart: string;
  votingEnd: string;
  active: boolean;
  scoringConfig: ScoringConfig;
  streakConfig: StreakConfig;
  finalized: boolean;
  finalRankings: string[];
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPickemStats {
  total: number;
  active: number;
  votingOpen: number;
  totalParticipants: number;
}

export interface AdminPickemsResponse {
  pickems: AdminPickem[];
  stats: AdminPickemStats;
}

export interface CreatePickemInput {
  pickemId: string;
  name: string;
  type?: PickemType;
  raidIds?: number[];
  guildCount?: number;
  votingStart: string;
  votingEnd: string;
  active?: boolean;
  scoringConfig?: Partial<ScoringConfig>;
  streakConfig?: Partial<StreakConfig>;
}

export interface UpdatePickemInput {
  name?: string;
  type?: PickemType;
  raidIds?: number[];
  guildCount?: number;
  votingStart?: string;
  votingEnd?: string;
  active?: boolean;
  scoringConfig?: Partial<ScoringConfig>;
  streakConfig?: Partial<StreakConfig>;
}

export type CharacterRankingRow = {
  character: {
    wclCanonicalCharacterId: number;
    name: string;
    realm: string;
    region: string;
    classID: number;
  };
  context: {
    zoneId: number;
    difficulty: number;
    metric: "dps" | "hps";
    partition?: number;
    encounterId: number | null;
    specName?: string;
    bestSpecName?: string;
    role?: "dps" | "healer" | "tank";
    ilvl?: number;
  };
  encounter?: {
    id: number;
    name: string;
  };
  score: {
    type: "allStars" | "bestAmount";
    value: number;
  };
  stats: {
    allStars?: { points: number; possiblePoints: number };
    bestAmount?: number;
    rankPercent?: number;
    medianPercent?: number;
    lockedIn?: boolean;
    totalKills?: number;
  };
  updatedAt?: string;
};

export type Spec = {
  name: string;
  role: "dps" | "healer" | "tank";
};

export type ClassInfo = {
  id: number;
  name: string;
  iconUrl: string;
  specs: Spec[];
};

export type ColumnDef<T> = {
  id: string;
  header: string;
  accessor?: (row: T, index: number) => ReactNode;
  width?: string; // e.g., "w-1/6"
  sortable?: boolean;
};

// ============================================================================
// RAID ANALYTICS TYPES
// ============================================================================

// Pull count statistics (stripped - no guild references)
export interface AnalyticsPullStats {
  average: number;
  lowest: number;
  highest: number;
}

// Time spent statistics (stripped - no guild references)
export interface AnalyticsTimeStats {
  average: number; // in seconds
  lowest: number;
  highest: number;
}

// Kill progression entry (for cumulative charts) - legacy, kept for compatibility
export interface KillProgressionEntry {
  date: string;
  killCount: number;
}

// Clear progression entry (for cumulative charts) - legacy, kept for compatibility
export interface ClearProgressionEntry {
  date: string;
  clearCount: number;
}

// Guild entry for distribution bucket tooltips (stripped - name and realm only)
export interface GuildDistributionEntry {
  name: string;
  realm: string;
}

// Pre-calculated distribution bucket
export interface DistributionBucket {
  label: string;
  count: number;
  guilds: GuildDistributionEntry[];
}

// Pre-calculated distribution data
export interface Distribution {
  buckets: DistributionBucket[];
}

// Pre-calculated weekly progression entry
export interface WeeklyProgressionEntry {
  weekNumber: number;
  value: number;
  label: string; // "W1", "W2", etc.
}

// Boss analytics
export interface BossAnalytics {
  bossId: number;
  bossName: string;
  guildsKilled: number;
  guildsProgressing: number;
  pullCount: AnalyticsPullStats;
  timeSpent: AnalyticsTimeStats;
  pullDistribution: Distribution;
  timeDistribution: Distribution;
  weeklyProgression: WeeklyProgressionEntry[];
}

// Overall raid analytics
export interface RaidOverallAnalytics {
  guildsCleared: number;
  guildsProgressing: number;
  pullCount: AnalyticsPullStats;
  timeSpent: AnalyticsTimeStats;
  pullDistribution: Distribution;
  timeDistribution: Distribution;
  weeklyProgression: WeeklyProgressionEntry[];
}

// Full raid analytics response (stripped - no difficulty, _id, __v, etc.)
export interface RaidAnalytics {
  raidId: number;
  raidName: string;
  overall: RaidOverallAnalytics;
  bosses?: BossAnalytics[]; // Optional since /all endpoint doesn't include bosses
  raidStart?: string;
  raidEnd?: string;
  lastCalculated: string;
}

// Available raid for analytics
export interface RaidAnalyticsListItem {
  raidId: number;
  raidName: string;
  lastCalculated: string;
}
