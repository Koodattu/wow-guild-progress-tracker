import type { GuildNetworkTier } from "@/types";

export type GuildNetworkMode = "tier" | "all" | "flow";

export type NetworkBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type NetworkGuild = {
  name: string;
  realm: string;
  hue: number;
  totalReports: number;
  tierCount: number;
  characterCount: number;
  searchText: string;
};

export type NetworkCharacter = {
  name: string;
  realm: string;
  classID: number;
  totalReports: number;
  tierCount: number;
  guildCount: number;
  memberships: number[];
  aliases?: string[];
  searchText: string;
};

export type TierNetworkLayout = {
  tierIndex: number;
  bounds: NetworkBounds;
  guildIndex: Uint32Array;
  guildX: Float32Array;
  guildY: Float32Array;
  guildRadius: Float32Array;
  guildMembers: Uint32Array;
  guildReports: Uint32Array;
  nodeCharacterIndex: Uint32Array;
  nodeGuildIndex: Uint32Array;
  nodeX: Float32Array;
  nodeY: Float32Array;
  nodeReports: Uint32Array;
};

export type AllNetworkLayout = {
  bounds: NetworkBounds;
  guildIndex: Uint32Array;
  guildX: Float32Array;
  guildY: Float32Array;
  guildRadius: Float32Array;
  guildMembers: Uint32Array;
  guildReports: Uint32Array;
  nodeCharacterIndex: Uint32Array;
  nodeGuildIndex: Uint32Array;
  nodeX: Float32Array;
  nodeY: Float32Array;
  nodeReports: Uint32Array;
  fiberFromGuildIndex: Uint32Array;
  fiberToGuildIndex: Uint32Array;
  fiberCharacterIndex: Uint32Array;
  fiberReports: Uint32Array;
};

export type FlowBlock = {
  key: string;
  tierIndex: number;
  guildIndex: number | null;
  x: number;
  y: number;
  height: number;
  members: number;
  reports: number;
};

export type FlowRibbon = {
  fromKey: string;
  toKey: string;
  fromY: number;
  toY: number;
  height: number;
  members: number;
  reports: number;
  guildIndex: number | null;
};

export type FlowNetworkLayout = {
  bounds: NetworkBounds;
  blocks: FlowBlock[];
  ribbons: FlowRibbon[];
};

export type BuiltGuildNetwork = {
  schemaVersion: number;
  generatedAt: string;
  sourceUpdatedAt: string | null;
  rowCount: number;
  tiers: GuildNetworkTier[];
  realms: string[];
  guilds: NetworkGuild[];
  characters: NetworkCharacter[];
  tierLayouts: TierNetworkLayout[];
  allLayout: AllNetworkLayout;
  flowLayout: FlowNetworkLayout;
  stats: {
    totalReports: number;
    multiGuildCharacters: number;
    multiTierCharacters: number;
    maxCharacterReports: number;
  };
};

export type WorkerLoadMessage = {
  type: "load";
  universeUrl: string;
};

export type WorkerReadyMessage = {
  type: "ready";
  network: BuiltGuildNetwork;
};

export type WorkerErrorMessage = {
  type: "error";
  error: string;
};

export type WorkerStatusMessage = {
  type: "status";
  message: string;
};

export type WorkerMessage = WorkerReadyMessage | WorkerErrorMessage | WorkerStatusMessage;
