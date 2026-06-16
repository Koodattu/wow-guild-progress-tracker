import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

const backendRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(backendRoot, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env") });

type CharacterSpec = {
  input: string;
  name: string;
  characterSlug: string;
  realmSlug: string;
  key: string;
};

type EndpointName = "profile" | "achievements" | "achievement-statistics";

type EndpointResult = {
  ok: boolean;
  status?: number;
  url: string;
  file: string;
  error?: string;
};

type CharacterFetchResult = {
  character: CharacterSpec;
  endpoints: Record<EndpointName, EndpointResult>;
};

type NormalizedAchievement = {
  id: number;
  name: string;
  completedTimestamp: number | null;
  completedAt: string | null;
};

type NormalizedStatistic = {
  id: number;
  name: string;
  quantity: number | null;
  lastUpdatedTimestamp: number | null;
  lastUpdatedAt: string | null;
  categoryPath: string[];
};

type NormalizedCharacter = {
  key: string;
  input: string;
  name: string;
  realmSlug: string;
  profile: {
    id: number | null;
    name: string | null;
    realmSlug: string | null;
    guildName: string | null;
    achievementPoints: number | null;
  };
  achievements: NormalizedAchievement[];
  statistics: NormalizedStatistic[];
};

type CharacterAnalysis = NormalizedCharacter & {
  achievementById: Map<number, NormalizedAchievement>;
  statisticById: Map<number, NormalizedStatistic>;
};

type PairAnalysis = {
  a: string;
  b: string;
  score: number;
  confidence: "high" | "medium" | "weak" | "unlikely";
  achievementCounts: {
    a: number;
    b: number;
    intersection: number;
    union: number;
    jaccard: number;
    overlapOfSmaller: number;
  };
  timestampEvidence: {
    comparable: number;
    exactMatches: number;
    conflicts: number;
    exactMatchRate: number;
    distinctExactTimestamps: number;
    discriminatingWeight: number;
  };
  statisticEvidence: {
    comparable: number;
    exactQuantityMatches: number;
    exactQuantityRate: number;
  };
  examples: {
    exactTimestampMatches: Array<{
      id: number;
      name: string;
      completedAt: string | null;
      cohortSize: number;
    }>;
    timestampConflicts: Array<{
      id: number;
      name: string;
      aCompletedAt: string | null;
      bCompletedAt: string | null;
    }>;
    onlyA: Array<{ id: number; name: string }>;
    onlyB: Array<{ id: number; name: string }>;
  };
};

type KnownAccountGroup = {
  id: string;
  characters: string[];
  characterKeys: string[];
};

type SignalAchievement = {
  id: number;
  name: string;
  score: number;
  completedCharacters: number;
  completedAccounts: number;
  sameAccount: {
    comparablePairs: number;
    exactPairs: number;
    conflictPairs: number;
    exactRate: number;
    accountsWithAtLeastTwoCompletedCharacters: number;
    accountsWithCompleteExactCoverage: number;
  };
  crossAccount: {
    comparablePairs: number;
    exactTimestampCollisions: number;
    exactCollisionRate: number;
    timestampCollisionGroups: number;
  };
  examples: {
    sameAccountExact: Array<{
      accountId: string;
      characters: string[];
      completedAt: string | null;
    }>;
    crossAccountCollisions: Array<{
      completedAt: string | null;
      characters: string[];
      accounts: string[];
    }>;
  };
};

type SignalDiscovery = {
  generatedAt: string;
  accountGroups: KnownAccountGroup[];
  multiCharacterAccountCount: number;
  totalSameAccountPairs: number;
  totalCrossAccountPairs: number;
  achievementCount: number;
  recommendedSignalIds: number[];
  topSignals: SignalAchievement[];
  noisySignals: SignalAchievement[];
  allSignals: SignalAchievement[];
};

const DEFAULT_ACCOUNT_GROUPS: Array<{ id: string; characters: string[] }> = [
  {
    id: "account1",
    characters: ["R\u00f6idy-Kazzak", "Syttyyk\u00f6-Outland", "Valotettu-Outland", "R\u00f6iza-Kazzak", "Jousivakio-Outland"],
  },
  {
    id: "account2",
    characters: ["Jampton-Kazzak", "Pulttipyssy-Kazzak", "Jampmonk-Kazzak"],
  },
  {
    id: "account3",
    characters: ["Thrusbard-Kazzak"],
  },
  {
    id: "account4",
    characters: ["Ovelakettu-Kazzak"],
  },
  {
    id: "account5",
    characters: ["Hetleme-Kazzak", "Violetmw-Kazzak", "Violetworld-Kazzak", "Alignless-Kazzak"],
  },
  {
    id: "account6",
    characters: ["Stobes-Kazzak", "Lilh\u00e4isk\u00e4-Kazzak", "Vituhieno-Kazzak"],
  },
  {
    id: "account7",
    characters: ["Zetacmi-Kazzak", "Inspiraatio-Kazzak", "Zetacygni-Kazzak"],
  },
  {
    id: "account8",
    characters: ["Rampenator-Outland", "Peikonkorvat-Kazzak"],
  },
];

const DEFAULT_CHARACTERS = DEFAULT_ACCOUNT_GROUPS.flatMap((group) => group.characters);

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseCharacters(): CharacterSpec[] {
  const charactersArg = getArg("characters");
  const rawCharacters = charactersArg
    ? charactersArg
        .split(",")
        .map((character) => character.trim())
        .filter(Boolean)
    : DEFAULT_CHARACTERS;

  if (rawCharacters.length === 0) {
    throw new Error("Pass --characters=<Name-Realm,Name-Realm> or use the script defaults.");
  }

  return rawCharacters.map(parseCharacter);
}

function parseKnownAccountGroups(): KnownAccountGroup[] {
  if (getArg("characters")) {
    return [];
  }

  return DEFAULT_ACCOUNT_GROUPS.map((group) => ({
    id: group.id,
    characters: group.characters,
    characterKeys: group.characters.map((character) => parseCharacter(character).key),
  }));
}

function parseCharacter(input: string): CharacterSpec {
  const separatorIndex = input.indexOf("-");
  if (separatorIndex <= 0 || separatorIndex === input.length - 1) {
    throw new Error(`Invalid character spec "${input}". Expected Name-Realm.`);
  }

  const name = input.slice(0, separatorIndex).trim();
  const realm = input.slice(separatorIndex + 1).trim();
  const realmSlug = slugRealm(realm);
  const characterSlug = name.toLocaleLowerCase("en-US");

  return {
    input,
    name,
    characterSlug,
    realmSlug,
    key: sanitizeFilePart(`${characterSlug}-${realmSlug}`),
  };
}

function slugRealm(realm: string): string {
  return realm
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeFilePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function getOutputDir(): string {
  const outputDir = getArg("output-dir");
  if (outputDir) {
    return path.resolve(process.cwd(), outputDir);
  }

  return path.join(backendRoot, "logs", "blizzard-character-achievement-links", buildRunId());
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, "utf8");
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function timestampToIso(timestamp: number | null): string | null {
  if (!timestamp || timestamp <= 0) return null;
  return new Date(timestamp).toISOString();
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.BLIZZARD_CLIENT_ID;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing BLIZZARD_CLIENT_ID or BLIZZARD_CLIENT_SECRET in backend/.env or repo .env.");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Blizzard token: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("Blizzard token response did not include access_token.");
  }

  return payload.access_token;
}

function buildCharacterUrl(region: string, character: CharacterSpec, endpoint: EndpointName, locale: string): string {
  const host = `https://${region}.api.blizzard.com`;
  const encodedName = encodeURIComponent(character.characterSlug);
  const endpointPath =
    endpoint === "profile"
      ? `/profile/wow/character/${character.realmSlug}/${encodedName}`
      : endpoint === "achievements"
        ? `/profile/wow/character/${character.realmSlug}/${encodedName}/achievements`
        : `/profile/wow/character/${character.realmSlug}/${encodedName}/achievements/statistics`;

  const url = new URL(`${host}${endpointPath}`);
  url.searchParams.set("namespace", `profile-${region}`);
  url.searchParams.set("locale", locale);
  return url.toString();
}

async function fetchJsonWithRetry(url: string, token: string, maxRetries = 4): Promise<{ status: number; payload: unknown }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const text = await response.text();
    let payload: unknown = text;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { rawText: text };
    }

    if (response.ok) {
      return { status: response.status, payload };
    }

    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const waitMs = 1000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    const error = new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
    Object.assign(error, { status: response.status, payload });
    throw error;
  }

  throw new Error(`GET ${url} failed after retries.`);
}

async function fetchEndpoint(
  token: string,
  region: string,
  locale: string,
  character: CharacterSpec,
  endpoint: EndpointName,
  rawDir: string,
): Promise<{ result: EndpointResult; payload: unknown | null }> {
  const url = buildCharacterUrl(region, character, endpoint, locale);
  const file = path.join(rawDir, `${character.key}.${endpoint}.json`);

  try {
    const response = await fetchJsonWithRetry(url, token);
    await writeJson(file, {
      fetchedAt: new Date().toISOString(),
      character: character.input,
      endpoint,
      status: response.status,
      url,
      payload: response.payload,
    });

    return {
      result: {
        ok: true,
        status: response.status,
        url,
        file,
      },
      payload: response.payload,
    };
  } catch (error) {
    const status = numberValue((error as { status?: unknown }).status);
    const errorPayload = (error as { payload?: unknown }).payload ?? null;
    const message = error instanceof Error ? error.message : String(error);

    await writeJson(file, {
      fetchedAt: new Date().toISOString(),
      character: character.input,
      endpoint,
      status,
      url,
      error: message,
      payload: errorPayload,
    });

    return {
      result: {
        ok: false,
        status: status ?? undefined,
        url,
        file,
        error: message,
      },
      payload: null,
    };
  }
}

async function fetchCharacter(
  token: string,
  region: string,
  locale: string,
  character: CharacterSpec,
  rawDir: string,
): Promise<{ fetchResult: CharacterFetchResult; normalized: NormalizedCharacter }> {
  const endpoints = {} as Record<EndpointName, EndpointResult>;
  const payloads = {} as Record<EndpointName, unknown | null>;

  for (const endpoint of ["profile", "achievements", "achievement-statistics"] as EndpointName[]) {
    const endpointResponse = await fetchEndpoint(token, region, locale, character, endpoint, rawDir);
    endpoints[endpoint] = endpointResponse.result;
    payloads[endpoint] = endpointResponse.payload;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return {
    fetchResult: {
      character,
      endpoints,
    },
    normalized: normalizeCharacter(character, payloads.profile, payloads.achievements, payloads["achievement-statistics"]),
  };
}

function normalizeCharacter(character: CharacterSpec, profilePayload: unknown, achievementsPayload: unknown, statisticsPayload: unknown): NormalizedCharacter {
  const profile = objectValue(profilePayload);
  const guild = objectValue(profile?.guild);
  const realm = objectValue(profile?.realm);

  return {
    key: character.key,
    input: character.input,
    name: character.name,
    realmSlug: character.realmSlug,
    profile: {
      id: numberValue(profile?.id),
      name: stringValue(profile?.name),
      realmSlug: stringValue(realm?.slug),
      guildName: stringValue(guild?.name),
      achievementPoints: numberValue(profile?.achievement_points),
    },
    achievements: normalizeAchievements(achievementsPayload),
    statistics: normalizeStatistics(statisticsPayload),
  };
}

function normalizeAchievements(payload: unknown): NormalizedAchievement[] {
  const root = objectValue(payload);
  const achievements = arrayValue(root?.achievements);
  const normalized: NormalizedAchievement[] = [];

  for (const entry of achievements) {
    const row = objectValue(entry);
    if (!row) continue;

    const achievement = objectValue(row.achievement) ?? row;
    const id = numberValue(achievement.id) ?? numberValue(row.id);
    if (id === null) continue;

    const completedTimestamp = numberValue(row.completed_timestamp) ?? numberValue(row.completedTimestamp);
    normalized.push({
      id,
      name: stringValue(achievement.name) ?? stringValue(row.name) ?? `Achievement ${id}`,
      completedTimestamp,
      completedAt: timestampToIso(completedTimestamp),
    });
  }

  normalized.sort((a, b) => a.id - b.id);
  return normalized;
}

function normalizeStatistics(payload: unknown): NormalizedStatistic[] {
  const root = objectValue(payload);
  if (!root) return [];

  const statistics: NormalizedStatistic[] = [];
  collectStatistics(root, [], statistics);
  statistics.sort((a, b) => a.id - b.id);
  return statistics;
}

function collectStatistics(node: unknown, categoryPath: string[], output: NormalizedStatistic[]): void {
  const object = objectValue(node);
  if (!object) return;

  const currentName = stringValue(object.name);
  const nextPath = currentName ? [...categoryPath, currentName] : categoryPath;

  for (const statistic of arrayValue(object.statistics)) {
    const row = objectValue(statistic);
    if (!row) continue;

    const id = numberValue(row.id);
    if (id === null) continue;

    const lastUpdatedTimestamp = numberValue(row.last_updated_timestamp) ?? numberValue(row.lastUpdatedTimestamp);
    output.push({
      id,
      name: stringValue(row.name) ?? `Statistic ${id}`,
      quantity: numberValue(row.quantity),
      lastUpdatedTimestamp,
      lastUpdatedAt: timestampToIso(lastUpdatedTimestamp),
      categoryPath: nextPath,
    });
  }

  for (const child of arrayValue(object.categories)) {
    collectStatistics(child, nextPath, output);
  }

  for (const child of arrayValue(object.sub_categories)) {
    collectStatistics(child, nextPath, output);
  }
}

function prepareAnalysisCharacters(characters: NormalizedCharacter[]): CharacterAnalysis[] {
  return characters.map((character) => ({
    ...character,
    achievementById: new Map(character.achievements.map((achievement) => [achievement.id, achievement])),
    statisticById: new Map(character.statistics.map((statistic) => [statistic.id, statistic])),
  }));
}

function buildAchievementTimestampCohorts(characters: CharacterAnalysis[]): Map<string, number> {
  const cohorts = new Map<string, Set<string>>();

  for (const character of characters) {
    for (const achievement of character.achievements) {
      if (!achievement.completedTimestamp || achievement.completedTimestamp <= 0) continue;
      const key = `${achievement.id}:${achievement.completedTimestamp}`;
      const cohort = cohorts.get(key) ?? new Set<string>();
      cohort.add(character.key);
      cohorts.set(key, cohort);
    }
  }

  return new Map(Array.from(cohorts.entries()).map(([key, cohort]) => [key, cohort.size]));
}

function analyzePairs(characters: CharacterAnalysis[]): PairAnalysis[] {
  const cohorts = buildAchievementTimestampCohorts(characters);
  const pairs: PairAnalysis[] = [];

  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      pairs.push(analyzePair(characters[i], characters[j], cohorts));
    }
  }

  return pairs.sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence) || b.score - a.score || b.timestampEvidence.exactMatches - a.timestampEvidence.exactMatches);
}

function analyzePair(a: CharacterAnalysis, b: CharacterAnalysis, cohorts: Map<string, number>): PairAnalysis {
  const idsA = new Set(a.achievements.map((achievement) => achievement.id));
  const idsB = new Set(b.achievements.map((achievement) => achievement.id));
  const intersection = Array.from(idsA).filter((id) => idsB.has(id)).sort((left, right) => left - right);
  const union = new Set([...idsA, ...idsB]);
  const exactTimestampMatches: Array<{ achievement: NormalizedAchievement; cohortSize: number }> = [];
  const timestampConflicts: Array<{
    id: number;
    name: string;
    aCompletedAt: string | null;
    bCompletedAt: string | null;
  }> = [];
  const distinctExactTimestamps = new Set<number>();
  let comparableTimestamps = 0;
  let discriminatingWeight = 0;

  for (const id of intersection) {
    const achievementA = a.achievementById.get(id);
    const achievementB = b.achievementById.get(id);
    if (!achievementA || !achievementB) continue;

    if (achievementA.completedTimestamp && achievementB.completedTimestamp) {
      comparableTimestamps++;

      if (achievementA.completedTimestamp === achievementB.completedTimestamp) {
        const cohortSize = cohorts.get(`${id}:${achievementA.completedTimestamp}`) ?? 1;
        exactTimestampMatches.push({ achievement: achievementA, cohortSize });
        distinctExactTimestamps.add(achievementA.completedTimestamp);
        discriminatingWeight += 1 / Math.max(1, cohortSize - 1);
      } else {
        timestampConflicts.push({
          id,
          name: achievementA.name,
          aCompletedAt: achievementA.completedAt,
          bCompletedAt: achievementB.completedAt,
        });
      }
    }
  }

  let comparableStatistics = 0;
  let exactQuantityMatches = 0;
  for (const [id, statisticA] of a.statisticById.entries()) {
    const statisticB = b.statisticById.get(id);
    if (!statisticB || statisticA.quantity === null || statisticB.quantity === null) continue;
    comparableStatistics++;
    if (statisticA.quantity === statisticB.quantity) {
      exactQuantityMatches++;
    }
  }

  const jaccard = union.size === 0 ? 0 : intersection.length / union.size;
  const overlapOfSmaller = Math.min(idsA.size, idsB.size) === 0 ? 0 : intersection.length / Math.min(idsA.size, idsB.size);
  const exactMatchRate = comparableTimestamps === 0 ? 0 : exactTimestampMatches.length / comparableTimestamps;
  const exactQuantityRate = comparableStatistics === 0 ? 0 : exactQuantityMatches / comparableStatistics;
  const score = calculateScore({
    discriminatingWeight,
    exactTimestampMatches: exactTimestampMatches.length,
    exactMatchRate,
    jaccard,
    overlapOfSmaller,
  });
  const confidence = classifyScore(score, exactTimestampMatches.length, exactMatchRate, discriminatingWeight);

  const onlyA = Array.from(idsA)
    .filter((id) => !idsB.has(id))
    .slice(0, 12)
    .map((id) => {
      const achievement = a.achievementById.get(id);
      return { id, name: achievement?.name ?? `Achievement ${id}` };
    });
  const onlyB = Array.from(idsB)
    .filter((id) => !idsA.has(id))
    .slice(0, 12)
    .map((id) => {
      const achievement = b.achievementById.get(id);
      return { id, name: achievement?.name ?? `Achievement ${id}` };
    });

  return {
    a: a.key,
    b: b.key,
    score,
    confidence,
    achievementCounts: {
      a: idsA.size,
      b: idsB.size,
      intersection: intersection.length,
      union: union.size,
      jaccard: round(jaccard),
      overlapOfSmaller: round(overlapOfSmaller),
    },
    timestampEvidence: {
      comparable: comparableTimestamps,
      exactMatches: exactTimestampMatches.length,
      conflicts: timestampConflicts.length,
      exactMatchRate: round(exactMatchRate),
      distinctExactTimestamps: distinctExactTimestamps.size,
      discriminatingWeight: round(discriminatingWeight),
    },
    statisticEvidence: {
      comparable: comparableStatistics,
      exactQuantityMatches,
      exactQuantityRate: round(exactQuantityRate),
    },
    examples: {
      exactTimestampMatches: exactTimestampMatches.slice(0, 15).map(({ achievement, cohortSize }) => ({
        id: achievement.id,
        name: achievement.name,
        completedAt: achievement.completedAt,
        cohortSize,
      })),
      timestampConflicts: timestampConflicts.slice(0, 15),
      onlyA,
      onlyB,
    },
  };
}

function calculateScore(input: {
  discriminatingWeight: number;
  exactTimestampMatches: number;
  exactMatchRate: number;
  jaccard: number;
  overlapOfSmaller: number;
}): number {
  const rawTimestampEvidence = Math.min(55, input.discriminatingWeight * 1.8) + Math.min(20, input.exactTimestampMatches * 0.25);
  const timestampRateGate = Math.min(1, input.exactMatchRate / 0.5);
  const timestampScore = rawTimestampEvidence * timestampRateGate;
  const rateScore = Math.min(15, input.exactMatchRate * 22);
  const overlapGate = Math.min(1, input.exactMatchRate / 0.35);
  const overlapScore = Math.min(10, (input.jaccard * 0.65 + input.overlapOfSmaller * 0.35) * 10) * overlapGate;
  return round(timestampScore + rateScore + overlapScore, 2);
}

function classifyScore(score: number, exactTimestampMatches: number, exactMatchRate: number, discriminatingWeight: number): PairAnalysis["confidence"] {
  if (score >= 70 && exactTimestampMatches >= 80 && exactMatchRate >= 0.5 && discriminatingWeight >= 25) {
    return "high";
  }
  if (score >= 45 && exactTimestampMatches >= 35 && exactMatchRate >= 0.35 && discriminatingWeight >= 10) {
    return "medium";
  }
  if (score >= 25 && exactTimestampMatches >= 12 && exactMatchRate >= 0.18) {
    return "weak";
  }
  return "unlikely";
}

function confidenceRank(confidence: PairAnalysis["confidence"]): number {
  return {
    unlikely: 0,
    weak: 1,
    medium: 2,
    high: 3,
  }[confidence];
}

function buildClusters(pairs: PairAnalysis[], threshold: PairAnalysis["confidence"] = "medium"): string[][] {
  const confidenceRank: Record<PairAnalysis["confidence"], number> = {
    unlikely: 0,
    weak: 1,
    medium: 2,
    high: 3,
  };
  const thresholdRank = confidenceRank[threshold];
  const parent = new Map<string, string>();

  function find(value: string): string {
    const currentParent = parent.get(value) ?? value;
    if (currentParent === value) {
      parent.set(value, value);
      return value;
    }

    const root = find(currentParent);
    parent.set(value, root);
    return root;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  }

  for (const pair of pairs) {
    find(pair.a);
    find(pair.b);
    if (confidenceRank[pair.confidence] >= thresholdRank) {
      union(pair.a, pair.b);
    }
  }

  const groups = new Map<string, string[]>();
  for (const character of parent.keys()) {
    const root = find(character);
    const group = groups.get(root) ?? [];
    group.push(character);
    groups.set(root, group);
  }

  return Array.from(groups.values())
    .map((group) => group.sort())
    .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

function discoverSignalAchievements(characters: CharacterAnalysis[], accountGroups: KnownAccountGroup[]): SignalDiscovery | null {
  if (accountGroups.length === 0) {
    return null;
  }

  const knownKeys = new Set(accountGroups.flatMap((group) => group.characterKeys));
  const accountByCharacter = new Map<string, string>();
  for (const group of accountGroups) {
    for (const characterKey of group.characterKeys) {
      accountByCharacter.set(characterKey, group.id);
    }
  }

  const labeledCharacters = characters.filter((character) => knownKeys.has(character.key));
  const achievementRows = new Map<number, { name: string; byCharacter: Map<string, NormalizedAchievement> }>();

  for (const character of labeledCharacters) {
    for (const achievement of character.achievements) {
      if (!achievement.completedTimestamp) continue;

      const row = achievementRows.get(achievement.id) ?? {
        name: achievement.name,
        byCharacter: new Map<string, NormalizedAchievement>(),
      };
      row.byCharacter.set(character.key, achievement);
      achievementRows.set(achievement.id, row);
    }
  }

  const multiCharacterAccountGroups = accountGroups.filter((group) => group.characterKeys.length > 1);
  const totalSameAccountPairs = multiCharacterAccountGroups.reduce((total, group) => total + pairCount(group.characterKeys.length), 0);
  const totalLabeledPairs = pairCount(labeledCharacters.length);
  const totalCrossAccountPairs = totalLabeledPairs - totalSameAccountPairs;
  const signals: SignalAchievement[] = [];

  for (const [id, row] of achievementRows.entries()) {
    signals.push(analyzeSignalAchievement(id, row.name, row.byCharacter, accountGroups, accountByCharacter));
  }

  signals.sort(
    (a, b) =>
      b.score - a.score ||
      a.crossAccount.exactTimestampCollisions - b.crossAccount.exactTimestampCollisions ||
      b.sameAccount.exactPairs - a.sameAccount.exactPairs ||
      b.completedAccounts - a.completedAccounts ||
      a.id - b.id,
  );

  const recommendedSignalIds = signals
    .filter(
      (signal) =>
        signal.sameAccount.comparablePairs >= 4 &&
        signal.sameAccount.exactRate >= 0.8 &&
        signal.crossAccount.exactTimestampCollisions === 0 &&
        signal.completedAccounts >= 2,
    )
    .slice(0, 512)
    .map((signal) => signal.id);

  const noisySignals = [...signals]
    .filter((signal) => signal.crossAccount.exactTimestampCollisions > 0)
    .sort(
      (a, b) =>
        b.crossAccount.exactTimestampCollisions - a.crossAccount.exactTimestampCollisions ||
        b.crossAccount.timestampCollisionGroups - a.crossAccount.timestampCollisionGroups ||
        b.completedAccounts - a.completedAccounts ||
        a.id - b.id,
    )
    .slice(0, 100);

  return {
    generatedAt: new Date().toISOString(),
    accountGroups,
    multiCharacterAccountCount: multiCharacterAccountGroups.length,
    totalSameAccountPairs,
    totalCrossAccountPairs,
    achievementCount: signals.length,
    recommendedSignalIds,
    topSignals: signals.slice(0, 300),
    noisySignals,
    allSignals: signals,
  };
}

function analyzeSignalAchievement(
  id: number,
  name: string,
  byCharacter: Map<string, NormalizedAchievement>,
  accountGroups: KnownAccountGroup[],
  accountByCharacter: Map<string, string>,
): SignalAchievement {
  let sameComparable = 0;
  let sameExact = 0;
  let sameConflict = 0;
  let crossComparable = 0;
  let crossExact = 0;
  const sameAccountExactExamples: SignalAchievement["examples"]["sameAccountExact"] = [];
  const timestampGroups = new Map<number, string[]>();
  const accountsWithCompletedCharacters = new Set<string>();
  let accountsWithAtLeastTwoCompletedCharacters = 0;
  let accountsWithCompleteExactCoverage = 0;

  for (const [characterKey, achievement] of byCharacter.entries()) {
    const accountId = accountByCharacter.get(characterKey);
    if (accountId) {
      accountsWithCompletedCharacters.add(accountId);
    }

    if (achievement.completedTimestamp) {
      const group = timestampGroups.get(achievement.completedTimestamp) ?? [];
      group.push(characterKey);
      timestampGroups.set(achievement.completedTimestamp, group);
    }
  }

  for (const accountGroup of accountGroups) {
    const completed = accountGroup.characterKeys
      .map((characterKey) => ({ characterKey, achievement: byCharacter.get(characterKey) }))
      .filter((row): row is { characterKey: string; achievement: NormalizedAchievement } => Boolean(row.achievement?.completedTimestamp));

    if (completed.length >= 2) {
      accountsWithAtLeastTwoCompletedCharacters++;
    }

    if (completed.length === accountGroup.characterKeys.length && completed.every((row) => row.achievement.completedTimestamp === completed[0].achievement.completedTimestamp)) {
      accountsWithCompleteExactCoverage++;
      if (sameAccountExactExamples.length < 8) {
        sameAccountExactExamples.push({
          accountId: accountGroup.id,
          characters: completed.map((row) => row.characterKey),
          completedAt: completed[0].achievement.completedAt,
        });
      }
    }

    for (let i = 0; i < completed.length; i++) {
      for (let j = i + 1; j < completed.length; j++) {
        sameComparable++;
        if (completed[i].achievement.completedTimestamp === completed[j].achievement.completedTimestamp) {
          sameExact++;
        } else {
          sameConflict++;
        }
      }
    }
  }

  const labeledCharacters = Array.from(byCharacter.keys()).filter((characterKey) => accountByCharacter.has(characterKey));
  for (let i = 0; i < labeledCharacters.length; i++) {
    for (let j = i + 1; j < labeledCharacters.length; j++) {
      const a = labeledCharacters[i];
      const b = labeledCharacters[j];
      const accountA = accountByCharacter.get(a);
      const accountB = accountByCharacter.get(b);
      if (!accountA || !accountB || accountA === accountB) continue;

      const achievementA = byCharacter.get(a);
      const achievementB = byCharacter.get(b);
      if (!achievementA?.completedTimestamp || !achievementB?.completedTimestamp) continue;

      crossComparable++;
      if (achievementA.completedTimestamp === achievementB.completedTimestamp) {
        crossExact++;
      }
    }
  }

  const crossCollisionExamples: SignalAchievement["examples"]["crossAccountCollisions"] = [];
  let timestampCollisionGroups = 0;
  for (const [timestamp, characterKeys] of timestampGroups.entries()) {
    const accounts = Array.from(new Set(characterKeys.map((characterKey) => accountByCharacter.get(characterKey)).filter((accountId): accountId is string => Boolean(accountId))));
    if (accounts.length <= 1) continue;

    timestampCollisionGroups++;
    if (crossCollisionExamples.length < 8) {
      crossCollisionExamples.push({
        completedAt: timestampToIso(timestamp),
        characters: characterKeys,
        accounts,
      });
    }
  }

  const sameExactRate = sameComparable === 0 ? 0 : sameExact / sameComparable;
  const crossCollisionRate = crossComparable === 0 ? 0 : crossExact / crossComparable;
  const accountCoverageRate = accountGroups.length === 0 ? 0 : accountsWithCompletedCharacters.size / accountGroups.length;
  const multiAccountCoverageRate = accountGroups.length === 0 ? 0 : accountsWithAtLeastTwoCompletedCharacters / accountGroups.filter((group) => group.characterKeys.length > 1).length;
  const completeExactCoverageRate = accountGroups.length === 0 ? 0 : accountsWithCompleteExactCoverage / accountGroups.filter((group) => group.characterKeys.length > 1).length;
  const score =
    sameExactRate * 45 +
    Math.min(20, sameExact * 0.75) +
    accountCoverageRate * 10 +
    multiAccountCoverageRate * 10 +
    completeExactCoverageRate * 15 -
    Math.min(60, crossExact * 4) -
    Math.min(25, crossCollisionRate * 100);

  return {
    id,
    name,
    score: round(Math.max(0, Math.min(100, score)), 2),
    completedCharacters: byCharacter.size,
    completedAccounts: accountsWithCompletedCharacters.size,
    sameAccount: {
      comparablePairs: sameComparable,
      exactPairs: sameExact,
      conflictPairs: sameConflict,
      exactRate: round(sameExactRate),
      accountsWithAtLeastTwoCompletedCharacters,
      accountsWithCompleteExactCoverage,
    },
    crossAccount: {
      comparablePairs: crossComparable,
      exactTimestampCollisions: crossExact,
      exactCollisionRate: round(crossCollisionRate),
      timestampCollisionGroups,
    },
    examples: {
      sameAccountExact: sameAccountExactExamples,
      crossAccountCollisions: crossCollisionExamples,
    },
  };
}

function pairCount(count: number): number {
  return count < 2 ? 0 : (count * (count - 1)) / 2;
}

function buildSummaryMarkdown(runDir: string, characters: NormalizedCharacter[], pairs: PairAnalysis[], clusters: string[][], signalDiscovery: SignalDiscovery | null): string {
  const lines: string[] = [];
  lines.push("# Blizzard Character Achievement Link Probe");
  lines.push("");
  lines.push(`Run directory: \`${runDir}\``);
  lines.push("");
  lines.push("## Characters");
  lines.push("");
  lines.push("| Character | Profile ID | Guild | Achievement points | Completed achievements | Statistics |");
  lines.push("| --- | ---: | --- | ---: | ---: | ---: |");

  for (const character of characters) {
    lines.push(
      `| ${character.input} | ${character.profile.id ?? ""} | ${character.profile.guildName ?? ""} | ${character.profile.achievementPoints ?? ""} | ${character.achievements.length} | ${character.statistics.length} |`,
    );
  }

  lines.push("");
  lines.push("## Likely Clusters");
  lines.push("");
  for (const cluster of clusters) {
    lines.push(`- ${cluster.join(", ")}`);
  }

  lines.push("");
  lines.push("## Pairwise Evidence");
  lines.push("");
  lines.push("| Pair | Confidence | Score | Shared IDs | Exact timestamp matches | Exact timestamp rate | Discriminating weight | Jaccard |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");

  for (const pair of pairs) {
    lines.push(
      `| ${pair.a} / ${pair.b} | ${pair.confidence} | ${pair.score} | ${pair.achievementCounts.intersection} | ${pair.timestampEvidence.exactMatches} | ${pair.timestampEvidence.exactMatchRate} | ${pair.timestampEvidence.discriminatingWeight} | ${pair.achievementCounts.jaccard} |`,
    );
  }

  lines.push("");
  lines.push("Notes:");
  lines.push("- Exact timestamp matches are useful, but not definitive by themselves because raid or dungeon achievements can be earned by multiple accounts at the same moment.");
  lines.push("- Discriminating weight discounts exact achievement+timestamp matches that appear across many tested characters.");
  lines.push("- Inspect `analysis.json` for example matching and conflicting achievements per pair.");
  lines.push("");

  if (signalDiscovery) {
    lines.push("## Signal Achievement Discovery");
    lines.push("");
    lines.push(`Recommended signal IDs: ${signalDiscovery.recommendedSignalIds.length}`);
    lines.push("");
    lines.push("| Achievement | Score | Same exact pairs | Same exact rate | Cross exact collisions | Completed accounts |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");

    for (const signal of signalDiscovery.topSignals.slice(0, 40)) {
      lines.push(
        `| ${signal.id} ${signal.name} | ${signal.score} | ${signal.sameAccount.exactPairs} | ${signal.sameAccount.exactRate} | ${signal.crossAccount.exactTimestampCollisions} | ${signal.completedAccounts} |`,
      );
    }

    lines.push("");
    lines.push("## Noisy Achievement Examples");
    lines.push("");
    lines.push("| Achievement | Cross exact collisions | Collision groups | Same exact rate | Completed accounts |");
    lines.push("| --- | ---: | ---: | ---: | ---: |");

    for (const signal of signalDiscovery.noisySignals.slice(0, 25)) {
      lines.push(
        `| ${signal.id} ${signal.name} | ${signal.crossAccount.exactTimestampCollisions} | ${signal.crossAccount.timestampCollisionGroups} | ${signal.sameAccount.exactRate} | ${signal.completedAccounts} |`,
      );
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const region = (getArg("region") || "eu").toLocaleLowerCase("en-US");
  const locale = getArg("locale") || "en_US";
  const runDir = getOutputDir();
  const rawDir = path.join(runDir, "raw");
  const normalizedDir = path.join(runDir, "normalized");
  const characters = parseCharacters();
  const accountGroups = parseKnownAccountGroups();

  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(normalizedDir, { recursive: true });
  await writeJson(path.join(runDir, "run.json"), {
    startedAt: new Date().toISOString(),
    region,
    locale,
    characters: characters.map((character) => character.input),
    accountGroups,
    note: "Raw Blizzard API responses are stored under raw/. Authorization headers and credentials are not written.",
  });

  if (hasFlag("dry-run")) {
    console.log(JSON.stringify({ runDir, region, locale, characters, accountGroups }, null, 2));
    return;
  }

  const token = await getAccessToken();
  const fetchResults: CharacterFetchResult[] = [];
  const normalizedCharacters: NormalizedCharacter[] = [];

  for (const character of characters) {
    console.log(`Fetching ${character.input}...`);
    const result = await fetchCharacter(token, region, locale, character, rawDir);
    fetchResults.push(result.fetchResult);
    normalizedCharacters.push(result.normalized);
    await writeJson(path.join(normalizedDir, `${character.key}.json`), result.normalized);
  }

  const analysisCharacters = prepareAnalysisCharacters(normalizedCharacters);
  const pairs = analyzePairs(analysisCharacters);
  const clusters = buildClusters(pairs, "medium");
  const signalDiscovery = discoverSignalAchievements(analysisCharacters, accountGroups);
  const analysis = {
    generatedAt: new Date().toISOString(),
    runDir,
    region,
    locale,
    characters: normalizedCharacters.map((character) => ({
      key: character.key,
      input: character.input,
      profile: character.profile,
      achievementCount: character.achievements.length,
      statisticCount: character.statistics.length,
    })),
    clusters,
    pairs,
    signalDiscovery: signalDiscovery
      ? {
          generatedAt: signalDiscovery.generatedAt,
          multiCharacterAccountCount: signalDiscovery.multiCharacterAccountCount,
          totalSameAccountPairs: signalDiscovery.totalSameAccountPairs,
          totalCrossAccountPairs: signalDiscovery.totalCrossAccountPairs,
          achievementCount: signalDiscovery.achievementCount,
          recommendedSignalIds: signalDiscovery.recommendedSignalIds,
          topSignals: signalDiscovery.topSignals,
          noisySignals: signalDiscovery.noisySignals,
        }
      : null,
  };

  await writeJson(path.join(runDir, "fetch-results.json"), fetchResults);
  await writeJson(path.join(runDir, "characters.normalized.json"), normalizedCharacters);
  await writeJson(path.join(runDir, "analysis.json"), analysis);
  if (signalDiscovery) {
    await writeJson(path.join(runDir, "signal-achievements.json"), signalDiscovery);
    await writeJson(path.join(runDir, "signal-achievement-ids.top-512.json"), signalDiscovery.recommendedSignalIds);
  }
  await writeText(path.join(runDir, "summary.md"), buildSummaryMarkdown(runDir, normalizedCharacters, pairs, clusters, signalDiscovery));

  console.log(`Wrote raw and analysis output to ${runDir}`);
  console.log(
    JSON.stringify(
      {
        runDir,
        clusters,
        topPairs: pairs.slice(0, 10).map((pair) => ({
          pair: `${pair.a} / ${pair.b}`,
          confidence: pair.confidence,
          score: pair.score,
          exactTimestampMatches: pair.timestampEvidence.exactMatches,
          exactTimestampRate: pair.timestampEvidence.exactMatchRate,
          discriminatingWeight: pair.timestampEvidence.discriminatingWeight,
          jaccard: pair.achievementCounts.jaccard,
        })),
        signalDiscovery: signalDiscovery
          ? {
              recommendedSignalIds: signalDiscovery.recommendedSignalIds.length,
              topSignals: signalDiscovery.topSignals.slice(0, 10).map((signal) => ({
                id: signal.id,
                name: signal.name,
                score: signal.score,
                sameExactPairs: signal.sameAccount.exactPairs,
                sameExactRate: signal.sameAccount.exactRate,
                crossExactCollisions: signal.crossAccount.exactTimestampCollisions,
                completedAccounts: signal.completedAccounts,
              })),
            }
          : null,
      },
      null,
      2,
    ),
  );
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});
