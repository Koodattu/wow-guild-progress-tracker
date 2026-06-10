import dotenv from "dotenv";
import mongoose from "mongoose";
import { ROLE_BY_CLASS_AND_SPEC } from "../config/specs";
import Character from "../models/Character";
import Raid from "../models/Raid";
import wclService from "../services/warcraftlogs.service";

(dotenv.config as (options?: { quiet?: boolean }) => void)({ quiet: true });

type CompareMode = "Rankings" | "Parses";
type Metric = "dps" | "hps";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseStringList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseMetricList(value: string | undefined): Metric[] {
  const metrics = parseStringList(value || "dps,hps").filter((metric): metric is Metric => metric === "dps" || metric === "hps");
  return metrics.length ? metrics : ["dps"];
}

function parseCompareModes(value: string | undefined): CompareMode[] {
  const modes = parseStringList(value || "Rankings,Parses").filter((mode): mode is CompareMode => mode === "Rankings" || mode === "Parses");
  return modes.length ? modes : ["Rankings", "Parses"];
}

function normalizeRealm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function toWclSpecName(specSlug: string): string {
  return specSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function toAliasPart(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.charAt(0).toLowerCase() + part.slice(1) : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

function getRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rankings)) return payload.rankings;
  if (Array.isArray(payload?.ranks)) return payload.ranks;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function summarizeRow(row: any): Record<string, unknown> | null {
  if (!row || typeof row !== "object") return null;
  return {
    keys: Object.keys(row).slice(0, 30),
    encounter: row.encounter ?? null,
    rankPercent: row.rankPercent ?? null,
    historicalPercent: row.historicalPercent ?? null,
    todayPercent: row.todayPercent ?? null,
    bestAmount: row.bestAmount ?? row.amount ?? null,
    totalKills: row.totalKills ?? null,
    fastestKill: row.fastestKill ?? null,
    spec: row.spec ?? row.specName ?? null,
    report: row.report ?? row.reportCode ?? null,
    fightID: row.fightID ?? null,
    partition: row.partition ?? row.allStars?.partition ?? null,
    allStars: row.allStars ?? null,
  };
}

function summarizePayload(payload: any, targetEncounterId: number): Record<string, unknown> {
  const rows = getRows(payload);
  const first = rows.find((row) => row && typeof row === "object");
  const target = rows.find((row) => (row?.encounter?.id ?? row?.encounterID) === targetEncounterId) ?? first;
  const allStars = Array.isArray(payload?.allStars) ? payload.allStars : [];
  const encounters = new Map<number, string>();

  for (const row of rows) {
    const encounterId = row?.encounter?.id ?? row?.encounterID;
    const encounterName = row?.encounter?.name ?? row?.encounterName;
    if (typeof encounterId === "number") {
      encounters.set(encounterId, typeof encounterName === "string" ? encounterName : `Encounter ${encounterId}`);
    }
  }

  return {
    type: payload === null ? "null" : Array.isArray(payload) ? "array" : typeof payload,
    keys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 30) : [],
    partition: payload?.partition ?? null,
    difficulty: payload?.difficulty ?? null,
    metric: payload?.metric ?? null,
    topLevelBestAmount: payload?.bestAmount ?? null,
    topLevelMedianPerformance: payload?.medianPerformance ?? payload?.medianPerformanceAverage ?? null,
    topLevelAveragePerformance: payload?.averagePerformance ?? null,
    topLevelTotalKills: payload?.totalKills ?? null,
    topLevelFastestKill: payload?.fastestKill ?? null,
    rankingsCount: rows.length,
    allStarsCount: allStars.length,
    encounterIds: Array.from(encounters.entries()).map(([id, name]) => ({ id, name })),
    firstRow: summarizeRow(first),
    targetRow: summarizeRow(target),
  };
}

async function loadCharacter(token: string) {
  const [realm, name] = token.includes("/") ? token.split("/", 2) : token.split("-", 2).reverse();
  if (!realm || !name) throw new Error(`Invalid character token "${token}". Use realm/name.`);

  const character = await Character.findOne({
    name: new RegExp(`^${name}$`, "i"),
    realm: normalizeRealm(realm),
  })
    .select("name realm region classID wclCanonicalCharacterId -_id")
    .lean();

  if (!character?.wclCanonicalCharacterId) {
    throw new Error(`Character not found or missing WCL canonical ID: ${token}`);
  }

  return character;
}

async function main(): Promise<void> {
  const mongoUri = getArg("mongo") || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/wow_guild_tracker";
  await mongoose.connect(mongoUri);

  try {
    const characterToken = getArg("character");
    const zoneId = Number(getArg("zone"));
    const encounterId = Number(getArg("encounter"));
    const partition = Number(getArg("partition") || -1);
    const includeCombatantInfo = hasFlag("includeCombatantInfo");
    const includeOtherPlayers = hasFlag("includeOtherPlayers");
    const requestedSpecs = parseStringList(getArg("specs"));
    const metrics = parseMetricList(getArg("metrics"));
    const compareModes = parseCompareModes(getArg("compare"));

    if (!characterToken || !Number.isFinite(zoneId) || !Number.isFinite(encounterId)) {
      throw new Error("Pass --character=realm/name --zone=<zoneId> --encounter=<encounterId>");
    }

    const character = await loadCharacter(characterToken);
    const raid = await Raid.findOne({ id: zoneId }).select("id name bosses partitions -_id").lean();
    const boss = raid?.bosses?.find((entry: any) => entry.id === encounterId);
    const classSpecs = Object.keys(ROLE_BY_CLASS_AND_SPEC[character.classID] ?? {});
    const specs = requestedSpecs.length ? classSpecs.filter((spec) => requestedSpecs.includes(spec)) : classSpecs;

    const fields: string[] = [];
    const aliasMeta: Record<string, Record<string, unknown>> = {};

    for (const spec of specs) {
      for (const metric of metrics) {
        const role = ROLE_BY_CLASS_AND_SPEC[character.classID]?.[spec];
        if (metric === "hps" && role !== "healer") continue;

        const zoneAlias = `${toAliasPart(spec)}${metric.toUpperCase()}ZoneRankings`;
        aliasMeta[zoneAlias] = { field: "zoneRankings", spec, metric, compare: "Rankings" };
        fields.push(
          `${zoneAlias}: zoneRankings(zoneID: $zoneID, difficulty: 5, metric: ${metric}, compare: Rankings, timeframe: Historical, partition: ${partition}, specName: "${toWclSpecName(spec)}")`,
        );

        for (const compare of compareModes) {
          const encounterAlias = `${toAliasPart(spec)}${metric.toUpperCase()}Encounter${compare}`;
          aliasMeta[encounterAlias] = { field: "encounterRankings", spec, metric, compare };
          fields.push(
            `${encounterAlias}: encounterRankings(encounterID: $encounterID, difficulty: 5, metric: ${metric}, compare: ${compare}, timeframe: Historical, partition: ${partition}, specName: "${toWclSpecName(spec)}", includeCombatantInfo: ${includeCombatantInfo}, includeOtherPlayers: ${includeOtherPlayers})`,
          );
        }
      }
    }

    const query = `
      query($characterId: Int!, $zoneID: Int!, $encounterID: Int!) {
        rateLimitData {
          limitPerHour
          pointsSpentThisHour
          pointsResetIn
        }
        characterData {
          character(id: $characterId) {
            id
            canonicalID
            name
            classID
            hidden
            ${fields.join("\n            ")}
          }
        }
      }
    `;

    const result = await wclService.query<any>(
      query,
      {
        characterId: character.wclCanonicalCharacterId,
        zoneID: zoneId,
        encounterID: encounterId,
      },
      false,
      1,
    );

    const wclCharacter = result.characterData?.character;
    const aliases = Object.keys(aliasMeta).map((alias) => ({
      alias,
      ...aliasMeta[alias],
      summary: summarizePayload(wclCharacter?.[alias], encounterId),
    }));

    console.log(
      JSON.stringify(
        {
          character,
          raid: raid ? { id: raid.id, name: raid.name, partitions: raid.partitions } : null,
          boss: boss ? { id: boss.id, name: boss.name } : { id: encounterId, name: null },
          options: { partition, metrics, compareModes, specs, includeCombatantInfo, includeOtherPlayers },
          rateLimitData: result.rateLimitData,
          wclCharacter: wclCharacter
            ? {
                id: wclCharacter.id,
                canonicalID: wclCharacter.canonicalID,
                name: wclCharacter.name,
                classID: wclCharacter.classID,
                hidden: wclCharacter.hidden,
              }
            : null,
          aliases,
        },
        null,
        hasFlag("compact") ? 0 : 2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
