import dotenv from "dotenv";
import mongoose from "mongoose";
import { TRACKED_RAIDS } from "../config/guilds";
import { ROLE_BY_CLASS_AND_SPEC } from "../config/specs";
import Character from "../models/Character";
import CharacterRaidParticipation from "../models/CharacterRaidParticipation";
import CharacterReportAppearance from "../models/CharacterReportAppearance";
import Fight from "../models/Fight";
import Raid from "../models/Raid";
import wclService from "../services/warcraftlogs.service";

(dotenv.config as (options?: { quiet?: boolean }) => void)({ quiet: true });

type Metric = "dps" | "hps";
type LookupMode = "name" | "id";
type PartitionMode = "all" | "default" | "latest" | "explicit";
type CostMode = "before" | "sequential" | "none";

type RateLimitData = {
  limitPerHour: number;
  pointsSpentThisHour: number;
  pointsResetIn: number;
};

type Candidate = {
  characterId?: mongoose.Types.ObjectId | null;
  wclCanonicalCharacterId: number;
  name: string;
  realm: string;
  region: string;
  classID: number;
  zones: number[];
  reportCount?: number;
  source: string;
};

type ProbeBundle = {
  label: string;
  candidate: Candidate;
  zoneId: number;
  raidName: string;
  lookupMode: LookupMode;
  partitionMode: PartitionMode;
  partition?: number;
  specs: string[];
  metrics: Metric[];
};

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseNumberList(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));
}

function parseStringList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseLookupModes(value: string | undefined): LookupMode[] {
  const raw = parseStringList(value || "name");
  const modes = raw.filter((mode): mode is LookupMode => mode === "name" || mode === "id");
  return modes.length > 0 ? modes : ["name"];
}

function parsePartitionModes(value: string | undefined): PartitionMode[] {
  const raw = parseStringList(value || "all,default");
  const modes = raw.filter((mode): mode is PartitionMode => mode === "all" || mode === "default" || mode === "latest" || mode === "explicit");
  return modes.length > 0 ? modes : ["all"];
}

function parseMetrics(value: string | undefined): Metric[] {
  const raw = parseStringList(value || "dps,hps");
  const metrics = raw.filter((metric): metric is Metric => metric === "dps" || metric === "hps");
  return metrics.length > 0 ? metrics : ["dps"];
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

function uniqueNumbers(values: Array<number | undefined | null>): number[] {
  return Array.from(new Set(values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)))).sort((a, b) => a - b);
}

function selectRepresentativeZones(zones: number[], requestedZones: number[], limit: number): number[] {
  const trackedZones = TRACKED_RAIDS.filter((zoneId) => zones.includes(zoneId));
  const requested = requestedZones.length > 0 ? requestedZones.filter((zoneId) => trackedZones.includes(zoneId)) : [];
  if (requested.length > 0) return requested.slice(0, limit);
  if (trackedZones.length <= limit) return trackedZones;

  const indexes = new Set<number>();
  if (limit >= 1) indexes.add(0);
  if (limit >= 2) indexes.add(trackedZones.length - 1);
  if (limit >= 3) indexes.add(Math.floor((trackedZones.length - 1) / 2));

  let cursor = 1;
  while (indexes.size < limit && cursor < trackedZones.length) {
    indexes.add(cursor);
    cursor += 1;
  }

  return Array.from(indexes)
    .sort((a, b) => a - b)
    .map((index) => trackedZones[index]);
}

function getSpecsForCandidate(candidate: Candidate, requestedSpecs: string[]): string[] {
  const classSpecs = Object.keys(ROLE_BY_CLASS_AND_SPEC[candidate.classID] ?? {});
  if (requestedSpecs.length === 0) return classSpecs;
  const requested = new Set(requestedSpecs.map((spec) => spec.toLowerCase()));
  return classSpecs.filter((spec) => requested.has(spec));
}

function getMetricsForSpec(candidate: Candidate, spec: string, requestedMetrics: Metric[]): Metric[] {
  const role = ROLE_BY_CLASS_AND_SPEC[candidate.classID]?.[spec];
  return requestedMetrics.filter((metric) => metric === "dps" || role === "healer");
}

async function getRateLimit(label: string): Promise<RateLimitData> {
  const query = `
    query {
      rateLimitData {
        limitPerHour
        pointsSpentThisHour
        pointsResetIn
      }
    }
  `;

  const result = await wclService.query<{ rateLimitData?: RateLimitData }>(query);
  if (!result.rateLimitData) throw new Error(`Missing rateLimitData before ${label}`);
  return result.rateLimitData;
}

function buildZoneRankingsQuery(bundle: ProbeBundle): { query: string; variables: Record<string, unknown>; aliasMap: Record<string, { spec: string; metric: Metric }> } {
  const aliasMap: Record<string, { spec: string; metric: Metric }> = {};
  const fields: string[] = [];
  const partitionArg =
    bundle.partitionMode === "all"
      ? ", partition: -1"
      : (bundle.partitionMode === "latest" || bundle.partitionMode === "explicit") && typeof bundle.partition === "number"
        ? `, partition: ${bundle.partition}`
        : "";

  for (const spec of bundle.specs) {
    for (const metric of getMetricsForSpec(bundle.candidate, spec, bundle.metrics)) {
      const alias = `${toAliasPart(spec)}${metric.toUpperCase()}Rankings`;
      aliasMap[alias] = { spec, metric };
      fields.push(
        `${alias}: zoneRankings(zoneID: $zoneID, difficulty: 5, metric: ${metric}, compare: Rankings, timeframe: Historical${partitionArg}, specName: "${toWclSpecName(spec)}")`,
      );
    }
  }

  if (fields.length === 0) {
    throw new Error(`No zoneRankings fields to query for ${bundle.candidate.name}-${bundle.candidate.realm}`);
  }

  const lookupArgs =
    bundle.lookupMode === "id"
      ? "id: $characterId"
      : `name: $characterName,
                    serverSlug: $serverSlug,
                    serverRegion: $serverRegion`;

  const variableDefinitions =
    bundle.lookupMode === "id"
      ? "$characterId: Int!, $zoneID: Int!"
      : "$characterName: String!, $serverSlug: String!, $serverRegion: String!, $zoneID: Int!";

  const query = `
    query(${variableDefinitions}) {
      rateLimitData {
        limitPerHour
        pointsSpentThisHour
        pointsResetIn
      }
      characterData {
        character(${lookupArgs}) {
          id
          canonicalID
          name
          classID
          hidden
          ${fields.join("\n          ")}
        }
      }
    }
  `;

  const variables =
    bundle.lookupMode === "id"
      ? {
          characterId: bundle.candidate.wclCanonicalCharacterId,
          zoneID: bundle.zoneId,
        }
      : {
          characterName: bundle.candidate.name,
          serverSlug: normalizeRealm(bundle.candidate.realm),
          serverRegion: bundle.candidate.region.toLowerCase(),
          zoneID: bundle.zoneId,
        };

  return { query, variables, aliasMap };
}

function summarizeRankingsPayload(payload: any): Record<string, unknown> {
  if (payload === null || payload === undefined) return { type: payload === null ? "null" : "undefined" };
  if (typeof payload !== "object") return { type: typeof payload, value: payload };
  if (payload.error) return { type: "error", error: payload.error };

  const rankings = Array.isArray(payload.rankings) ? payload.rankings : [];
  const allStars = Array.isArray(payload.allStars) ? payload.allStars : [];
  const rankingPartitions = uniqueNumbers(rankings.map((ranking: any) => ranking?.allStars?.partition));
  const allStarsPartitions = uniqueNumbers(allStars.map((entry: any) => entry?.partition));
  const sampleLimit = Math.max(0, Number(getArg("sampleLimit") || 3));
  const nonZeroRankings = rankings.filter((ranking: any) => {
    const bestAmount = typeof ranking?.bestAmount === "number" ? ranking.bestAmount : 0;
    const rankPercent = typeof ranking?.rankPercent === "number" ? ranking.rankPercent : 0;
    const allStarsPoints = typeof ranking?.allStars?.points === "number" ? ranking.allStars.points : 0;
    return bestAmount > 0 || rankPercent > 0 || allStarsPoints > 0;
  });
  const sampleSource = nonZeroRankings.length > 0 ? nonZeroRankings : rankings;
  const encounters = sampleSource.slice(0, sampleLimit).map((ranking: any) => ({
    encounterId: ranking?.encounter?.id ?? null,
    encounterName: ranking?.encounter?.name ?? null,
    spec: ranking?.spec ?? null,
    bestSpec: ranking?.bestSpec ?? null,
    rankPercent: ranking?.rankPercent ?? null,
    medianPercent: ranking?.medianPercent ?? null,
    bestAmount: ranking?.bestAmount ?? null,
    totalKills: ranking?.totalKills ?? null,
    lockedIn: ranking?.lockedIn ?? null,
    allStarsPartition: ranking?.allStars?.partition ?? null,
    allStarsPoints: ranking?.allStars?.points ?? null,
    ilvl: ranking?.bestRank?.ilvl ?? null,
    fightMetadata: ranking?.bestRank?.fight_metadata ?? null,
  }));

  return {
    type: "object",
    keys: Object.keys(payload).slice(0, 30),
    zone: payload.zone ?? null,
    difficulty: payload.difficulty ?? null,
    partition: payload.partition ?? null,
    size: payload.size ?? null,
    bestPerformanceAverage: payload.bestPerformanceAverage ?? null,
    medianPerformanceAverage: payload.medianPerformanceAverage ?? null,
    allStarsCount: allStars.length,
    rankingsCount: rankings.length,
    nonZeroRankingsCount: nonZeroRankings.length,
    allStarsPartitions,
    rankingPartitions,
    sampleEncounters: encounters,
  };
}

async function measureBundle(bundle: ProbeBundle, costMode: CostMode, previousRateLimit?: RateLimitData): Promise<{ output: Record<string, unknown>; rateLimit?: RateLimitData }> {
  const { query, variables, aliasMap } = buildZoneRankingsQuery(bundle);
  const before = costMode === "before" ? await getRateLimit(`${bundle.label}:before`) : undefined;
  const result = await wclService.query<any>(query, variables, false, 2);
  const after = result?.rateLimitData as RateLimitData | undefined;
  const character = result?.characterData?.character;

  const output = {
    label: bundle.label,
    lookupMode: bundle.lookupMode,
    partitionMode: bundle.partitionMode,
    requestedPartition: bundle.partition ?? null,
    rateLimit: {
      costMode,
      before: before ?? null,
      after: after ?? null,
      measuredCost: before && after ? after.pointsSpentThisHour - before.pointsSpentThisHour : null,
      deltaFromPreviousResponse:
        costMode === "sequential" && previousRateLimit && after ? after.pointsSpentThisHour - previousRateLimit.pointsSpentThisHour : null,
    },
    character: character
      ? {
          id: character.id,
          canonicalID: character.canonicalID,
          name: character.name,
          classID: character.classID,
          hidden: character.hidden === true,
        }
      : null,
    aliases: Object.fromEntries(
      Object.entries(aliasMap).map(([alias, context]) => [
        alias,
        {
          ...context,
          role: ROLE_BY_CLASS_AND_SPEC[bundle.candidate.classID]?.[context.spec] ?? null,
          summary: summarizeRankingsPayload(character?.[alias]),
        },
      ]),
    ),
  };

  return { output, rateLimit: after };
}

async function loadNamedCandidate(token: string): Promise<Candidate | null> {
  const [realm, name] = token.includes("/") ? token.split("/", 2) : token.split("-", 2).reverse();
  if (!name || !realm) throw new Error(`Invalid character token "${token}". Use realm/name, e.g. stormreaver/Zetabeach.`);

  const nameRegex = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  const realmRegex = new RegExp(`^${normalizeRealm(realm).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

  const character = await Character.findOne({
    name: nameRegex,
    realm: realmRegex,
  })
    .select("_id wclCanonicalCharacterId name realm region classID")
    .lean();

  if (!character?.wclCanonicalCharacterId) {
    const participationRows = await CharacterRaidParticipation.aggregate([
      {
        $match: {
          characterName: nameRegex,
          characterRealm: realmRegex,
          zoneId: { $in: TRACKED_RAIDS },
          wclCanonicalCharacterId: { $type: "number" },
        },
      },
      { $sort: { lastSeenAt: -1 } },
      {
        $group: {
          _id: {
            canonicalID: "$wclCanonicalCharacterId",
            classID: "$classID",
          },
          characterId: { $first: "$characterId" },
          name: { $first: "$characterName" },
          realm: { $first: "$characterRealm" },
          region: { $first: "$characterRegion" },
          zones: { $addToSet: "$zoneId" },
          reportCount: { $sum: "$reportCount" },
        },
      },
      { $sort: { reportCount: -1 } },
      { $limit: 1 },
    ]);

    const participation = participationRows[0];
    if (!participation?._id?.canonicalID) return null;

    const zones = await CharacterRaidParticipation.distinct("zoneId", {
      wclCanonicalCharacterId: participation._id.canonicalID,
      classID: participation._id.classID,
      zoneId: { $in: TRACKED_RAIDS },
    });

    return {
      characterId: participation.characterId ?? null,
      wclCanonicalCharacterId: participation._id.canonicalID,
      name: participation.name,
      realm: participation.realm,
      region: participation.region,
      classID: participation._id.classID,
      zones: zones.sort((a: number, b: number) => TRACKED_RAIDS.indexOf(a) - TRACKED_RAIDS.indexOf(b)),
      reportCount: participation.reportCount,
      source: "named-participation",
    };
  }

  const zones = await CharacterRaidParticipation.distinct("zoneId", {
    wclCanonicalCharacterId: character.wclCanonicalCharacterId,
    classID: character.classID,
    zoneId: { $in: TRACKED_RAIDS },
  });

  return {
    characterId: character._id as mongoose.Types.ObjectId,
    wclCanonicalCharacterId: character.wclCanonicalCharacterId,
    name: character.name,
    realm: character.realm,
    region: character.region,
    classID: character.classID,
    zones: zones.sort((a, b) => TRACKED_RAIDS.indexOf(a) - TRACKED_RAIDS.indexOf(b)),
    source: "named",
  };
}

async function loadRandomCandidates(size: number, minZones: number): Promise<Candidate[]> {
  if (size <= 0) return [];

  const rows = await CharacterRaidParticipation.aggregate([
    {
      $match: {
        zoneId: { $in: TRACKED_RAIDS },
        wclCanonicalCharacterId: { $type: "number" },
      },
    },
    {
      $group: {
        _id: {
          characterId: "$characterId",
          canonicalID: "$wclCanonicalCharacterId",
          classID: "$classID",
        },
        name: { $last: "$characterName" },
        realm: { $last: "$characterRealm" },
        region: { $last: "$characterRegion" },
        zones: { $addToSet: "$zoneId" },
        reportCount: { $sum: "$reportCount" },
      },
    },
    { $addFields: { zoneCount: { $size: "$zones" } } },
    { $match: { zoneCount: { $gte: minZones } } },
    { $sample: { size } },
  ]).allowDiskUse(true);

  return rows.map((row: any) => ({
    characterId: row._id.characterId ?? null,
    wclCanonicalCharacterId: row._id.canonicalID,
    name: row.name,
    realm: row.realm,
    region: row.region,
    classID: row._id.classID,
    zones: (row.zones ?? []).sort((a: number, b: number) => TRACKED_RAIDS.indexOf(a) - TRACKED_RAIDS.indexOf(b)),
    reportCount: row.reportCount,
    source: "random",
  }));
}

async function getMythicEvidence(candidate: Candidate, zoneId: number): Promise<Record<string, unknown>> {
  const appearances = await CharacterReportAppearance.find({
    wclCanonicalCharacterId: candidate.wclCanonicalCharacterId,
    classID: candidate.classID,
    reportZoneId: zoneId,
  })
    .select("reportCode appearanceSource rankingFightIds reportStartTime")
    .lean();

  const reportCodes = Array.from(new Set(appearances.map((appearance) => appearance.reportCode).filter(Boolean)));
  const reportFightIds = new Map<string, Set<number>>();
  const sourceCounts = new Map<string, number>();

  for (const appearance of appearances) {
    sourceCounts.set(appearance.appearanceSource ?? "legacy-null", (sourceCounts.get(appearance.appearanceSource ?? "legacy-null") ?? 0) + 1);
    for (const fightId of appearance.rankingFightIds ?? []) {
      if (!reportFightIds.has(appearance.reportCode)) reportFightIds.set(appearance.reportCode, new Set<number>());
      reportFightIds.get(appearance.reportCode)!.add(fightId);
    }
  }

  const mythicFightRows = reportCodes.length
    ? await Fight.aggregate([
        { $match: { reportCode: { $in: reportCodes }, zoneId, difficulty: 5 } },
        {
          $group: {
            _id: "$reportCode",
            fights: { $sum: 1 },
            kills: { $sum: { $cond: ["$isKill", 1, 0] } },
          },
        },
      ])
    : [];

  const exactFightClauses = Array.from(reportFightIds.entries()).flatMap(([reportCode, fightIds]) =>
    Array.from(fightIds).map((fightId) => ({
      reportCode,
      fightId,
    })),
  );

  const exactMythicFightCount =
    exactFightClauses.length > 0
      ? await Fight.countDocuments({
          zoneId,
          difficulty: 5,
          $or: exactFightClauses,
        })
      : 0;

  return {
    appearanceCount: appearances.length,
    appearanceSources: Object.fromEntries(sourceCounts.entries()),
    reportCount: reportCodes.length,
    reportsWithMythicFights: mythicFightRows.length,
    mythicFightCount: mythicFightRows.reduce((sum: number, row: any) => sum + row.fights, 0),
    mythicKillCount: mythicFightRows.reduce((sum: number, row: any) => sum + row.kills, 0),
    exactRankingFightIdCount: exactFightClauses.length,
    exactRankingFightMythicCount: exactMythicFightCount,
  };
}

async function main(): Promise<void> {
  const mongoUri = getArg("mongo") || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/wow_guild_tracker";
  await mongoose.connect(mongoUri);

  const namedTokens = parseStringList(getArg("characters") || getArg("character") || "stormreaver/Zetabeach");
  const randomSize = Number(getArg("sample") || 0);
  const minRandomZones = Number(getArg("minZones") || 3);
  const requestedZones = parseNumberList(getArg("zones"));
  const zoneLimit = Math.max(1, Number(getArg("zoneLimit") || 3));
  const lookupModes = parseLookupModes(getArg("lookup"));
  const partitionModes = parsePartitionModes(getArg("partitionModes"));
  const explicitPartitions = parseNumberList(getArg("explicitPartitions") || getArg("partitions"));
  const requestedMetrics = parseMetrics(getArg("metrics"));
  const requestedSpecs = parseStringList(getArg("specs"));
  const maxBundles = Math.max(1, Number(getArg("maxBundles") || 8));
  const requestedCostMode = getArg("costMode");
  const costMode: CostMode =
    requestedCostMode === "before" || requestedCostMode === "none" || requestedCostMode === "sequential" ? requestedCostMode : "sequential";
  const dryRun = hasFlag("dryRun");

  const namedCandidates = (await Promise.all(namedTokens.map((token) => loadNamedCandidate(token)))).filter((candidate): candidate is Candidate => candidate !== null);
  const randomCandidates = await loadRandomCandidates(randomSize, minRandomZones);
  const dedupedCandidates = new Map<string, Candidate>();

  for (const candidate of [...namedCandidates, ...randomCandidates]) {
    dedupedCandidates.set(`${candidate.wclCanonicalCharacterId}:${candidate.classID}`, candidate);
  }

  const candidates = Array.from(dedupedCandidates.values());
  const selectedZoneIds = uniqueNumbers(candidates.flatMap((candidate) => selectRepresentativeZones(candidate.zones, requestedZones, zoneLimit)));
  const raids = await Raid.find({ id: { $in: selectedZoneIds } })
    .select("id name partitions bosses -_id")
    .lean();
  const raidById = new Map(raids.map((raid) => [raid.id, raid]));

  const candidateSummaries = [];
  const bundles: ProbeBundle[] = [];

  for (const candidate of candidates) {
    const specs = getSpecsForCandidate(candidate, requestedSpecs);
    const zones = selectRepresentativeZones(candidate.zones, requestedZones, zoneLimit);
    const zoneSummaries = [];

    for (const zoneId of zones) {
      const raid = raidById.get(zoneId);
      const partitions = (raid?.partitions ?? []).map((partition: any) => partition.id).filter((id: unknown): id is number => typeof id === "number");
      const latestPartition = partitions.length > 0 ? Math.max(...partitions) : undefined;
      const evidence = await getMythicEvidence(candidate, zoneId);

      zoneSummaries.push({
        zoneId,
        raidName: raid?.name ?? `Zone ${zoneId}`,
        partitions,
        latestPartition: latestPartition ?? null,
        evidence,
      });

      for (const lookupMode of lookupModes) {
        for (const partitionMode of partitionModes) {
          if (partitionMode === "latest" && typeof latestPartition !== "number") continue;
          const partitionsToProbe = partitionMode === "explicit" ? (explicitPartitions.length > 0 ? explicitPartitions : partitions) : [latestPartition];
          for (const partitionToProbe of partitionsToProbe) {
            bundles.push({
              label: `${candidate.name}-${candidate.realm} zone ${zoneId} ${lookupMode} ${
                partitionMode === "explicit" ? `partition-${partitionToProbe}` : partitionMode
              }`,
              candidate,
              zoneId,
              raidName: raid?.name ?? `Zone ${zoneId}`,
              lookupMode,
              partitionMode,
              partition: partitionMode === "explicit" ? partitionToProbe : latestPartition,
              specs,
              metrics: requestedMetrics,
            });
          }
        }
      }
    }

    candidateSummaries.push({
      name: candidate.name,
      realm: candidate.realm,
      region: candidate.region,
      classID: candidate.classID,
      wclCanonicalCharacterId: candidate.wclCanonicalCharacterId,
      source: candidate.source,
      trackedZones: candidate.zones,
      selectedZones: zoneSummaries,
      specs,
    });
  }

  const selectedBundles = bundles.slice(0, maxBundles);
  const output: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    options: {
      namedTokens,
      randomSize,
      minRandomZones,
      requestedZones,
      zoneLimit,
      lookupModes,
      partitionModes,
      explicitPartitions,
      requestedMetrics,
      requestedSpecs,
      sampleLimit: Math.max(0, Number(getArg("sampleLimit") || 3)),
      maxBundles,
      costMode,
      dryRun,
    },
    candidates: candidateSummaries,
    plannedBundleCount: bundles.length,
    executedBundleCount: dryRun ? 0 : selectedBundles.length,
    plannedBundles: selectedBundles.map((bundle) => ({
      label: bundle.label,
      zoneId: bundle.zoneId,
      raidName: bundle.raidName,
      lookupMode: bundle.lookupMode,
      partitionMode: bundle.partitionMode,
      requestedPartition: bundle.partition ?? null,
      specs: bundle.specs,
      metrics: bundle.metrics,
    })),
  };

  if (!dryRun) {
    const results = [];
    let previousRateLimit: RateLimitData | undefined;
    for (const bundle of selectedBundles) {
      const result = await measureBundle(bundle, costMode, previousRateLimit);
      results.push(result.output);
      if (result.rateLimit) previousRateLimit = result.rateLimit;
    }
    output.results = results;
  }

  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await mongoose.disconnect();
  });
