import dotenv from "dotenv";
import mongoose from "mongoose";
import wclService from "../services/warcraftlogs.service";

dotenv.config();

type RankedCharacter = {
  canonicalID?: number;
  name?: string;
  classID?: number;
  hidden?: boolean;
  server?: {
    slug?: string;
    region?: {
      slug?: string;
    };
  };
  guilds?: Array<{
    name?: string;
    server?: {
      slug?: string;
      region?: {
        slug?: string;
      };
    };
  }>;
};

type WclReportCharactersResponse = {
  rateLimitData?: {
    limitPerHour: number;
    pointsSpentThisHour: number;
    pointsResetIn: number;
  };
  reportData?: {
    report?: {
      code: string;
      startTime?: number;
      endTime?: number;
      masterData?: {
        actors?: Array<{
          id: number;
          name?: string;
          server?: string;
          subType?: string;
        }>;
      };
      rankedCharacters?: RankedCharacter[] | null;
      fights?: Array<{
        id: number;
        encounterID?: number;
        name?: string;
        difficulty?: number;
        kill?: boolean;
      }>;
    } | null;
  };
};

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topEntries(map: Map<string, number>, limit = 20): Array<{ key: string; count: number }> {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function summarizeRankingPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return { type: value === null ? "null" : typeof value };
  }

  const root = value as Record<string, unknown>;
  const rankings = Array.isArray(root.rankings) ? root.rankings : Array.isArray(root.data) ? root.data : Array.isArray(root.characters) ? root.characters : Array.isArray(root) ? root : [];
  const entries = rankings.slice(0, 2).map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const row = entry as Record<string, unknown>;
    return {
      keys: Object.keys(row).slice(0, 30),
      name: row.name,
      characterName: row.characterName,
      character: row.character,
      serverName: row.serverName,
      server: row.server,
      class: row.class,
      classID: row.classID,
      spec: row.spec,
      total: row.total,
      amount: row.amount,
      rankPercent: row.rankPercent,
      reportID: row.reportID,
      fightID: row.fightID,
      roles: row.roles && typeof row.roles === "object" ? Object.fromEntries(Object.entries(row.roles as Record<string, unknown>).map(([key, roleValue]) => [key, summarizeRankingPayload(roleValue)])) : undefined,
      specs: row.specs && typeof row.specs === "object" ? Object.fromEntries(Object.entries(row.specs as Record<string, unknown>).map(([key, specValue]) => [key, summarizeRankingPayload(specValue)])) : undefined,
    };
  });

  return {
    type: Array.isArray(root) ? "array" : "object",
    keys: Object.keys(root).slice(0, 30),
    total: typeof root.total === "number" ? root.total : undefined,
    count: rankings.length,
    sample: entries,
  };
}

async function fetchRankingVariant(reportCode: string, field: string, variables: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const usesFightIds = field.includes("$fightIds");
  const usesEncounterId = field.includes("$encounterId");
  const variableDefinitions = [
    "$reportCode: String!",
    usesFightIds ? "$fightIds: [Int]" : null,
    usesEncounterId ? "$encounterId: Int" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const query = `
    query(${variableDefinitions}) {
      rateLimitData {
        limitPerHour
        pointsSpentThisHour
        pointsResetIn
      }
      reportData {
        report(code: $reportCode) {
          rankingPayload: rankings(${field})
        }
      }
    }
  `;

  try {
    const result = await wclService.query<any>(query, { reportCode, ...variables });
    return {
      ok: true,
      ...summarizeRankingPayload(result?.reportData?.report?.rankingPayload),
      rateLimitData: result?.rateLimitData ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchV1Summary(reportCode: string, fightIds: number[]): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.WCL_API_V1;
  if (!apiKey) return null;

  const fightsUrl = `https://www.warcraftlogs.com/v1/report/fights/${reportCode}?api_key=${encodeURIComponent(apiKey)}`;
  const fightsResponse = await fetch(fightsUrl);
  const fightsText = await fightsResponse.text();
  let fightsPayload: any = null;
  try {
    fightsPayload = JSON.parse(fightsText);
  } catch {
    // Leave payload null and return response metadata below.
  }

  const friendlies = Array.isArray(fightsPayload?.friendlies) ? fightsPayload.friendlies : [];
  const playerFriendlies = friendlies.filter((friendly: any) => friendly?.server && friendly?.type && friendly.type !== "Pet" && friendly.type !== "NPC");
  const exportedCharacters = Array.isArray(fightsPayload?.exportedCharacters) ? fightsPayload.exportedCharacters : [];

  const tableStatuses = [];
  for (const fightId of fightIds.slice(0, 3)) {
    const tableUrl = `https://www.warcraftlogs.com/v1/report/tables/damage-done/${reportCode}?fight=${fightId}&by=source&api_key=${encodeURIComponent(apiKey)}`;
    const tableResponse = await fetch(tableUrl);
    const tableText = await tableResponse.text();
    let tablePayload: any = null;
    try {
      tablePayload = JSON.parse(tableText);
    } catch {
      // Keep null.
    }

    tableStatuses.push({
      fightId,
      status: tableResponse.status,
      error: tablePayload?.error,
      entryCount: Array.isArray(tablePayload?.entries) ? tablePayload.entries.length : null,
    });
  }

  return {
    fightsStatus: fightsResponse.status,
    fightsError: fightsPayload?.error,
    keys: fightsPayload && typeof fightsPayload === "object" ? Object.keys(fightsPayload) : [],
    fightCount: Array.isArray(fightsPayload?.fights) ? fightsPayload.fights.length : null,
    friendliesCount: friendlies.length,
    playerFriendliesCount: playerFriendlies.length,
    exportedCharactersCount: exportedCharacters.length,
    samplePlayerFriendlies: playerFriendlies.slice(0, 25).map((friendly: any) => ({
      id: friendly.id,
      guid: friendly.guid,
      name: friendly.name,
      server: friendly.server,
      type: friendly.type,
      icon: friendly.icon,
    })),
    tableStatuses,
  };
}

async function main(): Promise<void> {
  const reportCode = getArg("report") || process.argv[2];
  if (!reportCode) {
    throw new Error("Pass a WCL report code, e.g. --report=Rx2hWN7Fgd8Hmwaf");
  }

  const mongoUri = getArg("mongo") || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/wow_guild_tracker";
  await mongoose.connect(mongoUri);

  const query = `
    query($reportCode: String!) {
      rateLimitData {
        limitPerHour
        pointsSpentThisHour
        pointsResetIn
      }
      reportData {
        report(code: $reportCode) {
          code
          startTime
          endTime
          masterData {
            actors(type: "Player") {
              id
              name
              server
              subType
            }
          }
          rankedCharacters {
            canonicalID
            name
            classID
            hidden
            server {
              slug
              region {
                slug
              }
            }
            guilds {
              name
              server {
                slug
                region {
                  slug
                }
              }
            }
          }
          fights(killType: Encounters) {
            id
            encounterID
            name
            difficulty
            kill
          }
        }
      }
    }
  `;

  const result = await wclService.query<WclReportCharactersResponse>(query, { reportCode });
  const report = result.reportData?.report;

  if (!report) {
    console.log(
      JSON.stringify(
        {
          reportCode,
          exists: false,
          rateLimitData: result.rateLimitData ?? null,
        },
        null,
        2,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    await mongoose.disconnect();
    return;
  }

  const characters = Array.isArray(report.rankedCharacters) ? report.rankedCharacters : [];
  const guildCounts = new Map<string, number>();
  const classCounts = new Map<string, number>();

  for (const character of characters) {
    increment(classCounts, String(character.classID ?? "unknown"));
    const guild = character.guilds?.[0];
    const guildKey = guild?.name && guild.server?.slug ? `${guild.name}-${guild.server.slug}` : "no guild";
    increment(guildCounts, guildKey);
  }

  const fights = report.fights ?? [];
  const playerActors = report.masterData?.actors ?? [];
  const mythicKills = fights.filter((fight) => fight.difficulty === 5 && fight.kill === true);
  const mythicKillFightIds = mythicKills.map((fight) => fight.id);
  const mythicEncounterIds = Array.from(new Set(mythicKills.map((fight) => fight.encounterID).filter((id): id is number => typeof id === "number")));

  const rankingVariants =
    mythicKillFightIds.length > 0
      ? {
          rankingsDefault: await fetchRankingVariant(reportCode, "compare: Rankings, timeframe: Historical"),
          rankingsMythic: await fetchRankingVariant(reportCode, "compare: Rankings, timeframe: Historical, difficulty: 5"),
          parsesMythic: await fetchRankingVariant(reportCode, "compare: Parses, timeframe: Historical, difficulty: 5"),
          dpsMythic: await fetchRankingVariant(reportCode, "compare: Rankings, timeframe: Historical, difficulty: 5, playerMetric: dps"),
          hpsMythic: await fetchRankingVariant(reportCode, "compare: Rankings, timeframe: Historical, difficulty: 5, playerMetric: hps"),
          fightRankings: await fetchRankingVariant(reportCode, "compare: Rankings, timeframe: Historical, fightIDs: $fightIds", { fightIds: mythicKillFightIds }),
          encounterRankings: await fetchRankingVariant(reportCode, "compare: Rankings, timeframe: Historical, difficulty: 5, encounterID: $encounterId", {
            encounterId: mythicEncounterIds[0] ?? null,
          }),
        }
      : {};
  const v1Summary = await fetchV1Summary(reportCode, mythicKillFightIds);

  console.log(
    JSON.stringify(
      {
        reportCode: report.code,
        exists: true,
        startTime: report.startTime ?? null,
        endTime: report.endTime ?? null,
        fightCount: fights.length,
        mythicKillCount: mythicKills.length,
        mythicKillFightIds,
        mythicEncounterIds,
        playerActorCount: playerActors.length,
        rankedCharacterFieldWasArray: Array.isArray(report.rankedCharacters),
        rankedCharacterCount: characters.length,
        rankingVariants,
        v1: v1Summary,
        samplePlayerActors: playerActors.slice(0, 25),
        guildCounts: topEntries(guildCounts),
        classCounts: topEntries(classCounts),
        sampleCharacters: characters.slice(0, 25).map((character) => ({
          canonicalID: character.canonicalID,
          name: character.name,
          realm: character.server?.slug,
          region: character.server?.region?.slug,
          classID: character.classID,
          hidden: character.hidden === true,
          guilds: (character.guilds ?? []).slice(0, 3).map((guild) => ({
            name: guild.name,
            realm: guild.server?.slug,
            region: guild.server?.region?.slug,
          })),
        })),
        rateLimitData: result.rateLimitData ?? null,
      },
      null,
      2,
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
