import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOST = process.env.POC_HOST || "127.0.0.1";
const PORT = Number(process.env.POC_PORT || 3015);
const MONGO_CONTAINER = process.env.POC_MONGO_CONTAINER || "wow-prog-db";
const MONGO_DB = process.env.POC_MONGO_DB || "wow_guild_tracker";
const PUBLIC_DIR = path.join(__dirname, "guild-network-poc");

const TRACKED_RAIDS = [
  46, 44, 42, 38, 35, 33, 31, 29, 28, 26, 24, 23, 22, 21, 19, 17, 13, 12, 11, 10, 8, 7, 6, 5, 4,
];

const CLASS_NAMES = {
  1: "Death Knight",
  2: "Druid",
  3: "Hunter",
  4: "Mage",
  5: "Monk",
  6: "Paladin",
  7: "Priest",
  8: "Rogue",
  9: "Shaman",
  10: "Warlock",
  11: "Warrior",
  12: "Demon Hunter",
  13: "Evoker",
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const htmlHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, jsonHeaders);
  res.end(JSON.stringify(payload));
}

function parseInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function parseBoolean(value) {
  return value === "1" || value === "true" || value === "yes";
}

function parseScope(url) {
  const requestedScope = url.searchParams.get("scope") || "raid";
  const scope = ["raid", "recent", "all"].includes(requestedScope) ? requestedScope : "raid";
  const zoneId = parseInteger(url.searchParams.get("zoneId"), TRACKED_RAIDS[0], { min: 1, max: 10000 });
  const recentCount = parseInteger(url.searchParams.get("recentCount"), 4, { min: 2, max: TRACKED_RAIDS.length });

  if (scope === "all") {
    return {
      scope,
      zoneId,
      zoneIds: TRACKED_RAIDS,
      recentCount,
      label: "All tracked raids",
    };
  }

  if (scope === "recent") {
    return {
      scope,
      zoneId,
      zoneIds: TRACKED_RAIDS.slice(0, recentCount),
      recentCount,
      label: `Latest ${recentCount} raids`,
    };
  }

  return {
    scope: "raid",
    zoneId,
    zoneIds: [zoneId],
    recentCount,
    label: "Selected raid",
  };
}

function mongoEval(source) {
  return new Promise((resolve, reject) => {
    execFile(
      "docker",
      ["exec", MONGO_CONTAINER, "mongosh", MONGO_DB, "--quiet", "--eval", source],
      {
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 24,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim() || stdout.trim() || error.message;
          reject(new Error(detail));
          return;
        }

        const text = stdout.trim();
        if (!text) {
          resolve(null);
          return;
        }

        try {
          resolve(JSON.parse(text));
        } catch {
          reject(new Error(`Mongo query returned non-JSON output: ${text.slice(0, 500)}`));
        }
      },
    );
  });
}

function mongoPreamble() {
  return `
const TRACKED_RAIDS = ${JSON.stringify(TRACKED_RAIDS)};
const CLASS_NAMES = ${JSON.stringify(CLASS_NAMES)};
const RAID_ORDER = new Map(TRACKED_RAIDS.map((id, index) => [id, index]));
function escapeRegex(value) {
  return String(value).replace(/[.*+?^$(){}|[\\]\\\\]/g, "\\\\$&");
}
function identityForRow(row) {
  if (row.wclCanonicalCharacterId !== null && row.wclCanonicalCharacterId !== undefined) {
    return "c:" + row.wclCanonicalCharacterId + ":" + row.classID;
  }

  return [
    "f",
    String(row.characterRegion || "").toLowerCase(),
    String(row.characterRealm || "").toLowerCase(),
    String(row.characterName || "").toLowerCase(),
    row.classID
  ].join(":");
}
function identityExpression() {
  return {
    $cond: [
      { $ne: ["$wclCanonicalCharacterId", null] },
      { $concat: ["c:", { $toString: "$wclCanonicalCharacterId" }, ":", { $toString: "$classID" }] },
      {
        $concat: [
          "f:",
          { $toLower: { $ifNull: ["$characterRegion", ""] } },
          ":",
          { $toLower: { $ifNull: ["$characterRealm", ""] } },
          ":",
          { $toLower: { $ifNull: ["$characterName", ""] } },
          ":",
          { $toString: "$classID" }
        ]
      }
    ]
  };
}
function iso(value) {
  return value && typeof value.toISOString === "function" ? value.toISOString() : value || null;
}
function raidSort(a, b) {
  return (RAID_ORDER.get(a) ?? 999) - (RAID_ORDER.get(b) ?? 999);
}
function sortedRaidIds(input) {
  return Array.from(input).sort(raidSort);
}
`;
}

async function getRaids() {
  const script = `${mongoPreamble()}
const statsRows = db.characterraidparticipations.aggregate([
  { $match: { zoneId: { $in: TRACKED_RAIDS } } },
  {
    $group: {
      _id: "$zoneId",
      rows: { $sum: 1 },
      reports: { $sum: "$reportCount" },
      guilds: { $addToSet: "$reportGuildId" },
      identities: { $addToSet: identityExpression() }
    }
  },
  {
    $project: {
      _id: 0,
      zoneId: "$_id",
      rows: 1,
      reports: 1,
      guildCount: { $size: "$guilds" },
      characterCount: { $size: "$identities" }
    }
  }
], { allowDiskUse: true }).toArray();

const statsByZone = new Map(statsRows.map((row) => [row.zoneId, row]));
const raidRows = db.raids.find(
  { id: { $in: TRACKED_RAIDS } },
  { _id: 0, id: 1, name: 1, expansion: 1, slug: 1 }
).toArray();
const raidById = new Map(raidRows.map((raid) => [raid.id, raid]));

const raids = TRACKED_RAIDS
  .map((id) => {
    const raid = raidById.get(id) || { id, name: "Raid " + id, expansion: "Unknown", slug: "raid-" + id };
    const stats = statsByZone.get(id) || { rows: 0, reports: 0, guildCount: 0, characterCount: 0 };
    return {
      id,
      name: raid.name,
      expansion: raid.expansion,
      slug: raid.slug,
      rows: stats.rows,
      reports: stats.reports,
      guildCount: stats.guildCount,
      characterCount: stats.characterCount
    };
  })
  .filter((raid) => raid.rows > 0);

print(JSON.stringify({ raids }));
`;

  return mongoEval(script);
}

async function getGraph(url) {
  const scope = parseScope(url);
  const minShared = parseInteger(url.searchParams.get("minShared"), 2, { min: 1, max: 50 });
  const minReports = parseInteger(url.searchParams.get("minReports"), 1, { min: 1, max: 100 });
  const limitGuilds = parseInteger(url.searchParams.get("limitGuilds"), 80, { min: 10, max: 180 });
  const canonicalOnly = parseBoolean(url.searchParams.get("canonicalOnly"));
  const focusIdentity = url.searchParams.get("focus") || "";

  const script = `${mongoPreamble()}
const scope = ${JSON.stringify(scope)};
const zoneIds = ${JSON.stringify(scope.zoneIds)};
const minShared = ${JSON.stringify(minShared)};
const minReports = ${JSON.stringify(minReports)};
const limitGuilds = ${JSON.stringify(limitGuilds)};
const canonicalOnly = ${JSON.stringify(canonicalOnly)};
const focusIdentity = ${JSON.stringify(focusIdentity)};

const raidRows = db.raids.find(
  { id: { $in: Array.from(new Set([...zoneIds, ...TRACKED_RAIDS])) } },
  { _id: 0, id: 1, name: 1, expansion: 1, slug: 1 }
).toArray();
const raidById = new Map(raidRows.map((raid) => [raid.id, raid]));
function raidDto(id, reports) {
  const raid = raidById.get(id) || { id, name: "Raid " + id, expansion: "Unknown", slug: "raid-" + id };
  return { id, name: raid.name, expansion: raid.expansion, slug: raid.slug, reports: reports || 0 };
}
function compactRaidLabel(ids) {
  const sorted = sortedRaidIds(ids);
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return raidDto(sorted[0]).name;
  return raidDto(sorted[0]).name + " to " + raidDto(sorted[sorted.length - 1]).name;
}

const match = { zoneId: { $in: zoneIds }, reportCount: { $gte: minReports } };
if (canonicalOnly) {
  match.wclCanonicalCharacterId = { $type: "number" };
}

const rows = db.characterraidparticipations.find(match, {
  _id: 0,
  wclCanonicalCharacterId: 1,
  zoneId: 1,
  reportGuildId: 1,
  reportGuildName: 1,
  reportGuildRealm: 1,
  characterName: 1,
  characterRealm: 1,
  characterRegion: 1,
  classID: 1,
  firstSeenAt: 1,
  lastSeenAt: 1,
  reportCount: 1
}).toArray();

const guilds = new Map();
const characters = new Map();

function getRaidReports(map, zoneId) {
  const key = String(zoneId);
  return map.get(key) || 0;
}

for (const row of rows) {
  const guildId = String(row.reportGuildId);
  const identity = identityForRow(row);

  if (!guilds.has(guildId)) {
    guilds.set(guildId, {
      id: guildId,
      name: row.reportGuildName,
      realm: row.reportGuildRealm,
      activeCharacters: 0,
      reportCount: 0,
      raidIds: new Set(),
      raidReports: new Map(),
      firstSeenAt: iso(row.firstSeenAt),
      lastSeenAt: iso(row.lastSeenAt)
    });
  }

  const guild = guilds.get(guildId);
  guild.activeCharacters += 1;
  guild.reportCount += row.reportCount || 0;
  guild.raidIds.add(row.zoneId);
  guild.raidReports.set(String(row.zoneId), getRaidReports(guild.raidReports, row.zoneId) + (row.reportCount || 0));
  if (row.firstSeenAt && (!guild.firstSeenAt || row.firstSeenAt < new Date(guild.firstSeenAt))) guild.firstSeenAt = iso(row.firstSeenAt);
  if (row.lastSeenAt && (!guild.lastSeenAt || row.lastSeenAt > new Date(guild.lastSeenAt))) guild.lastSeenAt = iso(row.lastSeenAt);

  if (!characters.has(identity)) {
    characters.set(identity, {
      id: identity,
      canonicalId: row.wclCanonicalCharacterId ?? null,
      name: row.characterName,
      realm: row.characterRealm,
      region: row.characterRegion,
      classID: row.classID,
      className: CLASS_NAMES[row.classID] || "Class " + row.classID,
      guildMap: new Map(),
      raidIds: new Set(),
      totalReports: 0,
      firstSeenAt: iso(row.firstSeenAt),
      lastSeenAt: iso(row.lastSeenAt)
    });
  }

  const character = characters.get(identity);
  character.name = row.characterName || character.name;
  character.realm = row.characterRealm || character.realm;
  character.region = row.characterRegion || character.region;
  character.raidIds.add(row.zoneId);
  character.totalReports += row.reportCount || 0;
  if (row.firstSeenAt && (!character.firstSeenAt || row.firstSeenAt < new Date(character.firstSeenAt))) character.firstSeenAt = iso(row.firstSeenAt);
  if (row.lastSeenAt && (!character.lastSeenAt || row.lastSeenAt > new Date(character.lastSeenAt))) character.lastSeenAt = iso(row.lastSeenAt);

  if (!character.guildMap.has(guildId)) {
    character.guildMap.set(guildId, {
      id: guildId,
      name: row.reportGuildName,
      realm: row.reportGuildRealm,
      reports: 0,
      raidIds: new Set(),
      raidReports: new Map(),
      firstSeenAt: iso(row.firstSeenAt),
      lastSeenAt: iso(row.lastSeenAt)
    });
  }

  const characterGuild = character.guildMap.get(guildId);
  characterGuild.reports += row.reportCount || 0;
  characterGuild.raidIds.add(row.zoneId);
  characterGuild.raidReports.set(String(row.zoneId), getRaidReports(characterGuild.raidReports, row.zoneId) + (row.reportCount || 0));
  if (row.firstSeenAt && (!characterGuild.firstSeenAt || row.firstSeenAt < new Date(characterGuild.firstSeenAt))) characterGuild.firstSeenAt = iso(row.firstSeenAt);
  if (row.lastSeenAt && (!characterGuild.lastSeenAt || row.lastSeenAt > new Date(characterGuild.lastSeenAt))) characterGuild.lastSeenAt = iso(row.lastSeenAt);
}

function guildDto(guild, connectionWeight) {
  const raidIds = sortedRaidIds(guild.raidIds);
  return {
    id: guild.id,
    name: guild.name,
    realm: guild.realm,
    activeCharacters: guild.activeCharacters,
    reportCount: guild.reportCount,
    raidCount: raidIds.length,
    raidIds,
    raids: raidIds.map((id) => raidDto(id, getRaidReports(guild.raidReports, id))),
    firstSeenAt: guild.firstSeenAt,
    lastSeenAt: guild.lastSeenAt,
    connectionWeight: connectionWeight || 0
  };
}

function characterDto(character) {
  const raidIds = sortedRaidIds(character.raidIds);
  const guilds = Array.from(character.guildMap.values())
    .map((guild) => {
      const guildRaidIds = sortedRaidIds(guild.raidIds);
      return {
        id: guild.id,
        name: guild.name,
        realm: guild.realm,
        reports: guild.reports,
        raidCount: guildRaidIds.length,
        raidIds: guildRaidIds,
        raids: guildRaidIds.map((id) => raidDto(id, getRaidReports(guild.raidReports, id))),
        firstSeenAt: guild.firstSeenAt,
        lastSeenAt: guild.lastSeenAt
      };
    })
    .sort((a, b) => b.reports - a.reports || a.name.localeCompare(b.name));

  return {
    id: character.id,
    canonicalId: character.canonicalId,
    name: character.name,
    realm: character.realm,
    region: character.region,
    classID: character.classID,
    className: character.className,
    guildCount: guilds.length,
    raidCount: raidIds.length,
    raidIds,
    raids: raidIds.map((id) => raidDto(id, 0)),
    totalReports: character.totalReports,
    firstSeenAt: character.firstSeenAt,
    lastSeenAt: character.lastSeenAt,
    guilds
  };
}

const selectedCharacter = focusIdentity ? characters.get(focusIdentity) : null;
const edgeMap = new Map();
const bridges = [];

for (const character of characters.values()) {
  const characterGuilds = Array.from(character.guildMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  if (characterGuilds.length < 2) continue;

  bridges.push(characterDto(character));

  for (let i = 0; i < characterGuilds.length; i += 1) {
    for (let j = i + 1; j < characterGuilds.length; j += 1) {
      const source = characterGuilds[i];
      const target = characterGuilds[j];
      const key = source.id + "|" + target.id;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          id: key,
          source: source.id,
          target: target.id,
          sharedCharacters: 0,
          reportWeight: 0,
          raidIds: new Set(),
          overlapRaidIds: new Set(),
          firstSeenAt: null,
          lastSeenAt: null,
          hasFocusCharacter: false,
          examples: []
        });
      }

      const edge = edgeMap.get(key);
      const sourceRaidIds = sortedRaidIds(source.raidIds);
      const targetRaidIds = sortedRaidIds(target.raidIds);
      const overlapRaidIds = sourceRaidIds.filter((id) => target.raidIds.has(id));
      const unionRaidIds = sortedRaidIds(new Set([...sourceRaidIds, ...targetRaidIds]));
      edge.sharedCharacters += 1;
      edge.reportWeight += Math.min(source.reports, target.reports);
      unionRaidIds.forEach((id) => edge.raidIds.add(id));
      overlapRaidIds.forEach((id) => edge.overlapRaidIds.add(id));
      if (!edge.firstSeenAt || new Date(character.firstSeenAt) < new Date(edge.firstSeenAt)) edge.firstSeenAt = character.firstSeenAt;
      if (!edge.lastSeenAt || new Date(character.lastSeenAt) > new Date(edge.lastSeenAt)) edge.lastSeenAt = character.lastSeenAt;
      if (character.id === focusIdentity) edge.hasFocusCharacter = true;

      if (edge.examples.length < 16 || character.id === focusIdentity) {
        edge.examples.push({
          id: character.id,
          canonicalId: character.canonicalId,
          name: character.name,
          realm: character.realm,
          region: character.region,
          classID: character.classID,
          className: character.className,
          sourceReports: source.reports,
          targetReports: target.reports,
          totalReports: character.totalReports,
          raidCount: unionRaidIds.length,
          raidIds: unionRaidIds,
          overlapRaidIds,
          sourceGuild: { id: source.id, name: source.name, realm: source.realm },
          targetGuild: { id: target.id, name: target.name, realm: target.realm }
        });
      }
    }
  }
}

let allEdges = Array.from(edgeMap.values()).map((edge) => {
  const raidIds = sortedRaidIds(edge.raidIds);
  const overlapRaidIds = sortedRaidIds(edge.overlapRaidIds);
  return {
    ...edge,
    raidIds,
    overlapRaidIds,
    raidCount: raidIds.length,
    overlapRaidCount: overlapRaidIds.length,
    raidLabel: compactRaidLabel(raidIds),
    examples: edge.examples
      .sort((a, b) => (b.id === focusIdentity ? 1 : 0) - (a.id === focusIdentity ? 1 : 0) || b.totalReports - a.totalReports)
      .slice(0, 16)
  };
});

let edges = allEdges
  .filter((edge) => edge.sharedCharacters >= minShared || edge.hasFocusCharacter)
  .sort((a, b) => b.sharedCharacters - a.sharedCharacters || b.raidCount - a.raidCount || b.reportWeight - a.reportWeight);

const nodeScores = new Map();
for (const edge of edges) {
  nodeScores.set(edge.source, (nodeScores.get(edge.source) || 0) + edge.sharedCharacters);
  nodeScores.set(edge.target, (nodeScores.get(edge.target) || 0) + edge.sharedCharacters);
}

const keptGuildIds = new Set(
  Array.from(nodeScores.entries())
    .sort((a, b) => b[1] - a[1] || guilds.get(a[0]).name.localeCompare(guilds.get(b[0]).name))
    .slice(0, limitGuilds)
    .map(([id]) => id)
);

if (selectedCharacter) {
  for (const guild of selectedCharacter.guildMap.values()) {
    keptGuildIds.add(guild.id);
  }
}

edges = edges.filter((edge) => keptGuildIds.has(edge.source) && keptGuildIds.has(edge.target));

const nodes = Array.from(keptGuildIds)
  .map((id) => guildDto(guilds.get(id), nodeScores.get(id) || 0))
  .sort((a, b) => b.connectionWeight - a.connectionWeight || a.name.localeCompare(b.name));

const bridgeList = bridges
  .sort((a, b) => b.guildCount - a.guildCount || b.raidCount - a.raidCount || b.totalReports - a.totalReports || a.name.localeCompare(b.name))
  .slice(0, 120);

const scopeRaids = sortedRaidIds(zoneIds).map((id) => raidDto(id, 0));
const primaryRaid = raidById.get(scope.zoneId) || raidDto(scope.zoneId, 0);

print(JSON.stringify({
  scope: {
    ...scope,
    raidCount: scopeRaids.length,
    raids: scopeRaids,
    label: scope.scope === "raid" ? primaryRaid.name : scope.label
  },
  raid: primaryRaid,
  params: { minShared, minReports, limitGuilds, canonicalOnly, focusIdentity },
  stats: {
    rows: rows.length,
    activeGuilds: guilds.size,
    activeCharacters: characters.size,
    multiGuildCharacters: bridges.length,
    connectedGuilds: nodes.length,
    edges: edges.length,
    allEdges: allEdges.length,
    raidCount: scopeRaids.length
  },
  nodes,
  edges,
  bridges: bridgeList,
  selectedCharacter: selectedCharacter ? characterDto(selectedCharacter) : null
}));
`;

  return mongoEval(script);
}

async function searchCharacters(url) {
  const query = (url.searchParams.get("q") || "").trim();
  if (query.length < 2) {
    return { characters: [] };
  }

  const scope = parseScope(url);
  const minReports = parseInteger(url.searchParams.get("minReports"), 1, { min: 1, max: 100 });
  const canonicalOnly = parseBoolean(url.searchParams.get("canonicalOnly"));
  const limit = parseInteger(url.searchParams.get("limit"), 12, { min: 1, max: 25 });

  const script = `${mongoPreamble()}
const query = ${JSON.stringify(query)};
const zoneIds = ${JSON.stringify(scope.zoneIds)};
const minReports = ${JSON.stringify(minReports)};
const canonicalOnly = ${JSON.stringify(canonicalOnly)};
const limit = ${JSON.stringify(limit)};
const match = {
  zoneId: { $in: zoneIds },
  reportCount: { $gte: minReports },
  characterName: new RegExp("^" + escapeRegex(query), "i")
};
if (canonicalOnly) {
  match.wclCanonicalCharacterId = { $type: "number" };
}

const rows = db.characterraidparticipations.aggregate([
  { $match: match },
  { $sort: { lastSeenAt: -1 } },
  {
    $group: {
      _id: identityExpression(),
      canonicalId: { $first: "$wclCanonicalCharacterId" },
      name: { $first: "$characterName" },
      realm: { $first: "$characterRealm" },
      region: { $first: "$characterRegion" },
      classID: { $first: "$classID" },
      guilds: { $addToSet: "$reportGuildId" },
      raidIds: { $addToSet: "$zoneId" },
      totalReports: { $sum: "$reportCount" },
      firstSeenAt: { $min: "$firstSeenAt" },
      lastSeenAt: { $max: "$lastSeenAt" }
    }
  },
  {
    $project: {
      _id: 0,
      id: "$_id",
      canonicalId: 1,
      name: 1,
      realm: 1,
      region: 1,
      classID: 1,
      guildCount: { $size: "$guilds" },
      raidCount: { $size: "$raidIds" },
      raidIds: 1,
      totalReports: 1,
      firstSeenAt: 1,
      lastSeenAt: 1
    }
  },
  { $sort: { guildCount: -1, raidCount: -1, totalReports: -1, lastSeenAt: -1, name: 1 } },
  { $limit: limit }
], { allowDiskUse: true }).toArray();

const characters = rows.map((row) => ({
  ...row,
  className: CLASS_NAMES[row.classID] || "Class " + row.classID,
  raidIds: sortedRaidIds(row.raidIds || []),
  firstSeenAt: iso(row.firstSeenAt),
  lastSeenAt: iso(row.lastSeenAt)
}));

print(JSON.stringify({ characters }));
`;

  return mongoEval(script);
}

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  try {
    if (url.pathname === "/api/raids") {
      sendJson(res, 200, await getRaids());
      return;
    }

    if (url.pathname === "/api/graph") {
      sendJson(res, 200, await getGraph(url));
      return;
    }

    if (url.pathname === "/api/characters") {
      sendJson(res, 200, await searchCharacters(url));
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = await readFile(path.join(PUBLIC_DIR, "index.html"), "utf8");
      res.writeHead(200, htmlHeaders);
      res.end(html);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error),
      hint: `This dev PoC expects Docker container "${MONGO_CONTAINER}" with mongosh and database "${MONGO_DB}".`,
    });
  }
}

const server = createServer((req, res) => {
  handleRequest(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Guild network PoC running at http://${HOST}:${PORT}`);
  console.log(`Reading MongoDB through Docker container "${MONGO_CONTAINER}", database "${MONGO_DB}"`);
});
