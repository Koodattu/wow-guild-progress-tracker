import dotenv from "dotenv";
import wclService from "../services/warcraftlogs.service";

dotenv.config();

type ProbeResult = {
  name: string;
  ok: boolean;
  status?: string;
  summary?: Record<string, unknown>;
  error?: string;
};

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

function parseReports(): string[] {
  const reportsArg = getArg("reports") || getArg("report") || process.argv[2];
  if (!reportsArg) {
    throw new Error("Pass --reports=<reportCode[,reportCode...]>");
  }
  return reportsArg
    .split(",")
    .map((report) => report.trim())
    .filter(Boolean);
}

function summarizeRankingPayload(payload: any): Record<string, unknown> {
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const first = rows[0] && typeof rows[0] === "object" ? rows[0] : null;
  return {
    type: payload === null ? "null" : Array.isArray(payload) ? "array" : typeof payload,
    keys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 20) : [],
    rowCount: rows.length,
    firstRowKeys: first ? Object.keys(first).slice(0, 20) : [],
    firstFightId: first?.fightID,
    firstRoles: first?.roles && typeof first.roles === "object" ? Object.keys(first.roles).slice(0, 10) : undefined,
  };
}

async function probeQuery(name: string, query: string, variables: Record<string, unknown>): Promise<ProbeResult> {
  try {
    const result = await wclService.query<any>(query, variables, false, 1);
    const report = result?.reportData?.report;
    return {
      name,
      ok: true,
      status: report ? "report-found" : "report-null",
      summary: {
        rateLimitData: result?.rateLimitData ?? null,
        reportCode: report?.code,
        startTime: report?.startTime,
        endTime: report?.endTime,
        fightCount: Array.isArray(report?.fights) ? report.fights.length : undefined,
        rankedCharacterCount: Array.isArray(report?.rankedCharacters) ? report.rankedCharacters.length : undefined,
        rankings: summarizeRankingPayload(report?.rankings),
      },
    };
  } catch (error) {
    return {
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeReport(reportCode: string): Promise<Record<string, unknown>> {
  const baseQuery = `
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
          rankedCharacters {
            canonicalID
            name
            classID
          }
          fights(killType: Encounters) {
            id
            encounterID
            difficulty
            kill
          }
        }
      }
    }
  `;

  const rankingsMythicQuery = `
    query($reportCode: String!) {
      rateLimitData {
        limitPerHour
        pointsSpentThisHour
        pointsResetIn
      }
      reportData {
        report(code: $reportCode) {
          code
          rankings(compare: Rankings, timeframe: Historical, difficulty: 5)
        }
      }
    }
  `;

  const rankingsDefaultQuery = `
    query($reportCode: String!) {
      rateLimitData {
        limitPerHour
        pointsSpentThisHour
        pointsResetIn
      }
      reportData {
        report(code: $reportCode) {
          code
          rankings(compare: Rankings, timeframe: Historical)
        }
      }
    }
  `;

  const parsesMythicQuery = `
    query($reportCode: String!) {
      rateLimitData {
        limitPerHour
        pointsSpentThisHour
        pointsResetIn
      }
      reportData {
        report(code: $reportCode) {
          code
          rankings(compare: Parses, timeframe: Historical, difficulty: 5)
        }
      }
    }
  `;

  const probes: ProbeResult[] = [];
  probes.push(await probeQuery("base-rankedCharacters-and-fights", baseQuery, { reportCode }));
  probes.push(await probeQuery("rankings-mythic", rankingsMythicQuery, { reportCode }));
  probes.push(await probeQuery("rankings-default", rankingsDefaultQuery, { reportCode }));
  probes.push(await probeQuery("parses-mythic", parsesMythicQuery, { reportCode }));

  return {
    reportCode,
    probes,
  };
}

async function main(): Promise<void> {
  const reports = parseReports();
  const results = [];

  for (const reportCode of reports) {
    results.push(await probeReport(reportCode));
  }

  console.log(JSON.stringify({ reports: results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
