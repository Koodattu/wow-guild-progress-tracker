import type { GuildNetworkUniverse } from "@/types";
import type {
  AllNetworkLayout,
  BuiltGuildNetwork,
  FlowBlock,
  FlowNetworkLayout,
  FlowRibbon,
  NetworkBounds,
  NetworkCharacter,
  NetworkGuild,
  TierNetworkLayout,
  WorkerLoadMessage,
  WorkerMessage,
} from "./guild-network-types";

type WorkerContext = typeof globalThis & {
  postMessage: (message: WorkerMessage) => void;
  addEventListener: (type: "message", listener: (event: MessageEvent<WorkerLoadMessage>) => void) => void;
};

const ctx = self as unknown as WorkerContext;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FLOW_GUILDS_PER_TIER = 34;
const MAX_FIBERS = 18000;
const CLUSTER_Y_SCALE = 0.74;

type CharacterMembership = {
  tierIndex: number;
  guildIndex: number;
  reports: number;
};

type ParsedCharacter = {
  name: string;
  realm: string;
  classID: number;
  aliases?: string[];
  memberships: CharacterMembership[];
  flatMemberships: number[];
  totalReports: number;
  guilds: Set<number>;
  tiers: Set<number>;
};

type TierGuildMap = Map<number, Map<number, number>>;

type GuildAggregate = {
  guildIndex: number;
  members: number;
  reports: number;
  charReports: Map<number, number>;
};

function post(message: WorkerMessage) {
  ctx.postMessage(message);
}

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function emptyBounds(): NetworkBounds {
  return { minX: -240, minY: -180, maxX: 240, maxY: 180 };
}

function expandBounds(bounds: NetworkBounds, x: number, y: number, radius = 0) {
  bounds.minX = Math.min(bounds.minX, x - radius);
  bounds.minY = Math.min(bounds.minY, y - radius);
  bounds.maxX = Math.max(bounds.maxX, x + radius);
  bounds.maxY = Math.max(bounds.maxY, y + radius);
}

function guildHue(index: number): number {
  return (index * 137.508 + 205) % 360;
}

function layoutGuildCenters(guilds: GuildAggregate[]): Map<number, { x: number; y: number; radius: number }> {
  const centers = new Map<number, { x: number; y: number; radius: number }>();
  const count = guilds.length;
  const extent = Math.max(320, Math.sqrt(Math.max(count, 1)) * 115);

  guilds.forEach((guild, index) => {
    const clusterRadius = clamp(28 + Math.sqrt(guild.members) * 3.2, 38, 178);
    if (count === 1) {
      centers.set(guild.guildIndex, { x: 0, y: 0, radius: clusterRadius });
      return;
    }

    const ring = Math.sqrt((index + 0.5) / count);
    const angle = index * GOLDEN_ANGLE;
    centers.set(guild.guildIndex, {
      x: Math.cos(angle) * ring * extent,
      y: Math.sin(angle) * ring * extent * CLUSTER_Y_SCALE,
      radius: clusterRadius,
    });
  });

  return centers;
}

function toUint32(values: number[]): Uint32Array {
  return new Uint32Array(values.map((value) => Math.max(0, Math.floor(value))));
}

function toFloat32(values: number[]): Float32Array {
  return new Float32Array(values);
}

function sortGuildAggregates(map: TierGuildMap): GuildAggregate[] {
  return Array.from(map.entries())
    .map(([guildIndex, charReports]) => {
      let reports = 0;
      for (const value of charReports.values()) reports += value;
      return {
        guildIndex,
        members: charReports.size,
        reports,
        charReports,
      };
    })
    .sort((a, b) => b.members - a.members || b.reports - a.reports || a.guildIndex - b.guildIndex);
}

function parseUniverse(universe: GuildNetworkUniverse): {
  characters: ParsedCharacter[];
  tierGuildMaps: TierGuildMap[];
  allGuildMap: TierGuildMap;
} {
  const tierGuildMaps = universe.tiers.map(() => new Map<number, Map<number, number>>());
  const allGuildMap: TierGuildMap = new Map();

  const characters = universe.characters.map((entry, characterIndex) => {
    const [name, realmIndex, classID, flatMemberships, aliases] = entry;
    const realm = universe.realms[realmIndex] || "Unknown";
    const memberships: CharacterMembership[] = [];
    const guilds = new Set<number>();
    const tiers = new Set<number>();
    let totalReports = 0;

    for (let i = 0; i < flatMemberships.length; i += 3) {
      const tierIndex = flatMemberships[i];
      const guildIndex = flatMemberships[i + 1];
      const reports = flatMemberships[i + 2] || 0;
      if (tierIndex === undefined || guildIndex === undefined || tierIndex < 0 || guildIndex < 0 || reports <= 0) continue;

      memberships.push({ tierIndex, guildIndex, reports });
      guilds.add(guildIndex);
      tiers.add(tierIndex);
      totalReports += reports;

      const tierMap = tierGuildMaps[tierIndex];
      if (tierMap) {
        let charMap = tierMap.get(guildIndex);
        if (!charMap) {
          charMap = new Map();
          tierMap.set(guildIndex, charMap);
        }
        charMap.set(characterIndex, (charMap.get(characterIndex) || 0) + reports);
      }

      let allCharMap = allGuildMap.get(guildIndex);
      if (!allCharMap) {
        allCharMap = new Map();
        allGuildMap.set(guildIndex, allCharMap);
      }
      allCharMap.set(characterIndex, (allCharMap.get(characterIndex) || 0) + reports);
    }

    return {
      name,
      realm,
      classID,
      aliases,
      memberships,
      flatMemberships,
      totalReports,
      guilds,
      tiers,
    };
  });

  return { characters, tierGuildMaps, allGuildMap };
}

function buildTierLayout(tierIndex: number, tierMap: TierGuildMap): TierNetworkLayout {
  const guildAggregates = sortGuildAggregates(tierMap);
  const centers = layoutGuildCenters(guildAggregates);
  const bounds = guildAggregates.length ? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity } : emptyBounds();

  const guildIndex: number[] = [];
  const guildX: number[] = [];
  const guildY: number[] = [];
  const guildRadius: number[] = [];
  const guildMembers: number[] = [];
  const guildReports: number[] = [];
  const nodeCharacterIndex: number[] = [];
  const nodeGuildIndex: number[] = [];
  const nodeX: number[] = [];
  const nodeY: number[] = [];
  const nodeReports: number[] = [];

  for (const guild of guildAggregates) {
    const center = centers.get(guild.guildIndex);
    if (!center) continue;

    guildIndex.push(guild.guildIndex);
    guildX.push(center.x);
    guildY.push(center.y);
    guildRadius.push(center.radius);
    guildMembers.push(guild.members);
    guildReports.push(guild.reports);
    expandBounds(bounds, center.x, center.y, center.radius + 28);

    const members = Array.from(guild.charReports.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const spreadRadius = Math.max(8, center.radius - 8);
    members.forEach(([characterIndex, reports], index) => {
      const pointRadius = Math.sqrt((index + 0.5) / Math.max(members.length, 1)) * spreadRadius;
      const angle = index * GOLDEN_ANGLE;
      nodeCharacterIndex.push(characterIndex);
      nodeGuildIndex.push(guild.guildIndex);
      nodeX.push(center.x + Math.cos(angle) * pointRadius);
      nodeY.push(center.y + Math.sin(angle) * pointRadius);
      nodeReports.push(reports);
    });
  }

  return {
    tierIndex,
    bounds,
    guildIndex: toUint32(guildIndex),
    guildX: toFloat32(guildX),
    guildY: toFloat32(guildY),
    guildRadius: toFloat32(guildRadius),
    guildMembers: toUint32(guildMembers),
    guildReports: toUint32(guildReports),
    nodeCharacterIndex: toUint32(nodeCharacterIndex),
    nodeGuildIndex: toUint32(nodeGuildIndex),
    nodeX: toFloat32(nodeX),
    nodeY: toFloat32(nodeY),
    nodeReports: toUint32(nodeReports),
  };
}

function buildAllLayout(characters: ParsedCharacter[], allGuildMap: TierGuildMap): AllNetworkLayout {
  const guildAggregates = sortGuildAggregates(allGuildMap);
  const centers = layoutGuildCenters(guildAggregates);
  const bounds = guildAggregates.length ? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity } : emptyBounds();

  const guildIndex: number[] = [];
  const guildX: number[] = [];
  const guildY: number[] = [];
  const guildRadius: number[] = [];
  const guildMembers: number[] = [];
  const guildReports: number[] = [];
  const nodeCharacterIndex: number[] = [];
  const nodeGuildIndex: number[] = [];
  const nodeX: number[] = [];
  const nodeY: number[] = [];
  const nodeReports: number[] = [];

  const primaryGuildByCharacter = new Map<number, number>();
  const rankedGuildsByCharacter = new Map<number, Array<[number, number]>>();

  characters.forEach((character, characterIndex) => {
    const reportsByGuild = new Map<number, number>();
    for (const membership of character.memberships) {
      reportsByGuild.set(membership.guildIndex, (reportsByGuild.get(membership.guildIndex) || 0) + membership.reports);
    }
    const ranked = Array.from(reportsByGuild.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    rankedGuildsByCharacter.set(characterIndex, ranked);
    if (ranked[0]) primaryGuildByCharacter.set(characterIndex, ranked[0][0]);
  });

  for (const guild of guildAggregates) {
    const center = centers.get(guild.guildIndex);
    if (!center) continue;

    guildIndex.push(guild.guildIndex);
    guildX.push(center.x);
    guildY.push(center.y);
    guildRadius.push(center.radius);
    guildMembers.push(guild.members);
    guildReports.push(guild.reports);
    expandBounds(bounds, center.x, center.y, center.radius + 28);

    const members = Array.from(guild.charReports.entries())
      .filter(([characterIndex]) => primaryGuildByCharacter.get(characterIndex) === guild.guildIndex)
      .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const spreadRadius = Math.max(8, center.radius - 8);
    members.forEach(([characterIndex, reports], index) => {
      const pointRadius = Math.sqrt((index + 0.5) / Math.max(members.length, 1)) * spreadRadius;
      const angle = index * GOLDEN_ANGLE;
      nodeCharacterIndex.push(characterIndex);
      nodeGuildIndex.push(guild.guildIndex);
      nodeX.push(center.x + Math.cos(angle) * pointRadius);
      nodeY.push(center.y + Math.sin(angle) * pointRadius);
      nodeReports.push(characters[characterIndex]?.totalReports || reports);
    });
  }

  const fiberCandidates: Array<{ from: number; to: number; character: number; reports: number }> = [];
  for (const [characterIndex, ranked] of rankedGuildsByCharacter.entries()) {
    if (ranked.length < 2) continue;
    fiberCandidates.push({
      from: ranked[0][0],
      to: ranked[1][0],
      character: characterIndex,
      reports: ranked[1][1],
    });
  }
  fiberCandidates.sort((a, b) => b.reports - a.reports);
  const fibers = fiberCandidates.slice(0, MAX_FIBERS).filter((fiber) => centers.has(fiber.from) && centers.has(fiber.to));

  return {
    bounds,
    guildIndex: toUint32(guildIndex),
    guildX: toFloat32(guildX),
    guildY: toFloat32(guildY),
    guildRadius: toFloat32(guildRadius),
    guildMembers: toUint32(guildMembers),
    guildReports: toUint32(guildReports),
    nodeCharacterIndex: toUint32(nodeCharacterIndex),
    nodeGuildIndex: toUint32(nodeGuildIndex),
    nodeX: toFloat32(nodeX),
    nodeY: toFloat32(nodeY),
    nodeReports: toUint32(nodeReports),
    fiberFromGuildIndex: toUint32(fibers.map((fiber) => fiber.from)),
    fiberToGuildIndex: toUint32(fibers.map((fiber) => fiber.to)),
    fiberCharacterIndex: toUint32(fibers.map((fiber) => fiber.character)),
    fiberReports: toUint32(fibers.map((fiber) => fiber.reports)),
  };
}

function primaryGuildForTier(character: ParsedCharacter, tierIndex: number): { guildIndex: number; reports: number } | null {
  let selected: { guildIndex: number; reports: number } | null = null;
  for (const membership of character.memberships) {
    if (membership.tierIndex !== tierIndex) continue;
    if (!selected || membership.reports > selected.reports) {
      selected = { guildIndex: membership.guildIndex, reports: membership.reports };
    }
  }
  return selected;
}

function buildFlowLayout(characters: ParsedCharacter[], tierGuildMaps: TierGuildMap[]): FlowNetworkLayout {
  if (tierGuildMaps.length === 0) {
    return { bounds: emptyBounds(), blocks: [], ribbons: [] };
  }

  const xStep = 270;
  const columnHeight = 760;
  const blockGap = 7;
  const blockWidth = 64;
  const topGuildSets = tierGuildMaps.map((tierMap) => new Set(sortGuildAggregates(tierMap).slice(0, FLOW_GUILDS_PER_TIER).map((guild) => guild.guildIndex)));
  const blocks: FlowBlock[] = [];
  const blockByKey = new Map<string, FlowBlock>();
  const scaleByTier = new Map<number, number>();

  tierGuildMaps.forEach((tierMap, tierIndex) => {
    const topGuilds = topGuildSets[tierIndex];
    const topAggregates = sortGuildAggregates(tierMap).filter((guild) => topGuilds.has(guild.guildIndex));
    let otherMembers = 0;
    let otherReports = 0;
    for (const [guildIndex, charReports] of tierMap.entries()) {
      if (topGuilds.has(guildIndex)) continue;
      otherMembers += charReports.size;
      for (const reports of charReports.values()) otherReports += reports;
    }

    const aggregates = [...topAggregates];
    if (otherMembers > 0) {
      aggregates.push({
        guildIndex: -1,
        members: otherMembers,
        reports: otherReports,
        charReports: new Map(),
      });
    }

    const totalMembers = Math.max(1, aggregates.reduce((sum, guild) => sum + guild.members, 0));
    const rawScale = columnHeight / totalMembers;
    scaleByTier.set(tierIndex, rawScale);
    const heights = aggregates.map((guild) => Math.max(11, guild.members * rawScale));
    const totalHeight = heights.reduce((sum, height) => sum + height, 0) + Math.max(0, heights.length - 1) * blockGap;
    let y = -totalHeight / 2;

    aggregates.forEach((guild, index) => {
      const height = heights[index];
      const key = `${tierIndex}:${guild.guildIndex}`;
      const block: FlowBlock = {
        key,
        tierIndex,
        guildIndex: guild.guildIndex >= 0 ? guild.guildIndex : null,
        x: tierIndex * xStep,
        y: y + height / 2,
        height,
        members: guild.members,
        reports: guild.reports,
      };
      blocks.push(block);
      blockByKey.set(key, block);
      y += height + blockGap;
    });
  });

  const ribbonCounts = new Map<string, { fromKey: string; toKey: string; members: number; reports: number; guildIndex: number | null }>();
  for (let tierIndex = 0; tierIndex < tierGuildMaps.length - 1; tierIndex += 1) {
    const fromTop = topGuildSets[tierIndex];
    const toTop = topGuildSets[tierIndex + 1];

    characters.forEach((character) => {
      const from = primaryGuildForTier(character, tierIndex);
      const to = primaryGuildForTier(character, tierIndex + 1);
      if (!from || !to) return;

      const fromGuild = fromTop.has(from.guildIndex) ? from.guildIndex : -1;
      const toGuild = toTop.has(to.guildIndex) ? to.guildIndex : -1;
      const fromKey = `${tierIndex}:${fromGuild}`;
      const toKey = `${tierIndex + 1}:${toGuild}`;
      if (!blockByKey.has(fromKey) || !blockByKey.has(toKey)) return;

      const key = `${fromKey}>${toKey}`;
      const existing = ribbonCounts.get(key);
      if (existing) {
        existing.members += 1;
        existing.reports += Math.min(from.reports, to.reports);
      } else {
        ribbonCounts.set(key, {
          fromKey,
          toKey,
          members: 1,
          reports: Math.min(from.reports, to.reports),
          guildIndex: fromGuild >= 0 ? fromGuild : null,
        });
      }
    });
  }

  const fromOffsets = new Map<string, number>();
  const toOffsets = new Map<string, number>();
  for (const block of blocks) {
    fromOffsets.set(block.key, block.y - block.height / 2);
    toOffsets.set(block.key, block.y - block.height / 2);
  }

  const ribbons: FlowRibbon[] = Array.from(ribbonCounts.values())
    .sort((a, b) => a.fromKey.localeCompare(b.fromKey) || b.members - a.members || a.toKey.localeCompare(b.toKey))
    .map((entry) => {
      const fromBlock = blockByKey.get(entry.fromKey);
      const toBlock = blockByKey.get(entry.toKey);
      const fromScale = fromBlock ? fromBlock.height / Math.max(1, fromBlock.members) : scaleByTier.get(Number(entry.fromKey.split(":")[0])) || 1;
      const toScale = toBlock ? toBlock.height / Math.max(1, toBlock.members) : scaleByTier.get(Number(entry.toKey.split(":")[0])) || 1;
      const height = Math.max(1.6, entry.members * Math.min(fromScale, toScale));
      const fromStart = fromOffsets.get(entry.fromKey) || 0;
      const toStart = toOffsets.get(entry.toKey) || 0;
      fromOffsets.set(entry.fromKey, fromStart + height);
      toOffsets.set(entry.toKey, toStart + height);
      return {
        fromKey: entry.fromKey,
        toKey: entry.toKey,
        fromY: fromStart + height / 2,
        toY: toStart + height / 2,
        height,
        members: entry.members,
        reports: entry.reports,
        guildIndex: entry.guildIndex,
      };
    });

  const bounds = blocks.length ? { minX: -blockWidth, minY: Infinity, maxX: (tierGuildMaps.length - 1) * xStep + blockWidth, maxY: -Infinity } : emptyBounds();
  for (const block of blocks) {
    expandBounds(bounds, block.x, block.y, Math.max(blockWidth, block.height / 2));
  }

  return { bounds, blocks, ribbons };
}

function buildNetwork(universe: GuildNetworkUniverse): BuiltGuildNetwork {
  const { characters, tierGuildMaps, allGuildMap } = parseUniverse(universe);
  const guildCharacterSets = universe.guilds.map(() => new Set<number>());
  const guildTierSets = universe.guilds.map(() => new Set<number>());
  const guildReportTotals = universe.guilds.map(() => 0);
  let totalReports = 0;
  let multiGuildCharacters = 0;
  let multiTierCharacters = 0;
  let maxCharacterReports = 0;

  characters.forEach((character, characterIndex) => {
    totalReports += character.totalReports;
    maxCharacterReports = Math.max(maxCharacterReports, character.totalReports);
    if (character.guilds.size > 1) multiGuildCharacters += 1;
    if (character.tiers.size > 1) multiTierCharacters += 1;

    for (const membership of character.memberships) {
      guildCharacterSets[membership.guildIndex]?.add(characterIndex);
      guildTierSets[membership.guildIndex]?.add(membership.tierIndex);
      guildReportTotals[membership.guildIndex] = (guildReportTotals[membership.guildIndex] || 0) + membership.reports;
    }
  });

  const guilds: NetworkGuild[] = universe.guilds.map(([name, realmIndex], index) => {
    const realm = universe.realms[realmIndex] || "Unknown";
    return {
      name,
      realm,
      hue: guildHue(index),
      totalReports: guildReportTotals[index] || 0,
      tierCount: guildTierSets[index]?.size || 0,
      characterCount: guildCharacterSets[index]?.size || 0,
      searchText: normalizeSearch(`${name} ${realm}`),
    };
  });

  const networkCharacters: NetworkCharacter[] = characters.map((character) => ({
    name: character.name,
    realm: character.realm,
    classID: character.classID,
    totalReports: character.totalReports,
    tierCount: character.tiers.size,
    guildCount: character.guilds.size,
    memberships: character.flatMemberships,
    aliases: character.aliases,
    searchText: normalizeSearch(`${character.name} ${character.realm} ${(character.aliases || []).join(" ")}`),
  }));

  return {
    schemaVersion: universe.schemaVersion,
    generatedAt: universe.generatedAt,
    sourceUpdatedAt: universe.sourceUpdatedAt,
    rowCount: universe.rowCount,
    tiers: universe.tiers,
    realms: universe.realms,
    guilds,
    characters: networkCharacters,
    tierLayouts: tierGuildMaps.map((tierMap, tierIndex) => buildTierLayout(tierIndex, tierMap)),
    allLayout: buildAllLayout(characters, allGuildMap),
    flowLayout: buildFlowLayout(characters, tierGuildMaps),
    stats: {
      totalReports,
      multiGuildCharacters,
      multiTierCharacters,
      maxCharacterReports,
    },
  };
}

async function loadNetwork(universeUrl: string) {
  post({ type: "status", message: "Downloading network snapshot" });
  const response = await fetch(universeUrl, { cache: "force-cache" });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Guild network snapshot has not been built yet");
    }
    throw new Error(`Failed to download guild network snapshot (${response.status})`);
  }

  post({ type: "status", message: "Building graph layouts" });
  const universe = (await response.json()) as GuildNetworkUniverse;
  const network = buildNetwork(universe);
  post({ type: "ready", network });
}

ctx.addEventListener("message", (event: MessageEvent<WorkerLoadMessage>) => {
  if (event.data.type !== "load") return;
  loadNetwork(event.data.universeUrl).catch((error) => {
    post({ type: "error", error: error instanceof Error ? error.message : "Failed to build guild network" });
  });
});

export {};
