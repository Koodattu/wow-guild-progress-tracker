# Raider.IO Integration for WCL-Unavailable Guilds

## Architecture

- Guilds not on WarcraftLogs (`wclStatus === "not_found"`) get data from Raider.IO instead
- Single API call `fetchGuildProgressionAndRankings` fetches both raid_progression and raid_rankings
- Synthetic `IRaidProgress` entries created from RIO data (no boss-level detail, no pull history)
- These guilds appear in progress pages via `getAllGuildsForRaid` aggregation

## Key Files Changed

- `raiderio.service.ts` - Rate limiting (1800/hr sliding window), retry with exponential backoff, combined progression+rankings fetch
- `Guild.ts` - Added `rioStatus` and `lastRioUpdate` fields
- `guild.service.ts` - `updateGuildFromRaiderIO()`, `findRaidForRIOTierSlug()`, `upsertSyntheticProgress()`
- `scheduler.service.ts` - 9AM nightly `updateRaiderIOGuilds()` job, modified `updateGuildActivityStatus` to exclude RIO-only guilds from WCL-based inactivity checks
- `background-guild-processor.service.ts` - RIO fallback on GUILD_NOT_FOUND, marks `initialFetchCompleted: true`

## Rate Limiting

- 2000 req/hour with API key, using 1800 conservatively
- Sliding window of timestamps, waits if at capacity
- 3 retry attempts with exponential backoff (2s/4s/8s) for 429, 5xx, timeout
- 15s AbortController timeout per request

## Data Flow

1. Background processor detects GUILD_NOT_FOUND → calls `updateGuildFromRaiderIO`
2. Nightly 9AM job iterates all `wclStatus=not_found` + `initialFetchCompleted=true` guilds
3. `updateGuildFromRaiderIO` maps RIO tier slugs to internal raid IDs via `findRaidForRIOTierSlug`
4. Creates synthetic progress entries via `upsertSyntheticProgress` (won't overwrite if WCL has more kills)
5. Updates RIO world ranks, official progress, activity status

## Limitations (by design)

- No pull counts, time spent, death events, characters for RIO-only guilds
- No raid schedule, tier list participation
- No boss-level detail (empty bosses array)
- `currentBossPulls`, `bestPullPercent`, `lastKillTime` will all be 0/null in frontend
