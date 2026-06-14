// Raider Constellation PoC server.
//
// Serves a single static page plus one endpoint, /api/universe, which returns the
// entire character <-> guild participation history in one compact payload:
//   - tiers: tracked raid tiers ordered chronologically by first sighting
//   - realms: string table for realm names
//   - guilds: [name, realmIdx] per report guild
//   - characters: [name, realmIdx, classID, [tierIdx, guildIdx, reports, ...], aliases?]
// All filtering / layout / interaction happens client-side so the timeline can be
// scrubbed with zero server round-trips.
//
// Reads MongoDB through `docker exec <container> mongosh` so it needs no driver.

import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOST = process.env.POC_HOST || "127.0.0.1";
const PORT = Number(process.env.POC_PORT || process.env.PORT || 3015);
const MONGO_CONTAINER = process.env.POC_MONGO_CONTAINER || "wow-prog-db";
const MONGO_DB = process.env.POC_MONGO_DB || "wow_guild_tracker";
const PUBLIC_DIR = path.join(__dirname, "guild-network-poc");

// Raid tiers only (mythic+ / torghast / oddball zones excluded).
const TRACKED_RAIDS = [
  46, 44, 42, 38, 35, 33, 31, 29, 28, 26, 24, 23, 22, 21, 19, 17, 13, 12, 11, 10, 8, 7, 6, 5, 4,
];

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
  res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
}

function mongoEval(source) {
  return new Promise((resolve, reject) => {
    execFile(
      "docker",
      ["exec", MONGO_CONTAINER, "mongosh", MONGO_DB, "--quiet", "--eval", source],
      {
        timeout: 180000,
        maxBuffer: 1024 * 1024 * 256,
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
          JSON.parse(text);
          resolve(text);
        } catch {
          reject(new Error(`Mongo query returned non-JSON output: ${text.slice(0, 500)}`));
        }
      },
    );
  });
}

const universeScript = `
const TRACKED_RAIDS = ${JSON.stringify(TRACKED_RAIDS)};

const rows = db.characterraidparticipations.find(
  { zoneId: { $in: TRACKED_RAIDS } },
  {
    _id: 0,
    characterId: 1,
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
  }
).toArray();

// Tier ordering comes from the data itself (first report seen in each zone) so
// out-of-order zone ids like Trial of Valor land in the right chronological slot.
const tierAgg = new Map();
for (const row of rows) {
  let entry = tierAgg.get(row.zoneId);
  if (!entry) {
    entry = { rows: 0, first: null, last: null };
    tierAgg.set(row.zoneId, entry);
  }
  entry.rows += 1;
  if (row.firstSeenAt && (!entry.first || row.firstSeenAt < entry.first)) entry.first = row.firstSeenAt;
  if (row.lastSeenAt && (!entry.last || row.lastSeenAt > entry.last)) entry.last = row.lastSeenAt;
}

const raidMeta = new Map(
  db.raids.find({ id: { $in: TRACKED_RAIDS } }, { _id: 0, id: 1, name: 1, expansion: 1 })
    .toArray()
    .map((raid) => [raid.id, raid])
);

const tiers = Array.from(tierAgg.entries())
  .sort((a, b) => a[1].first - b[1].first)
  .map(([id, entry]) => {
    const meta = raidMeta.get(id) || {};
    return {
      id,
      name: meta.name || "Raid " + id,
      expansion: meta.expansion || "Unknown",
      start: entry.first ? entry.first.toISOString() : null,
      end: entry.last ? entry.last.toISOString() : null,
      participations: entry.rows
    };
  });
const tierIdx = new Map(tiers.map((tier, index) => [tier.id, index]));

const realms = [];
const realmIdx = new Map();
function realmIndex(value) {
  const display = String(value || "Unknown");
  const key = display.toLowerCase().replace(/[^a-z]/g, "");
  let index = realmIdx.get(key);
  if (index === undefined) {
    index = realms.length;
    realms.push(display);
    realmIdx.set(key, index);
  }
  return index;
}

const guilds = [];
const guildIdx = new Map();
function guildIndex(row) {
  const key = String(row.reportGuildId);
  let index = guildIdx.get(key);
  if (index === undefined) {
    index = guilds.length;
    guilds.push([row.reportGuildName || "Unknown", realmIndex(row.reportGuildRealm)]);
    guildIdx.set(key, index);
  }
  return index;
}

function identityForRow(row) {
  if (row.characterId !== null && row.characterId !== undefined) {
    return "id:" + row.characterId + ":" + row.classID;
  }
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

const chars = new Map();
for (const row of rows) {
  const t = tierIdx.get(row.zoneId);
  if (t === undefined) continue;
  const g = guildIndex(row);
  const id = identityForRow(row);

  let entry = chars.get(id);
  if (!entry) {
    entry = {
      name: row.characterName || "Unknown",
      realm: realmIndex(row.characterRealm),
      classID: row.classID || 0,
      nameSeen: row.lastSeenAt || null,
      aliases: new Set(),
      mem: new Map()
    };
    chars.set(id, entry);
  }
  if (row.characterName) entry.aliases.add(row.characterName);
  if (row.characterRealm) entry.aliases.add(row.characterRealm);
  if (row.characterName || row.characterRealm) {
    entry.aliases.add(String(row.characterName || "") + " " + String(row.characterRealm || ""));
  }
  // Canonical ids merge name-changed characters; keep the most recent name.
  if (row.lastSeenAt && (!entry.nameSeen || row.lastSeenAt > entry.nameSeen)) {
    entry.nameSeen = row.lastSeenAt;
    if (row.characterName) entry.name = row.characterName;
    entry.realm = realmIndex(row.characterRealm);
  }
  const memKey = t * 100000 + g;
  entry.mem.set(memKey, (entry.mem.get(memKey) || 0) + (row.reportCount || 0));
}

const characters = [];
for (const entry of chars.values()) {
  const flat = [];
  const keys = Array.from(entry.mem.keys()).sort((a, b) => a - b);
  for (const key of keys) {
    flat.push(Math.floor(key / 100000), key % 100000, entry.mem.get(key));
  }
  const currentRealm = realms[entry.realm] || "";
  const aliases = Array.from(entry.aliases)
    .filter((value) => value && value !== entry.name && value !== currentRealm && value !== entry.name + " " + currentRealm);
  characters.push(aliases.length
    ? [entry.name, entry.realm, entry.classID, flat, aliases]
    : [entry.name, entry.realm, entry.classID, flat]);
}

print(JSON.stringify({
  generatedAt: new Date().toISOString(),
  rowCount: rows.length,
  tiers,
  realms,
  guilds,
  characters
}));
`;

let universeCache = null;
let universePromise = null;

async function getUniverse(refresh) {
  if (refresh) {
    universeCache = null;
    universePromise = null;
  }
  if (universeCache) return universeCache;
  if (!universePromise) {
    universePromise = mongoEval(universeScript)
      .then((text) => {
        universeCache = text;
        return text;
      })
      .finally(() => {
        universePromise = null;
      });
  }
  return universePromise;
}

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  try {
    if (url.pathname === "/api/universe") {
      const started = Date.now();
      const payload = await getUniverse(url.searchParams.get("refresh") === "1");
      console.log(`/api/universe served in ${Date.now() - started}ms (${(payload.length / 1024 / 1024).toFixed(1)} MB)`);
      sendJson(res, 200, payload);
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
  console.log(`Raider Constellation PoC running at http://${HOST}:${PORT}`);
  console.log(`Reading MongoDB through Docker container "${MONGO_CONTAINER}", database "${MONGO_DB}"`);
  console.log("Warming universe cache...");
  getUniverse(false)
    .then((text) => console.log(`Universe ready (${(text.length / 1024 / 1024).toFixed(1)} MB)`))
    .catch((error) => console.warn(`Universe warmup failed: ${error.message}`));
});
