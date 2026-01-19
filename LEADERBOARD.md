# Character Leaderboard (Mythic, Warcraft Logs) — Implementation Notes

## Goal

## docker compose up -d mongodb

Build a **Mythic leaderboard** for Finnish raiders that:

- Does NOT require users to log in
- Uses **Warcraft Logs public rankings**
- Includes off-guild kills
- Stays within **3600 WCL points/hour**
- Updates mainly during **low-raid hours (≈ 03–05)**

Leaderboard score is based on **tier-wide character rankings**, not single reports.

---

## High-level strategy (important)

This is a **hybrid model**:

1. **Discovery (cheap, frequent)**

   - Discover characters from tracked guild reports
   - Mark them as "active raid characters"

2. **Scoring (expensive, infrequent)**
   - Once per day, fetch **zoneRankings** for active characters
   - Store a snapshot
   - Build leaderboard from snapshots

Do NOT try to build leaderboard directly from reports.

---

## Definitions (align terminology early)

### Tracked Character

A character that:

- Appears in at least one tracked guild report
- Has participated in **Mythic** content (or whatever rule you choose)

This is NOT the same as “appears on leaderboard”.

### Leaderboard-eligible Character

A tracked character whose:

- `zoneRankings.medianPerformanceAverage !== null`
- Has at least one boss with `totalKills > 0`

Private / hidden logs will NOT qualify.

---

## Step 1: Track characters (discovery phase)

### What to do

When processing reports:

- Extract characters involved in Mythic fights
- Store/update a `TrackedCharacter` record

### Minimal fields to store

- `canonicalID` (preferred, if available)
- `name`
- `serverSlug`
- `region`
- `lastSeenAt`
- `lastMythicSeenAt`
- `rankingsAvailable` (unknown | true | false)
- `nextEligibleRefreshAt`

### Notes / gotchas

- Canonical ID is stable across renames/transfers
- You will see alts — that’s OK
- Do NOT fetch rankings here (too expensive)

🔎 If stuck: search  
**“mongoose upsert pattern”**, **“compound indexes mongoose”**

---

## Step 2: Nightly ranking refresh job (core feature)

### When

- Schedule between **03:00–05:00**
- Stop early if WCL rate usage gets high

### Which characters to refresh

- `lastMythicSeenAt < 45 days`
- `rankingsAvailable !== false`
- `now >= nextEligibleRefreshAt`
- Cap the batch size (e.g. 200–400 characters)

### The query (key insight)

Use **ONE call per character**:

```graphql
characterData {
  character(...) {
    zoneRankings(
      zoneID: CURRENT_TIER_ID,
      difficulty: 5,
      metric: dps,
      compare: Rankings,
      timeframe: Historical
    )
  }
}
```
