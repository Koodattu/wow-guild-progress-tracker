# Performance Scripts

Dependency-free scripts for measuring the production home page and API endpoints.

## Browser Home Page Benchmark

```bash
node scripts/perf/benchmark-home.mjs --url https://suomiwow.vaarattu.tv/ --runs 3 --output .perf/home.json
```

This launches an installed Chrome or Edge in a fresh profile, disables browser cache by default, records Chrome DevTools network events, waits for the page load plus a quiet network window, and prints the `/api/*` calls with timings, transfer sizes, and cache headers.

If Chrome or Edge is installed somewhere unusual:

```bash
$env:CHROME_PATH = "C:\Path\To\chrome.exe"
node scripts/perf/benchmark-home.mjs --runs 3
```

## API Endpoint Benchmark

Benchmark the expected home page API calls:

```bash
node scripts/perf/benchmark-api.mjs --base https://suomiwow.vaarattu.tv --runs 10 --output .perf/api.json
```

Replay the exact GET `/api/*` endpoints discovered by the browser benchmark:

```bash
node scripts/perf/benchmark-api.mjs --from .perf/home.json --runs 10 --output .perf/api-from-home.json
```

Benchmark one endpoint directly:

```bash
node scripts/perf/benchmark-api.mjs --endpoint "/api/progress?raidId=42" --runs 20
```

Useful flags:

- `--warmup 0` disables warm-up requests.
- `--delay-ms 1000` reduces request pressure.
- `--cache-bust` appends a changing `__bench` query parameter to avoid shared cache hits.

## Interpreting Results

Start with the slowest p95 API endpoints and the largest encoded payloads. For this app, likely candidates to inspect first are the progress payload, live streamer payload, event feed payload, and any image-heavy crest or static asset traffic visible in the browser benchmark.
