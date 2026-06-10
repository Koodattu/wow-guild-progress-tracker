#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_BASE_URL = "https://suomiwow.vaarattu.tv";

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    runs: 5,
    warmup: 1,
    delayMs: 250,
    from: null,
    output: null,
    cacheBust: false,
    endpoints: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return value;
    };

    if (arg === "--base") options.baseUrl = next();
    else if (arg === "--runs") options.runs = Number(next());
    else if (arg === "--warmup") options.warmup = Number(next());
    else if (arg === "--delay-ms") options.delayMs = Number(next());
    else if (arg === "--from") options.from = next();
    else if (arg === "--endpoint") options.endpoints.push(next());
    else if (arg === "--output") options.output = next();
    else if (arg === "--cache-bust") options.cacheBust = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.runs) || options.runs < 1) {
    throw new Error("--runs must be a positive integer");
  }
  if (!Number.isInteger(options.warmup) || options.warmup < 0) {
    throw new Error("--warmup must be zero or a positive integer");
  }
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error("--delay-ms must be zero or a positive number");
  }

  options.baseUrl = options.baseUrl.replace(/\/+$/, "");
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/perf/benchmark-api.mjs [options]

Options:
  --base <url>             API origin. Default: ${DEFAULT_BASE_URL}
  --runs <n>               Measured runs per endpoint. Default: 5
  --warmup <n>             Warm-up runs per endpoint, excluded from stats. Default: 1
  --delay-ms <n>           Delay between requests. Default: 250
  --from <file>            Use /api/ endpoints discovered by benchmark-home JSON
  --endpoint <path-or-url> Add an endpoint. Can be repeated
  --cache-bust             Append a changing __bench query param
  --output <file>          Write full JSON report to this path
  --help                   Show this help

Examples:
  node scripts/perf/benchmark-api.mjs --runs 10
  node scripts/perf/benchmark-api.mjs --from .perf/home.json --runs 10
  node scripts/perf/benchmark-api.mjs --endpoint /api/progress?raidId=42 --runs 20
`);
}

async function discoverDefaultEndpoints(baseUrl) {
  const endpoints = [
    { name: "raids", path: "/api/raids" },
    { name: "events-first-page", path: "/api/events?limit=5&page=1" },
    { name: "uma-reservations", path: "/api/guilds/horse-race-uma-reservations" },
    { name: "live-streamers", path: "/api/guilds/live-streamers" },
    { name: "raiding-today", path: "/api/guilds/raiding-today" },
  ];

  const raidsUrl = new URL("/api/raids", baseUrl);
  const raidsResponse = await fetch(raidsUrl, { headers: { accept: "application/json" } });
  if (!raidsResponse.ok) {
    throw new Error(`Cannot derive current raid: GET ${raidsUrl} returned ${raidsResponse.status}`);
  }
  const raids = await raidsResponse.json();
  const currentRaidId = raids?.[0]?.id;

  if (currentRaidId) {
    endpoints.push(
      { name: "progress-current", path: `/api/progress?raidId=${encodeURIComponent(currentRaidId)}` },
      { name: "raid-dates-current", path: `/api/raids/${encodeURIComponent(currentRaidId)}/dates` },
    );
  }

  return endpoints;
}

async function loadEndpoints(options) {
  if (options.endpoints.length > 0) {
    return uniqueEndpoints(options.endpoints.map((endpoint, index) => endpointFromInput(endpoint, `custom-${index + 1}`, options.baseUrl)));
  }

  if (options.from) {
    const report = JSON.parse(await readFile(options.from, "utf8"));
    const endpoints = [];
    for (const run of report.runs ?? []) {
      for (const request of run.requests ?? []) {
        if (request.category === "api" && request.method === "GET") {
          endpoints.push(endpointFromInput(request.url, request.path, options.baseUrl));
        }
      }
    }
    if (endpoints.length > 0) return uniqueEndpoints(endpoints);
    throw new Error(`No GET /api/ requests found in ${options.from}`);
  }

  return discoverDefaultEndpoints(options.baseUrl);
}

function endpointFromInput(input, fallbackName, baseUrl) {
  const url = input.startsWith("http://") || input.startsWith("https://") ? new URL(input) : new URL(input, baseUrl);
  return {
    name: fallbackName || `${url.pathname}${url.search}`,
    path: `${url.pathname}${url.search}`,
  };
}

function uniqueEndpoints(endpoints) {
  const seen = new Set();
  const unique = [];
  for (const endpoint of endpoints) {
    if (seen.has(endpoint.path)) continue;
    seen.add(endpoint.path);
    unique.push(endpoint);
  }
  return unique;
}

async function benchmarkEndpoint(baseUrl, endpoint, options) {
  const attempts = [];
  const totalRuns = options.warmup + options.runs;

  for (let run = 1; run <= totalRuns; run += 1) {
    if (attempts.length > 0 && options.delayMs > 0) {
      await sleep(options.delayMs);
    }

    const measured = run > options.warmup;
    const url = buildUrl(baseUrl, endpoint.path, options.cacheBust ? `${Date.now()}-${run}` : null);
    const result = await timeFetch(url);
    attempts.push({
      ...result,
      run,
      measured,
    });

    const marker = measured ? "run" : "warmup";
    console.log(`${marker.padEnd(6)} ${endpoint.path} ${String(result.status).padEnd(4)} ${formatMs(result.totalMs).padStart(7)} ${formatBytes(result.bytes).padStart(8)}`);
  }

  return {
    ...endpoint,
    attempts,
    summary: summarize(attempts.filter((attempt) => attempt.measured)),
  };
}

function buildUrl(baseUrl, endpointPath, cacheBustValue) {
  const url = new URL(endpointPath, baseUrl);
  if (cacheBustValue) url.searchParams.set("__bench", cacheBustValue);
  return url;
}

async function timeFetch(url) {
  const start = performance.now();
  let response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "wow-guild-progress-tracker-perf-script/1.0",
      },
    });
  } catch (error) {
    return {
      url: String(url),
      ok: false,
      status: "ERR",
      headersMs: null,
      totalMs: performance.now() - start,
      bytes: 0,
      error: error.message,
      cacheControl: null,
      cfCacheStatus: null,
      age: null,
      contentType: null,
    };
  }

  const headersMs = performance.now() - start;
  const body = await response.arrayBuffer();
  const totalMs = performance.now() - start;

  return {
    url: String(url),
    ok: response.ok,
    status: response.status,
    headersMs,
    totalMs,
    bytes: body.byteLength,
    error: null,
    cacheControl: response.headers.get("cache-control"),
    cfCacheStatus: response.headers.get("cf-cache-status"),
    age: response.headers.get("age"),
    contentType: response.headers.get("content-type"),
  };
}

function summarize(attempts) {
  const totals = attempts.map((attempt) => attempt.totalMs);
  const headers = attempts.map((attempt) => attempt.headersMs);
  const bytes = attempts.map((attempt) => attempt.bytes);
  return {
    runs: attempts.length,
    ok: attempts.filter((attempt) => attempt.ok).length,
    failed: attempts.filter((attempt) => !attempt.ok).length,
    statusCodes: countBy(attempts.map((attempt) => String(attempt.status))),
    totalMs: {
      min: round(Math.min(...totals)),
      p50: round(percentile(totals, 50)),
      p95: round(percentile(totals, 95)),
      max: round(Math.max(...totals)),
      avg: round(average(totals)),
    },
    headersMs: {
      p50: round(percentile(headers, 50)),
      p95: round(percentile(headers, 95)),
      avg: round(average(headers)),
    },
    bytes: {
      min: Math.min(...bytes),
      p50: percentile(bytes, 50),
      p95: percentile(bytes, 95),
      max: Math.max(...bytes),
      avg: Math.round(average(bytes)),
    },
    cache: {
      cfCacheStatus: mostCommon(attempts.map((attempt) => attempt.cfCacheStatus ?? "-")),
      age: mostCommon(attempts.map((attempt) => attempt.age ?? "-")),
      cacheControl: mostCommon(attempts.map((attempt) => attempt.cacheControl ?? "-")),
    },
  };
}

function printSummary(results) {
  console.log("\nSummary:");
  printTable(
    results
      .map((result) => ({
        endpoint: result.path,
        runs: result.summary.runs,
        ok: result.summary.ok,
        p50: formatMs(result.summary.totalMs.p50),
        p95: formatMs(result.summary.totalMs.p95),
        avg: formatMs(result.summary.totalMs.avg),
        avgSize: formatBytes(result.summary.bytes.avg),
        cache: result.summary.cache.cfCacheStatus !== "-" ? `cf:${result.summary.cache.cfCacheStatus}` : result.summary.cache.age !== "-" ? `age:${result.summary.cache.age}` : "-",
      }))
      .sort((a, b) => parseMs(b.p95) - parseMs(a.p95)),
    ["runs", "ok", "p50", "p95", "avg", "avgSize", "cache", "endpoint"],
  );
}

function printTable(rows, columns) {
  if (rows.length === 0) return;

  const widths = Object.fromEntries(
    columns.map((column) => [
      column,
      Math.min(
        Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)),
        column === "endpoint" ? 110 : 14,
      ),
    ]),
  );

  console.log(columns.map((column) => pad(column, widths[column])).join("  "));
  console.log(columns.map((column) => "-".repeat(widths[column])).join("  "));
  for (const row of rows) {
    console.log(columns.map((column) => pad(String(row[column] ?? ""), widths[column])).join("  "));
  }
}

function pad(value, width) {
  if (value.length > width) return `${value.slice(0, width - 1)}…`;
  return value.padEnd(width, " ");
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function percentile(values, p) {
  const numbers = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (numbers.length === 0) return null;
  const index = Math.ceil((p / 100) * numbers.length) - 1;
  return numbers[Math.max(0, Math.min(index, numbers.length - 1))];
}

function average(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (numbers.length === 0) return null;
  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
}

function round(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function parseMs(value) {
  if (!value || value === "-") return 0;
  return Number(String(value).replace("ms", ""));
}

function formatMs(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value)}ms`;
}

function formatBytes(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  if (value < 1024) return `${Math.round(value)}B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10}KB`;
  return `${Math.round(value / 1024 / 102.4) / 10}MB`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const endpoints = await loadEndpoints(options);

  console.log(`Benchmarking ${endpoints.length} endpoint(s) against ${options.baseUrl}`);
  console.log(`Measured runs=${options.runs}, warmup=${options.warmup}, delay=${options.delayMs}ms`);

  const results = [];
  for (const endpoint of endpoints) {
    console.log(`\n${endpoint.path}`);
    results.push(await benchmarkEndpoint(options.baseUrl, endpoint, options));
  }

  printSummary(results);

  const report = {
    generatedAt: new Date().toISOString(),
    options,
    endpoints,
    results,
  };

  if (options.output) {
    await mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
    await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${options.output}`);
  }
}

await main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
