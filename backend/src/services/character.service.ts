import { CURRENT_RAID_IDS, TRACKED_RAIDS } from "../config/guilds";
import { CLASSES } from "../config/classes";
import { ROLE_BY_CLASS_AND_SPEC } from "../config/specs";
import Character from "../models/Character";
import CharacterLeaderboard from "../models/CharacterLeaderboard";
import CharacterReportAppearance from "../models/CharacterReportAppearance";
import CharacterRaidParticipation from "../models/CharacterRaidParticipation";
import Guild from "../models/Guild";
import Ranking from "../models/Ranking";
import Raid from "../models/Raid";
import logger from "../utils/logger";
import { resolveRole, slugifySpecName } from "../utils/spec";
import rateLimitService from "./rate-limit.service";
import wclService from "./warcraftlogs.service";
import mongoose from "mongoose";

interface IWarcraftLogsAllStars {
  partition: number;
  spec: string;
  points: number;
  possiblePoints: number;
  rank: number;
  regionRank: number;
  serverRank: number;
  rankPercent: number;
  total: number;
  rankTooltip: string | null;
}

interface IWarcraftLogsRanking {
  encounter: {
    id: number;
    name: string;
  };
  rankPercent: number | null;
  medianPercent: number | null;
  lockedIn: boolean;
  totalKills: number;
  fastestKill: number;
  allStars: IWarcraftLogsAllStars | null;
  spec: string | null;
  bestSpec: string;
  bestAmount: number;
  rankTooltip: string | null;
  bestRank: {
    rank_id: number;
    class: number;
    spec: number;
    per_second_amount: number;
    ilvl: number;
    fight_metadata: number;
  };
}

interface IWarcraftLogsZoneRankings {
  bestPerformanceAverage: number;
  medianPerformanceAverage: number;
  difficulty: number;
  partition: number;
  zone: number;
  size: number;
  allStars?: IWarcraftLogsAllStars[];
  rankings: IWarcraftLogsRanking[];
}

interface IWarcraftLogsCharacter {
  id: number;
  canonicalID: number;
  name: string;
  classID: number;
  level: number;
  hidden: boolean;
  server: {
    id: number;
    name: string;
    region: {
      name: string;
    };
  };
  // When using aliased queries, zoneRankings fields appear as dynamic keys (e.g. "holyRankings", "shadowRankings")
  [aliasedRankings: string]: IWarcraftLogsZoneRankings | null | unknown;
}

interface IWarcraftLogsResponse {
  characterData: {
    character: IWarcraftLogsCharacter | null;
  };
}

/**
 * Convert a spec slug ("beast-mastery") to WCL PascalCase spec name ("BeastMastery").
 * WCL expects specName with first letter uppercase and hyphens removed.
 */
function toWclSpecName(specSlug: string): string {
  return specSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

/**
 * Convert a spec slug ("beast-mastery") to a valid GraphQL alias ("beastMasteryRankings").
 */
function toSpecAlias(specSlug: string): string {
  const parts = specSlug.split("-");
  const camel =
    parts[0] +
    parts
      .slice(1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
  return `${camel}Rankings`;
}

export type CharacterRankingRow = {
  rank: number;
  character: {
    wclCanonicalCharacterId: number;
    name: string;
    realm: string;
    region: string;
    classID: number;
    guild?: {
      name: string;
      realm: string;
    } | null;
  };
  context: {
    zoneId: number;
    difficulty: number;
    metric: "dps" | "hps";
    partition?: number;
    encounterId: number | null;
    specName?: string;
    bestSpecName?: string;
    role?: "dps" | "healer" | "tank";
    ilvl?: number;
  };
  encounter?: {
    id: number;
    name: string;
  };
  score: {
    type: "allStars" | "bestAmount";
    value: number;
  };
  stats: {
    allStars?: { points: number; possiblePoints: number };
    bestAmount?: number;
    rankPercent?: number;
    medianPercent?: number;
    lockedIn?: boolean;
    totalKills?: number;
  };
  updatedAt?: string;
};

export type CharacterRankingsResponse = {
  data: CharacterRankingRow[];
  pagination: {
    totalItems: number;
    totalRankedItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  };
};

export type GuildRaidCharacterRosterResponse = {
  guild: {
    id: string;
    name: string;
    realm: string;
  };
  raid: {
    id: number;
    name: string;
  } | null;
  characters: Array<{
    wclCanonicalCharacterId: number | null;
    name: string;
    realm: string;
    region: string;
    classID: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    reportCount: number;
  }>;
};

export type CharacterProfileResponse = {
  type: "profile";
  character: {
    wclCanonicalCharacterId: number | null;
    name: string;
    realm: string;
    region: string;
    classID: number;
    firstReportSeenAt?: Date;
    lastReportSeenAt?: Date;
    guildHistory: Array<{
      guildName: string;
      guildRealm: string;
      firstSeenAt: Date;
      lastSeenAt: Date;
    }>;
    nameHistory: Array<{
      name: string;
      realm: string;
      region: string;
      firstSeenAt: Date;
      lastSeenAt: Date;
      reportCount: number;
    }>;
  };
  raidTimeline: Array<{
    zoneId: number;
    raidName: string;
    guildId: string;
    guildName: string;
    guildRealm: string;
    characterName: string;
    characterRealm: string;
    characterRegion: string;
    firstSeenAt: Date;
    lastSeenAt: Date;
    reportCount: number;
  }>;
  rankings: Array<{
    zoneId: number;
    raidName: string;
    encounterId: number | null;
    encounterName: string | null;
    metric: string | null;
    specName: string | null;
    rankPercent: number | null;
    score: number;
    partition: number | null;
    updatedAt?: Date;
  }>;
};

export type CharacterProfileChoice = {
  wclCanonicalCharacterIds: number[];
  name: string;
  realm: string;
  region: string;
  classID: number;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
  reportCount: number;
  guildCount: number;
  latestGuild?: {
    name: string;
    realm: string;
  } | null;
};

export type CharacterProfileChoicesResponse = {
  type: "choices";
  character: {
    name: string;
    realm: string;
  };
  choices: CharacterProfileChoice[];
};

export type CharacterProfileLookupResponse = CharacterProfileResponse | CharacterProfileChoicesResponse;

export type CharacterRaidReportsResponse = {
  character: {
    wclCanonicalCharacterId: number | null;
    name: string;
    realm: string;
    region: string;
  };
  raid: {
    id: number;
    name: string;
  } | null;
  guild: {
    id: string;
    name: string;
    realm: string;
  };
  reports: Array<{
    code: string;
    url: string;
    startTime: number;
    endTime?: number;
    isOngoing: boolean;
    durationSeconds?: number;
    fightCount: number;
    kills: number;
    wipes: number;
  }>;
};

export type CharacterSearchResult = {
  wclCanonicalCharacterId: number | null;
  name: string;
  realm: string;
  region: string;
  classID: number;
  matchedName?: string;
  matchedRealm?: string;
  guild?: {
    name: string;
    realm: string;
  } | null;
  lastReportSeenAt?: Date;
  lastMythicSeenAt?: Date;
};

type WclRankedCharacter = {
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

type WclReportRankingCharacter = {
  name: string;
  className: string;
  specName?: string;
  specNames?: string[];
  server: {
    name: string;
    region: string;
  };
  fightIds: number[];
};

type ReportRankingCanonicalMatch = {
  canonicalID: number;
  characterId?: mongoose.Types.ObjectId | null;
  name: string;
  realm: string;
  region: string;
};

class CharacterService {
  private characterIdentityIndexesSynced: boolean = false;

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private getAccentInsensitiveRegex(value: string, options: { prefix?: boolean } = {}): RegExp {
    const characterClasses: Record<string, string> = {
      a: "aàáâãäåāăąǎǟǡǻȁȃạảấầẩẫậắằẳẵặ",
      c: "cçćĉċč",
      d: "dďđḍ",
      e: "eèéêëēĕėęěȅȇẹẻẽếềểễệ",
      g: "gĝğġģǧ",
      h: "hĥħḥ",
      i: "iìíîïĩīĭįıǐȉȋịỉ",
      j: "jĵ",
      k: "kķǩḳ",
      l: "lĺļľŀłḷ",
      n: "nñńņňŉŋǹṇ",
      o: "oòóôõöøōŏőơǒǫǭȍȏọỏốồổỗộớờởỡợ",
      r: "rŕŗřṛ",
      s: "sśŝşšșṣ",
      t: "tţťŧțṭ",
      u: "uùúûüũūŭůűųưǔȕȗụủứừửữự",
      w: "wŵẁẃẅ",
      y: "yýÿŷỳỵỷỹ",
      z: "zźżžẓ",
    };

    const source = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split("")
      .map((char) => {
        const lower = char.toLowerCase();
        const characterClass = characterClasses[lower];
        const token = characterClass ? `[${characterClass}]` : this.escapeRegex(char);
        return `${token}[\u0300-\u036f]*`;
      })
      .join("");

    return new RegExp(`${options.prefix ? "^" : ""}${source}`, "i");
  }

  private normalizeIdentityPart(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "-");
  }

  private getSourceIdentityKey(parts: { canonicalID?: number | null; region: string; realm: string; name: string; classID: number; source: string }): string {
    if (typeof parts.canonicalID === "number") return `canonical:${parts.canonicalID}:${parts.classID}`;
    return `${parts.source}:${this.normalizeIdentityPart(parts.region)}:${this.normalizeIdentityPart(parts.realm)}:${this.normalizeIdentityPart(parts.name)}:${parts.classID}`;
  }

  private getClassIdFromWclClassName(className: string): number | null {
    const normalized = className.toLowerCase().replace(/[^a-z]/g, "");
    const classInfo = CLASSES.find((entry) => entry.name.toLowerCase().replace(/[^a-z]/g, "") === normalized);
    return classInfo?.id ?? null;
  }

  private getReportRankingMatchKey(parts: { region: string; realm: string; name: string }): string {
    return `${this.normalizeIdentityPart(parts.region)}:${this.normalizeIdentityPart(parts.realm)}:${this.normalizeIdentityPart(parts.name)}`;
  }

  buildCanonicalMatchesFromRankedCharacters(rankedCharacters: WclRankedCharacter[]): ReportRankingCanonicalMatch[] {
    return rankedCharacters
      .map((rankedCharacter) => {
        const canonicalID = rankedCharacter.canonicalID;
        const name = rankedCharacter.name;
        const realm = rankedCharacter.server?.slug;
        const region = rankedCharacter.server?.region?.slug;

        if (!canonicalID || !name || !realm || !region) return null;

        return {
          canonicalID,
          name,
          realm,
          region,
        };
      })
      .filter((match): match is ReportRankingCanonicalMatch => match !== null);
  }

  async getCanonicalMatchesFromReportAppearances(reportCode: string): Promise<ReportRankingCanonicalMatch[]> {
    const appearances = await CharacterReportAppearance.find({
      reportCode,
      wclCanonicalCharacterId: { $ne: null },
    } as any)
      .select("characterId wclCanonicalCharacterId characterName characterRealm characterRegion")
      .lean();

    return appearances
      .map((appearance): ReportRankingCanonicalMatch | null => {
        if (!appearance.wclCanonicalCharacterId) return null;

        const match: ReportRankingCanonicalMatch = {
          canonicalID: appearance.wclCanonicalCharacterId,
          name: appearance.characterName,
          realm: appearance.characterRealm,
          region: appearance.characterRegion,
        };
        if (appearance.characterId) {
          match.characterId = appearance.characterId as mongoose.Types.ObjectId;
        }

        return match;
      })
      .filter((match): match is ReportRankingCanonicalMatch => match !== null);
  }

  private async ensureCharacterIdentityIndexes(): Promise<void> {
    if (this.characterIdentityIndexesSynced) return;

    await Character.syncIndexes();
    await CharacterReportAppearance.syncIndexes();
    this.characterIdentityIndexesSynced = true;
  }

  /**
   * Upsert a character from WCL report data with guild history tracking.
   *
   * For new characters: creates the document with current guild and initial history entry.
   * For existing characters: updates core fields, then handles guild change detection
   * and history tracking in a separate atomic step.
   */
  async upsertCharacterFromReport(params: {
    canonicalID: number;
    name: string;
    serverSlug: string;
    serverRegion: string;
    classID: number;
    hidden: boolean;
    guildName: string | null;
    guildRealm: string | null;
  }): Promise<void> {
    const now = new Date();
    const { canonicalID, name, serverSlug, serverRegion, classID, hidden, guildName, guildRealm } = params;

    const initialGuildHistory = guildName && guildRealm ? [{ guildName, guildRealm, firstSeenAt: now, lastSeenAt: now }] : [];

    await this.ensureCharacterIdentityIndexes();

    // Atomic upsert: core fields always updated via $set,
    // guild fields set only on insert via $setOnInsert (existing chars handled separately)
    const character = await Character.findOneAndUpdate(
      { wclCanonicalCharacterId: canonicalID, classID },
      {
        $set: {
          name,
          realm: serverSlug,
          region: serverRegion,
          classID,
          wclProfileHidden: hidden,
          lastMythicSeenAt: now,
          rankingsAvailable: hidden === true ? false : null,
          nextEligibleRefreshAt: now,
        },
        $setOnInsert: {
          wclCanonicalCharacterId: canonicalID,
          guildName,
          guildRealm,
          guildUpdatedAt: now,
          guildHistory: initialGuildHistory,
        },
      },
      { upsert: true, new: true },
    );

    if (!character) return;

    // For newly-inserted documents, $setOnInsert already set guild fields — skip further work.
    // Detect insert: guildHistory was set by $setOnInsert, so if it exists and updatedAt ≈ now,
    // we assume this was an insert. A safer check: if guildUpdatedAt equals now (same ms).
    // However, existing pre-migration characters won't have guildHistory at all.
    // To keep it simple and idempotent, always run the guild update — it's a no-op if nothing changed.
    await this.updateCharacterGuild(character._id as mongoose.Types.ObjectId, character.guildName ?? null, character.guildRealm ?? null, guildName, guildRealm, now);
  }

  /**
   * Upsert report-level character appearances discovered from WCL rankedCharacters.
   *
   * This is intentionally separate from the ranking-oriented Mythic upsert above:
   * old report discoveries should populate character/history data without making
   * the character immediately eligible for current-tier ranking refreshes.
   */
  async upsertCharactersFromReportAppearances(params: {
    reportCode: string;
    reportStartTime: number | Date;
    reportZoneId?: number;
    reportGuildId: mongoose.Types.ObjectId;
    reportGuildName: string;
    reportGuildRealm: string;
    rankedCharacters: WclRankedCharacter[];
  }): Promise<{ processed: number; skipped: number }> {
    const reportSeenAt = params.reportStartTime instanceof Date ? params.reportStartTime : new Date(params.reportStartTime);
    let processed = 0;
    let skipped = 0;

    await this.ensureCharacterIdentityIndexes();

    for (const rankedCharacter of params.rankedCharacters) {
      const canonicalID = rankedCharacter.canonicalID;
      const name = rankedCharacter.name;
      const realm = rankedCharacter.server?.slug;
      const region = rankedCharacter.server?.region?.slug;
      const classID = rankedCharacter.classID;

      if (!canonicalID || !name || !realm || !region || !classID) {
        skipped += 1;
        continue;
      }

      const character = await Character.findOneAndUpdate(
        { wclCanonicalCharacterId: canonicalID, classID },
        {
          $set: {
            name,
            realm,
            region,
            classID,
            wclProfileHidden: rankedCharacter.hidden === true,
          },
          $min: {
            firstReportSeenAt: reportSeenAt,
          },
          $max: {
            lastReportSeenAt: reportSeenAt,
          },
          $setOnInsert: {
            wclCanonicalCharacterId: canonicalID,
            guildName: null,
            guildRealm: null,
            guildUpdatedAt: null,
            guildHistory: [],
            lastMythicSeenAt: new Date(0),
            rankingsAvailable: null,
            nextEligibleRefreshAt: new Date("2100-01-01T00:00:00.000Z"),
          },
        },
        { upsert: true, new: true },
      );

      if (!character) {
        skipped += 1;
        continue;
      }

      const wclGuilds = (rankedCharacter.guilds || [])
        .map((guild) => ({
          name: guild.name,
          realm: guild.server?.slug,
          region: guild.server?.region?.slug,
        }))
        .filter((guild): guild is { name: string; realm: string; region: string } => Boolean(guild.name && guild.realm && guild.region));

      await CharacterReportAppearance.findOneAndUpdate(
        {
          reportCode: params.reportCode,
          wclCanonicalCharacterId: canonicalID,
          classID,
        },
        {
          $set: {
            characterId: character._id,
            wclCanonicalCharacterId: canonicalID,
            sourceIdentityKey: this.getSourceIdentityKey({ canonicalID, region, realm, name, classID, source: "rankedCharacters" }),
            appearanceSource: "rankedCharacters",
            reportCode: params.reportCode,
            reportStartTime: reportSeenAt,
            reportZoneId: params.reportZoneId,
            reportGuildId: params.reportGuildId,
            reportGuildName: params.reportGuildName,
            reportGuildRealm: params.reportGuildRealm,
            characterName: name,
            characterRealm: realm,
            characterRegion: region,
            classID,
            specNames: [],
            rankingFightIds: [],
            hidden: rankedCharacter.hidden === true,
            wclGuilds,
          },
        },
        { upsert: true, new: true },
      );

      await this.updateReportGuildHistory(character._id as mongoose.Types.ObjectId, params.reportGuildName, params.reportGuildRealm, reportSeenAt);
      processed += 1;
    }

    return { processed, skipped };
  }

  private async findCanonicalCharacterForReportRankingAppearance(params: {
    name: string;
    realm: string;
    region: string;
    classID: number;
  }): Promise<{ characterId: mongoose.Types.ObjectId; wclCanonicalCharacterId: number } | null> {
    const nameRegex = new RegExp(`^${this.escapeRegex(params.name)}$`, "i");
    const realmRegex = new RegExp(`^${this.escapeRegex(params.realm)}$`, "i");
    const regionRegex = new RegExp(`^${this.escapeRegex(params.region)}$`, "i");

    const character = await Character.findOne({
      name: nameRegex,
      realm: realmRegex,
      region: regionRegex,
      classID: params.classID,
    })
      .select("_id wclCanonicalCharacterId")
      .lean();

    if (character?.wclCanonicalCharacterId) {
      return {
        characterId: character._id as mongoose.Types.ObjectId,
        wclCanonicalCharacterId: character.wclCanonicalCharacterId,
      };
    }

    const appearance = await CharacterReportAppearance.findOne({
      characterName: nameRegex,
      characterRealm: realmRegex,
      characterRegion: regionRegex,
      classID: params.classID,
      wclCanonicalCharacterId: { $ne: null },
    } as any)
      .sort({ reportStartTime: -1 })
      .select("characterId wclCanonicalCharacterId")
      .lean();

    if (appearance?.characterId && appearance?.wclCanonicalCharacterId) {
      return {
        characterId: appearance.characterId as mongoose.Types.ObjectId,
        wclCanonicalCharacterId: appearance.wclCanonicalCharacterId,
      };
    }

    return null;
  }

  private async upsertCanonicalCharacterForReportRankingAppearance(params: {
    canonicalID: number;
    name: string;
    realm: string;
    region: string;
    classID: number;
    reportSeenAt: Date;
  }): Promise<{ characterId: mongoose.Types.ObjectId; wclCanonicalCharacterId: number } | null> {
    const character = await Character.findOneAndUpdate(
      { wclCanonicalCharacterId: params.canonicalID, classID: params.classID },
      {
        $set: {
          name: params.name,
          realm: params.realm,
          region: params.region,
          classID: params.classID,
          wclProfileHidden: false,
        },
        $min: {
          firstReportSeenAt: params.reportSeenAt,
        },
        $max: {
          lastReportSeenAt: params.reportSeenAt,
        },
        $setOnInsert: {
          wclCanonicalCharacterId: params.canonicalID,
          guildName: null,
          guildRealm: null,
          guildUpdatedAt: null,
          guildHistory: [],
          lastMythicSeenAt: new Date(0),
          rankingsAvailable: null,
          nextEligibleRefreshAt: new Date("2100-01-01T00:00:00.000Z"),
        },
      },
      { upsert: true, new: true },
    );

    if (!character) return null;

    return {
      characterId: character._id as mongoose.Types.ObjectId,
      wclCanonicalCharacterId: params.canonicalID,
    };
  }

  async upsertCharactersFromReportRankingAppearances(params: {
    reportCode: string;
    reportStartTime: number | Date;
    reportZoneId?: number;
    reportGuildId: mongoose.Types.ObjectId;
    reportGuildName: string;
    reportGuildRealm: string;
    rankingCharacters: WclReportRankingCharacter[];
    canonicalMatches?: ReportRankingCanonicalMatch[];
  }): Promise<{ processed: number; skipped: number; matched: number; unmatched: number }> {
    const reportSeenAt = params.reportStartTime instanceof Date ? params.reportStartTime : new Date(params.reportStartTime);
    let processed = 0;
    let skipped = 0;
    let matched = 0;
    let unmatched = 0;
    const canonicalMatchesByIdentity = new Map<string, ReportRankingCanonicalMatch>();

    await this.ensureCharacterIdentityIndexes();

    for (const match of params.canonicalMatches ?? []) {
      canonicalMatchesByIdentity.set(this.getReportRankingMatchKey(match), match);
    }

    for (const rankingCharacter of params.rankingCharacters) {
      const name = rankingCharacter.name;
      const realm = this.normalizeIdentityPart(rankingCharacter.server.name);
      const region = rankingCharacter.server.region.toLowerCase();
      const classID = this.getClassIdFromWclClassName(rankingCharacter.className);
      const specNames = Array.from(new Set([...(rankingCharacter.specNames ?? []), rankingCharacter.specName].filter((specName): specName is string => Boolean(specName)))).sort();
      const rankingFightIds = Array.from(new Set(rankingCharacter.fightIds.filter((fightId) => typeof fightId === "number"))).sort((a, b) => a - b);

      if (!name || !realm || !region || !classID) {
        skipped += 1;
        continue;
      }

      const externalCanonicalMatch = canonicalMatchesByIdentity.get(this.getReportRankingMatchKey({ name, realm, region }));
      const canonicalMatch = externalCanonicalMatch
        ? await this.upsertCanonicalCharacterForReportRankingAppearance({
            canonicalID: externalCanonicalMatch.canonicalID,
            name,
            realm,
            region,
            classID,
            reportSeenAt,
          })
        : await this.findCanonicalCharacterForReportRankingAppearance({
            name,
            realm,
            region,
            classID,
          });
      const sourceIdentityKey = this.getSourceIdentityKey({
        canonicalID: canonicalMatch?.wclCanonicalCharacterId,
        region,
        realm,
        name,
        classID,
        source: "reportRankings",
      });

      if (canonicalMatch?.wclCanonicalCharacterId) {
        await CharacterReportAppearance.deleteMany({
          reportCode: params.reportCode,
          wclCanonicalCharacterId: canonicalMatch.wclCanonicalCharacterId,
          classID: { $ne: classID },
          characterName: new RegExp(`^${this.escapeRegex(name)}$`, "i"),
          characterRealm: new RegExp(`^${this.escapeRegex(realm)}$`, "i"),
          characterRegion: new RegExp(`^${this.escapeRegex(region)}$`, "i"),
        });
      }

      const appearanceFilter = canonicalMatch?.wclCanonicalCharacterId
        ? {
            reportCode: params.reportCode,
            wclCanonicalCharacterId: canonicalMatch.wclCanonicalCharacterId,
            classID,
          }
        : {
            reportCode: params.reportCode,
            sourceIdentityKey,
          };

      await CharacterReportAppearance.findOneAndUpdate(
        appearanceFilter,
        {
          $set: {
            characterId: canonicalMatch?.characterId ?? null,
            wclCanonicalCharacterId: canonicalMatch?.wclCanonicalCharacterId ?? null,
            sourceIdentityKey,
            appearanceSource: "reportRankings",
            reportCode: params.reportCode,
            reportStartTime: reportSeenAt,
            reportZoneId: params.reportZoneId,
            reportGuildId: params.reportGuildId,
            reportGuildName: params.reportGuildName,
            reportGuildRealm: params.reportGuildRealm,
            characterName: name,
            characterRealm: realm,
            characterRegion: region,
            classID,
            specNames,
            rankingFightIds,
            hidden: false,
            wclGuilds: [],
          },
        },
        { upsert: true, new: true },
      );

      if (canonicalMatch) {
        await Character.updateOne(
          { _id: canonicalMatch.characterId },
          {
            $min: { firstReportSeenAt: reportSeenAt },
            $max: { lastReportSeenAt: reportSeenAt },
          },
        );
        await this.updateReportGuildHistory(canonicalMatch.characterId, params.reportGuildName, params.reportGuildRealm, reportSeenAt);
        matched += 1;
      } else {
        unmatched += 1;
      }

      processed += 1;
    }

    return { processed, skipped, matched, unmatched };
  }

  /**
   * Atomically update a character's current guild and guild history.
   *
   * - If guild changed: update guildName/guildRealm/guildUpdatedAt
   * - If guild exists in history: update lastSeenAt on existing entry
   * - If guild is new to history: push a new entry
   * - If guild was removed (null): clear current guild fields
   */
  private async updateCharacterGuild(
    characterId: mongoose.Types.ObjectId,
    currentGuildName: string | null,
    currentGuildRealm: string | null,
    newGuildName: string | null,
    newGuildRealm: string | null,
    seenAt: Date,
  ): Promise<void> {
    const guildChanged = currentGuildName !== newGuildName || currentGuildRealm !== newGuildRealm;

    // Case 1: No guild data from WCL
    if (!newGuildName || !newGuildRealm) {
      if (guildChanged && currentGuildName) {
        await Character.updateOne(
          { _id: characterId },
          {
            $set: {
              guildName: null,
              guildRealm: null,
              guildUpdatedAt: seenAt,
            },
          },
        );
      }
      return;
    }

    // Case 2: We have guild data — determine what to update
    const setFields: Record<string, unknown> = {};
    if (guildChanged) {
      setFields.guildName = newGuildName;
      setFields.guildRealm = newGuildRealm;
      setFields.guildUpdatedAt = seenAt;
    }

    // Try to update an existing guild history entry (atomic positional update)
    const historyUpdate = await Character.updateOne(
      {
        _id: characterId,
        guildHistory: {
          $elemMatch: { guildName: newGuildName, guildRealm: newGuildRealm },
        },
      },
      {
        $set: {
          ...setFields,
          "guildHistory.$.lastSeenAt": seenAt,
        },
      },
    );

    // If matchedCount === 0, the guild wasn't in history — add it
    if (historyUpdate.matchedCount === 0) {
      await Character.updateOne(
        { _id: characterId },
        {
          $set: setFields,
          $push: {
            guildHistory: {
              guildName: newGuildName,
              guildRealm: newGuildRealm,
              firstSeenAt: seenAt,
              lastSeenAt: seenAt,
            },
          },
        },
      );
    }
  }

  private async updateReportGuildHistory(characterId: mongoose.Types.ObjectId, guildName: string, guildRealm: string, seenAt: Date): Promise<void> {
    const character = await Character.findById(characterId).select("guildName guildRealm guildUpdatedAt guildHistory").lean();
    if (!character) return;

    const history = [...(character.guildHistory || [])].map((entry) => ({
      guildName: entry.guildName,
      guildRealm: entry.guildRealm,
      firstSeenAt: new Date(entry.firstSeenAt),
      lastSeenAt: new Date(entry.lastSeenAt),
    }));

    const existing = history.find((entry) => entry.guildName === guildName && entry.guildRealm === guildRealm);
    if (existing) {
      if (seenAt < existing.firstSeenAt) existing.firstSeenAt = seenAt;
      if (seenAt > existing.lastSeenAt) existing.lastSeenAt = seenAt;
    } else {
      history.push({
        guildName,
        guildRealm,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
      });
    }

    history.sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime() || a.guildName.localeCompare(b.guildName));

    const update: Record<string, unknown> = { guildHistory: history };
    const guildUpdatedAt = character.guildUpdatedAt ? new Date(character.guildUpdatedAt) : null;
    if (!guildUpdatedAt || seenAt >= guildUpdatedAt) {
      update.guildName = guildName;
      update.guildRealm = guildRealm;
      update.guildUpdatedAt = seenAt;
    }

    await Character.updateOne({ _id: characterId }, { $set: update });
  }

  private async relinkMultiClassCanonicalCharactersFromReportAppearances(): Promise<{ canonicalIds: number; groups: number; relinkedGroups: number }> {
    const startedAt = Date.now();
    const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
    logger.info("[CharacterRaidParticipation] Relink multi-class canonical characters: ensuring indexes");
    await this.ensureCharacterIdentityIndexes();

    logger.info(`[CharacterRaidParticipation] Relink multi-class canonical characters: finding canonical ID collisions (${elapsed()})`);
    const collisionRows = await CharacterReportAppearance.aggregate([
      { $match: { wclCanonicalCharacterId: { $type: "number" }, classID: { $type: "number" } } },
      {
        $group: {
          _id: "$wclCanonicalCharacterId",
          classes: { $addToSet: "$classID" },
        },
      },
      {
        $project: {
          canonicalID: "$_id",
          classCount: { $size: "$classes" },
        },
      },
      { $match: { classCount: { $gt: 1 } } },
    ]).allowDiskUse(true);

    const canonicalIds = collisionRows.map((row) => row.canonicalID).filter((id): id is number => typeof id === "number");
    logger.info(`[CharacterRaidParticipation] Relink multi-class canonical characters: found ${canonicalIds.length} multi-class canonical IDs (${elapsed()})`);
    if (canonicalIds.length === 0) {
      logger.info(`[CharacterRaidParticipation] Relink multi-class canonical characters: complete (${elapsed()})`);
      return { canonicalIds: 0, groups: 0, relinkedGroups: 0 };
    }

    logger.info(`[CharacterRaidParticipation] Relink multi-class canonical characters: aggregating identities and guild histories (${elapsed()})`);
    const [identityRows, guildRows] = await Promise.all([
      CharacterReportAppearance.aggregate([
        { $match: { wclCanonicalCharacterId: { $in: canonicalIds }, classID: { $type: "number" } } },
        { $sort: { reportStartTime: 1, reportCode: 1 } },
        {
          $group: {
            _id: {
              canonicalID: "$wclCanonicalCharacterId",
              classID: "$classID",
            },
            name: { $last: "$characterName" },
            realm: { $last: "$characterRealm" },
            region: { $last: "$characterRegion" },
            hidden: { $last: "$hidden" },
            guildName: { $last: "$reportGuildName" },
            guildRealm: { $last: "$reportGuildRealm" },
            firstReportSeenAt: { $min: "$reportStartTime" },
            lastReportSeenAt: { $max: "$reportStartTime" },
          },
        },
      ]).allowDiskUse(true),
      CharacterReportAppearance.aggregate([
        { $match: { wclCanonicalCharacterId: { $in: canonicalIds }, classID: { $type: "number" } } },
        {
          $group: {
            _id: {
              canonicalID: "$wclCanonicalCharacterId",
              classID: "$classID",
              guildName: "$reportGuildName",
              guildRealm: "$reportGuildRealm",
            },
            firstSeenAt: { $min: "$reportStartTime" },
            lastSeenAt: { $max: "$reportStartTime" },
          },
        },
        { $sort: { firstSeenAt: 1, "_id.guildName": 1, "_id.guildRealm": 1 } },
      ]).allowDiskUse(true),
    ]);
    logger.info(
      `[CharacterRaidParticipation] Relink multi-class canonical characters: aggregated ${identityRows.length} identity groups and ${guildRows.length} guild rows (${elapsed()})`,
    );

    const guildHistoryByIdentity = new Map<
      string,
      Array<{
        guildName: string;
        guildRealm: string;
        firstSeenAt: Date;
        lastSeenAt: Date;
      }>
    >();

    for (const row of guildRows) {
      const canonicalID = row._id?.canonicalID;
      const classID = row._id?.classID;
      const guildName = row._id?.guildName;
      const guildRealm = row._id?.guildRealm;
      if (typeof canonicalID !== "number" || typeof classID !== "number" || !guildName || !guildRealm) continue;

      const key = `${canonicalID}:${classID}`;
      const history = guildHistoryByIdentity.get(key) ?? [];
      history.push({
        guildName,
        guildRealm,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
      });
      guildHistoryByIdentity.set(key, history);
    }

    let relinkedGroups = 0;
    let appearanceBulkOps: any[] = [];
    let appearanceUpdateGroups = 0;

    const flushAppearanceUpdates = async () => {
      if (appearanceBulkOps.length === 0) return;
      const batchSize = appearanceBulkOps.length;
      await CharacterReportAppearance.bulkWrite(appearanceBulkOps, { ordered: false });
      appearanceUpdateGroups += batchSize;
      logger.info(
        `[CharacterRaidParticipation] Relink multi-class canonical characters: relinked ${appearanceUpdateGroups}/${identityRows.length} appearance groups (${elapsed()})`,
      );
      appearanceBulkOps = [];
    };

    for (const row of identityRows) {
      const canonicalID = row._id?.canonicalID;
      const classID = row._id?.classID;
      if (typeof canonicalID !== "number" || typeof classID !== "number" || !row.name || !row.realm || !row.region) continue;

      const identityKey = `${canonicalID}:${classID}`;
      const guildHistory = guildHistoryByIdentity.get(identityKey) ?? [];
      const character = await Character.findOneAndUpdate(
        { wclCanonicalCharacterId: canonicalID, classID },
        {
          $set: {
            name: row.name,
            realm: row.realm,
            region: row.region,
            classID,
            wclProfileHidden: row.hidden === true,
            guildName: row.guildName ?? null,
            guildRealm: row.guildRealm ?? null,
            guildUpdatedAt: row.lastReportSeenAt,
            firstReportSeenAt: row.firstReportSeenAt,
            lastReportSeenAt: row.lastReportSeenAt,
            guildHistory,
          },
          $setOnInsert: {
            wclCanonicalCharacterId: canonicalID,
            lastMythicSeenAt: new Date(0),
            rankingsAvailable: null,
            nextEligibleRefreshAt: new Date("2100-01-01T00:00:00.000Z"),
          },
        },
        { upsert: true, new: true },
      );

      if (!character) continue;

      appearanceBulkOps.push({
        updateMany: {
          filter: {
            wclCanonicalCharacterId: canonicalID,
            classID,
          },
          update: [
            {
              $set: {
                characterId: character._id,
                sourceIdentityKey: this.getSourceIdentityKey({
                  canonicalID,
                  region: row.region,
                  realm: row.realm,
                  name: row.name,
                  classID,
                  source: "rankedCharacters",
                }),
                appearanceSource: { $ifNull: ["$appearanceSource", "rankedCharacters"] },
              },
            },
          ],
        },
      });
      relinkedGroups += 1;

      if (appearanceBulkOps.length >= 500) {
        await flushAppearanceUpdates();
      }
    }

    await flushAppearanceUpdates();
    logger.info(
      `[CharacterRaidParticipation] Relink multi-class canonical characters: complete, relinked ${relinkedGroups}/${identityRows.length} groups (${elapsed()})`,
    );
    return { canonicalIds: canonicalIds.length, groups: identityRows.length, relinkedGroups };
  }

  private async matchReportRankingAppearancesToCanonicalCharacters(): Promise<number> {
    const startedAt = Date.now();
    const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
    let matched = 0;
    let scanned = 0;
    logger.info("[CharacterRaidParticipation] Matching report.rankings fallback appearances to canonical characters: loading unmatched appearances");
    const unmatchedAppearances = await CharacterReportAppearance.find({
      appearanceSource: "reportRankings",
      wclCanonicalCharacterId: null,
    })
      .select("_id characterName characterRealm characterRegion classID reportGuildName reportGuildRealm reportStartTime")
      .lean();
    logger.info(
      `[CharacterRaidParticipation] Matching report.rankings fallback appearances to canonical characters: loaded ${unmatchedAppearances.length} unmatched appearances (${elapsed()})`,
    );

    const getMatchKey = (name: string, realm: string, region: string, classID: number) =>
      `${name.toLowerCase()}:${realm.toLowerCase()}:${region.toLowerCase()}:${classID}`;
    const canonicalMatchesByIdentity = new Map<string, { characterId: mongoose.Types.ObjectId; wclCanonicalCharacterId: number }>();

    logger.info("[CharacterRaidParticipation] Matching report.rankings fallback appearances to canonical characters: building canonical match map");
    const canonicalCharacters = await Character.find({ wclCanonicalCharacterId: { $ne: null } } as any)
      .select("_id wclCanonicalCharacterId name realm region classID")
      .lean();

    for (const character of canonicalCharacters) {
      if (!character.wclCanonicalCharacterId || !character.name || !character.realm || !character.region || !character.classID) continue;
      canonicalMatchesByIdentity.set(getMatchKey(character.name, character.realm, character.region, character.classID), {
        characterId: character._id as mongoose.Types.ObjectId,
        wclCanonicalCharacterId: character.wclCanonicalCharacterId,
      });
    }

    const canonicalAppearanceRows = await CharacterReportAppearance.aggregate([
      { $match: { wclCanonicalCharacterId: { $type: "number" }, characterId: { $ne: null }, classID: { $type: "number" } } },
      { $sort: { reportStartTime: -1 } },
      {
        $group: {
          _id: {
            name: { $toLower: "$characterName" },
            realm: { $toLower: "$characterRealm" },
            region: { $toLower: "$characterRegion" },
            classID: "$classID",
          },
          characterId: { $first: "$characterId" },
          wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
        },
      },
    ]).allowDiskUse(true);

    for (const row of canonicalAppearanceRows) {
      const name = row._id?.name;
      const realm = row._id?.realm;
      const region = row._id?.region;
      const classID = row._id?.classID;
      if (!name || !realm || !region || typeof classID !== "number" || !row.characterId || typeof row.wclCanonicalCharacterId !== "number") continue;

      const key = getMatchKey(name, realm, region, classID);
      if (!canonicalMatchesByIdentity.has(key)) {
        canonicalMatchesByIdentity.set(key, {
          characterId: row.characterId as mongoose.Types.ObjectId,
          wclCanonicalCharacterId: row.wclCanonicalCharacterId,
        });
      }
    }
    logger.info(
      `[CharacterRaidParticipation] Matching report.rankings fallback appearances to canonical characters: built ${canonicalMatchesByIdentity.size} canonical identity matches (${elapsed()})`,
    );

    let appearanceBulkOps: any[] = [];
    const characterDateUpdatesById = new Map<string, { characterId: mongoose.Types.ObjectId; firstSeenAt: Date; lastSeenAt: Date }>();
    const guildHistoryUpdatesByKey = new Map<
      string,
      {
        characterId: mongoose.Types.ObjectId;
        guildName: string;
        guildRealm: string;
        firstSeenAt: Date;
        lastSeenAt: Date;
      }
    >();

    const flushAppearanceUpdates = async () => {
      if (appearanceBulkOps.length === 0) return;
      try {
        await CharacterReportAppearance.bulkWrite(appearanceBulkOps, { ordered: false });
      } catch (error) {
        const writeErrors = (error as any)?.writeErrors?.length ?? 0;
        logger.warn(
          `[CharacterRaidParticipation] Matching report.rankings fallback appearances: ${writeErrors || "some"} batched appearance updates failed, likely duplicate legacy rows`,
        );
      }
      appearanceBulkOps = [];
    };

    for (const appearance of unmatchedAppearances) {
      scanned += 1;
      const canonicalMatch = canonicalMatchesByIdentity.get(
        getMatchKey(appearance.characterName, appearance.characterRealm, appearance.characterRegion, appearance.classID),
      );

      if (scanned % 1000 === 0) {
        logger.info(
          `[CharacterRaidParticipation] Matching report.rankings fallback appearances to canonical characters: scanned ${scanned}/${unmatchedAppearances.length}, matched ${matched} (${elapsed()})`,
        );
      }

      if (!canonicalMatch) continue;

      appearanceBulkOps.push({
        updateOne: {
          filter: { _id: appearance._id },
          update: {
            $set: {
              characterId: canonicalMatch.characterId,
              wclCanonicalCharacterId: canonicalMatch.wclCanonicalCharacterId,
              sourceIdentityKey: this.getSourceIdentityKey({
                canonicalID: canonicalMatch.wclCanonicalCharacterId,
                region: appearance.characterRegion,
                realm: appearance.characterRealm,
                name: appearance.characterName,
                classID: appearance.classID,
                source: "reportRankings",
              }),
            },
          },
        },
      });

      const characterDateKey = canonicalMatch.characterId.toString();
      const characterDateUpdate = characterDateUpdatesById.get(characterDateKey);
      if (!characterDateUpdate) {
        characterDateUpdatesById.set(characterDateKey, {
          characterId: canonicalMatch.characterId,
          firstSeenAt: appearance.reportStartTime,
          lastSeenAt: appearance.reportStartTime,
        });
      } else {
        if (appearance.reportStartTime < characterDateUpdate.firstSeenAt) characterDateUpdate.firstSeenAt = appearance.reportStartTime;
        if (appearance.reportStartTime > characterDateUpdate.lastSeenAt) characterDateUpdate.lastSeenAt = appearance.reportStartTime;
      }

      const guildHistoryKey = `${characterDateKey}:${appearance.reportGuildName.toLowerCase()}:${appearance.reportGuildRealm.toLowerCase()}`;
      const guildHistoryUpdate = guildHistoryUpdatesByKey.get(guildHistoryKey);
      if (!guildHistoryUpdate) {
        guildHistoryUpdatesByKey.set(guildHistoryKey, {
          characterId: canonicalMatch.characterId,
          guildName: appearance.reportGuildName,
          guildRealm: appearance.reportGuildRealm,
          firstSeenAt: appearance.reportStartTime,
          lastSeenAt: appearance.reportStartTime,
        });
      } else {
        if (appearance.reportStartTime < guildHistoryUpdate.firstSeenAt) guildHistoryUpdate.firstSeenAt = appearance.reportStartTime;
        if (appearance.reportStartTime > guildHistoryUpdate.lastSeenAt) guildHistoryUpdate.lastSeenAt = appearance.reportStartTime;
      }

      matched += 1;

      if (appearanceBulkOps.length >= 1000) {
        await flushAppearanceUpdates();
      }
    }

    await flushAppearanceUpdates();

    if (characterDateUpdatesById.size > 0) {
      const dateUpdateOps = Array.from(characterDateUpdatesById.values()).map((update) => ({
        updateOne: {
          filter: { _id: update.characterId },
          update: {
            $min: { firstReportSeenAt: update.firstSeenAt },
            $max: { lastReportSeenAt: update.lastSeenAt },
          },
        },
      }));
      await Character.bulkWrite(dateUpdateOps, { ordered: false });
    }

    let guildHistoryUpdates = 0;
    for (const update of guildHistoryUpdatesByKey.values()) {
      await this.updateReportGuildHistory(update.characterId, update.guildName, update.guildRealm, update.firstSeenAt);
      if (update.lastSeenAt > update.firstSeenAt) {
        await this.updateReportGuildHistory(update.characterId, update.guildName, update.guildRealm, update.lastSeenAt);
      }
      guildHistoryUpdates += 1;

      if (guildHistoryUpdates % 1000 === 0) {
        logger.info(
          `[CharacterRaidParticipation] Matching report.rankings fallback appearances to canonical characters: updated ${guildHistoryUpdates}/${guildHistoryUpdatesByKey.size} guild history groups (${elapsed()})`,
        );
      }
    }

    logger.info(
      `[CharacterRaidParticipation] Matching report.rankings fallback appearances to canonical characters: complete, scanned ${scanned}, matched ${matched}, updated ${guildHistoryUpdatesByKey.size} guild history groups (${elapsed()})`,
    );
    return matched;
  }

  private async backfillAppearanceReportZoneIds(): Promise<number> {
    const rows = await CharacterReportAppearance.aggregate([
      {
        $match: {
          $or: [{ reportZoneId: { $exists: false } }, { reportZoneId: null }, { reportZoneId: 0 }],
        },
      },
      {
        $group: {
          _id: {
            reportCode: "$reportCode",
            reportGuildId: "$reportGuildId",
          },
        },
      },
      {
        $lookup: {
          from: "reports",
          let: { reportCode: "$_id.reportCode", guildId: "$_id.reportGuildId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ["$code", "$$reportCode"] }, { $eq: ["$guildId", "$$guildId"] }],
                },
              },
            },
            { $project: { zoneId: 1 } },
          ],
          as: "report",
        },
      },
      { $unwind: "$report" },
      { $match: { "report.zoneId": { $gt: 0 } } },
      {
        $project: {
          _id: 0,
          reportCode: "$_id.reportCode",
          reportGuildId: "$_id.reportGuildId",
          reportZoneId: "$report.zoneId",
        },
      },
    ]).allowDiskUse(true);

    if (rows.length === 0) return 0;

    let updatedReports = 0;
    const batchSize = 1000;
    for (let index = 0; index < rows.length; index += batchSize) {
      const batch = rows.slice(index, index + batchSize);
      const bulkOps: any[] = batch.map((row) => ({
        updateMany: {
          filter: {
            reportCode: row.reportCode,
            reportGuildId: row.reportGuildId,
            $or: [{ reportZoneId: { $exists: false } }, { reportZoneId: null }, { reportZoneId: 0 }],
          },
          update: {
            $set: {
              reportZoneId: row.reportZoneId,
            },
          },
        },
      }));
      await CharacterReportAppearance.bulkWrite(
        bulkOps,
        { ordered: false },
      );
      updatedReports += batch.length;
    }

    return updatedReports;
  }

  async rebuildCharacterRaidParticipations(): Promise<{ deleted: number; inserted: number }> {
    const startedAt = Date.now();
    const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
    logger.info("[CharacterRaidParticipation] Rebuilding materialized participation collection");
    logger.info("[CharacterRaidParticipation] Step 1/6: relinking multi-class canonical characters");
    const relinkedCanonicalClasses = await this.relinkMultiClassCanonicalCharactersFromReportAppearances();
    logger.info(`[CharacterRaidParticipation] Step 1/6 complete (${elapsed()})`);

    logger.info("[CharacterRaidParticipation] Step 2/6: matching fallback report.rankings appearances");
    const matchedFallbackAppearances = await this.matchReportRankingAppearancesToCanonicalCharacters();
    logger.info(`[CharacterRaidParticipation] Step 2/6 complete (${elapsed()})`);

    logger.info("[CharacterRaidParticipation] Step 3/6: ensuring report zone IDs are denormalized on appearances");
    const zoneBackfilledReports = await this.backfillAppearanceReportZoneIds();
    logger.info(`[CharacterRaidParticipation] Step 3/6 zone ID fill complete: updated ${zoneBackfilledReports} report groups (${elapsed()})`);

    logger.info("[CharacterRaidParticipation] Step 3/6: aggregating report appearances into raid participations");
    const rows = await CharacterReportAppearance.aggregate([
      { $match: { reportZoneId: { $gt: 0 } } },
      {
        $sort: {
          reportStartTime: 1,
        },
      },
      {
        $group: {
          _id: {
            wclCanonicalCharacterId: "$wclCanonicalCharacterId",
            zoneId: "$reportZoneId",
            reportGuildId: "$reportGuildId",
            classID: "$classID",
            fallbackName: {
              $cond: [{ $eq: [{ $ifNull: ["$wclCanonicalCharacterId", null] }, null] }, "$characterName", null],
            },
            fallbackRealm: {
              $cond: [{ $eq: [{ $ifNull: ["$wclCanonicalCharacterId", null] }, null] }, "$characterRealm", null],
            },
            fallbackRegion: {
              $cond: [{ $eq: [{ $ifNull: ["$wclCanonicalCharacterId", null] }, null] }, "$characterRegion", null],
            },
          },
          characterId: { $first: "$characterId" },
          wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
          zoneId: { $first: "$reportZoneId" },
          reportGuildId: { $first: "$reportGuildId" },
          reportGuildName: { $last: "$reportGuildName" },
          reportGuildRealm: { $last: "$reportGuildRealm" },
          characterName: { $last: "$characterName" },
          characterRealm: { $last: "$characterRealm" },
          characterRegion: { $last: "$characterRegion" },
          classID: { $last: "$classID" },
          firstSeenAt: { $min: "$reportStartTime" },
          lastSeenAt: { $max: "$reportStartTime" },
          reportCount: { $sum: 1 },
        },
      },
      {
        $project: {
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
          reportCount: 1,
        },
      },
    ]).allowDiskUse(true);
    logger.info(`[CharacterRaidParticipation] Step 3/6 complete: aggregated ${rows.length} participation rows (${elapsed()})`);

    logger.info("[CharacterRaidParticipation] Step 4/6: deleting existing materialized participation rows");
    const deleteResult = await CharacterRaidParticipation.deleteMany({});
    logger.info(`[CharacterRaidParticipation] Step 4/6 complete: deleted ${deleteResult.deletedCount ?? 0} rows (${elapsed()})`);

    // Drops stale unique indexes while the materialized collection is empty.
    logger.info("[CharacterRaidParticipation] Step 5/6: syncing participation indexes");
    await CharacterRaidParticipation.syncIndexes();
    logger.info(`[CharacterRaidParticipation] Step 5/6 complete (${elapsed()})`);

    logger.info("[CharacterRaidParticipation] Step 6/6: inserting rebuilt participation rows");
    if (rows.length > 0) {
      const batchSize = 5000;
      for (let index = 0; index < rows.length; index += batchSize) {
        const batch = rows.slice(index, index + batchSize);
        await CharacterRaidParticipation.insertMany(batch, { ordered: false });
        logger.info(
          `[CharacterRaidParticipation] Step 6/6 progress: inserted ${Math.min(index + batch.length, rows.length)}/${rows.length} rows (${elapsed()})`,
        );
      }
    }
    logger.info(`[CharacterRaidParticipation] Step 6/6 complete (${elapsed()})`);

    logger.info(
      `[CharacterRaidParticipation] Rebuild complete in ${elapsed()}: relinked ${relinkedCanonicalClasses.relinkedGroups}/${relinkedCanonicalClasses.groups} canonical-class groups across ${relinkedCanonicalClasses.canonicalIds} multi-class canonical IDs, matched ${matchedFallbackAppearances} fallback appearances, deleted ${deleteResult.deletedCount}, inserted ${rows.length}`,
    );
    return { deleted: deleteResult.deletedCount ?? 0, inserted: rows.length };
  }

  async getGuildRaidCharactersByRealmName(realm: string, name: string, zoneId: number): Promise<GuildRaidCharacterRosterResponse | null> {
    const guild = await Guild.findOne({
      realm: new RegExp(`^${this.escapeRegex(realm)}$`, "i"),
      name: new RegExp(`^${this.escapeRegex(name)}$`, "i"),
    })
      .select("_id name realm")
      .lean();

    if (!guild) return null;

    const [raid, characters] = await Promise.all([
      Raid.findOne({ id: zoneId }).select("id name -_id").lean(),
      CharacterRaidParticipation.find({ reportGuildId: guild._id, zoneId })
        .sort({ classID: 1, characterName: 1 })
        .select("wclCanonicalCharacterId characterName characterRealm characterRegion classID firstSeenAt lastSeenAt reportCount -_id")
        .lean(),
    ]);

    return {
      guild: {
        id: guild._id.toString(),
        name: guild.name,
        realm: guild.realm,
      },
      raid: raid ? { id: raid.id, name: raid.name } : null,
      characters: characters.map((character) => ({
        wclCanonicalCharacterId: character.wclCanonicalCharacterId ?? null,
        name: character.characterName,
        realm: character.characterRealm,
        region: character.characterRegion,
        classID: character.classID,
        firstSeenAt: character.firstSeenAt,
        lastSeenAt: character.lastSeenAt,
        reportCount: character.reportCount,
      })),
    };
  }

  async searchCharacters(query: string, limit = 10): Promise<CharacterSearchResult[]> {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) return [];

    const safeLimit = Math.min(Math.max(limit, 1), 10);
    const namePrefix = this.getAccentInsensitiveRegex(trimmedQuery, { prefix: true });

    const aliasRows = await CharacterRaidParticipation.aggregate([
      {
        $match: {
          characterName: namePrefix,
        },
      },
      { $sort: { lastSeenAt: -1 } },
      {
        $group: {
          _id: {
            wclCanonicalCharacterId: "$wclCanonicalCharacterId",
            classID: "$classID",
            fallbackName: {
              $cond: [{ $eq: [{ $ifNull: ["$wclCanonicalCharacterId", null] }, null] }, "$characterName", null],
            },
            fallbackRealm: {
              $cond: [{ $eq: [{ $ifNull: ["$wclCanonicalCharacterId", null] }, null] }, "$characterRealm", null],
            },
            fallbackRegion: {
              $cond: [{ $eq: [{ $ifNull: ["$wclCanonicalCharacterId", null] }, null] }, "$characterRegion", null],
            },
          },
          matchedName: { $first: "$characterName" },
          matchedRealm: { $first: "$characterRealm" },
          matchedLastSeenAt: { $max: "$lastSeenAt" },
        },
      },
      {
        $lookup: {
          from: "characterraidparticipations",
          let: {
            canonicalId: "$_id.wclCanonicalCharacterId",
            classId: "$_id.classID",
            fallbackName: "$_id.fallbackName",
            fallbackRealm: "$_id.fallbackRealm",
            fallbackRegion: "$_id.fallbackRegion",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$classID", "$$classId"] },
                    {
                      $or: [
                        { $and: [{ $ne: ["$$canonicalId", null] }, { $eq: ["$wclCanonicalCharacterId", "$$canonicalId"] }] },
                        {
                          $and: [
                            { $eq: ["$$canonicalId", null] },
                            { $eq: ["$characterName", "$$fallbackName"] },
                            { $eq: ["$characterRealm", "$$fallbackRealm"] },
                            { $eq: ["$characterRegion", "$$fallbackRegion"] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
            { $sort: { lastSeenAt: -1 } },
            { $limit: 1 },
            {
              $project: {
                _id: 0,
                characterName: 1,
                characterRealm: 1,
                characterRegion: 1,
                reportGuildName: 1,
                reportGuildRealm: 1,
                lastSeenAt: 1,
              },
            },
          ],
          as: "current",
        },
      },
      { $unwind: "$current" },
      {
        $project: {
          _id: 0,
          wclCanonicalCharacterId: "$_id.wclCanonicalCharacterId",
          name: "$current.characterName",
          realm: "$current.characterRealm",
          region: "$current.characterRegion",
          classID: "$_id.classID",
          matchedName: 1,
          matchedRealm: 1,
          guild: {
            name: "$current.reportGuildName",
            realm: "$current.reportGuildRealm",
          },
          lastReportSeenAt: "$current.lastSeenAt",
        },
      },
      { $sort: { lastReportSeenAt: -1, name: 1, realm: 1, classID: 1 } },
      { $limit: safeLimit },
    ]);

    return (aliasRows as CharacterSearchResult[]).map((character) => ({
      ...character,
      matchedName: character.matchedName === character.name && character.matchedRealm === character.realm ? undefined : character.matchedName,
      matchedRealm: character.matchedName === character.name && character.matchedRealm === character.realm ? undefined : character.matchedRealm,
    }));
  }

  async getCharacterProfileByRealmName(realm: string, name: string, classId?: number): Promise<CharacterProfileLookupResponse | null> {
    const realmRegex = new RegExp(`^${this.escapeRegex(realm)}$`, "i");
    const nameRegex = new RegExp(`^${this.escapeRegex(name)}$`, "i");

    const identityRows = await CharacterRaidParticipation.aggregate([
      {
        $match: {
          characterRealm: realmRegex,
          characterName: nameRegex,
          zoneId: { $in: TRACKED_RAIDS },
        },
      },
      { $sort: { lastSeenAt: -1 } },
      {
        $group: {
          _id: {
            wclCanonicalCharacterId: "$wclCanonicalCharacterId",
            classID: "$classID",
            fallbackName: {
              $cond: [{ $eq: [{ $ifNull: ["$wclCanonicalCharacterId", null] }, null] }, "$characterName", null],
            },
            fallbackRealm: {
              $cond: [{ $eq: [{ $ifNull: ["$wclCanonicalCharacterId", null] }, null] }, "$characterRealm", null],
            },
            fallbackRegion: {
              $cond: [{ $eq: [{ $ifNull: ["$wclCanonicalCharacterId", null] }, null] }, "$characterRegion", null],
            },
          },
          wclCanonicalCharacterIds: { $addToSet: "$wclCanonicalCharacterId" },
          name: { $first: "$characterName" },
          realm: { $first: "$characterRealm" },
          region: { $first: "$characterRegion" },
          classID: { $first: "$classID" },
          firstSeenAt: { $min: "$firstSeenAt" },
          lastSeenAt: { $max: "$lastSeenAt" },
          reportCount: { $sum: "$reportCount" },
          guilds: { $addToSet: { name: "$reportGuildName", realm: "$reportGuildRealm" } },
          latestGuildName: { $first: "$reportGuildName" },
          latestGuildRealm: { $first: "$reportGuildRealm" },
        },
      },
      {
        $project: {
          _id: 0,
          wclCanonicalCharacterIds: 1,
          name: 1,
          realm: 1,
          region: 1,
          classID: 1,
          firstSeenAt: 1,
          lastSeenAt: 1,
          reportCount: 1,
          guildCount: { $size: "$guilds" },
          latestGuild: {
            name: "$latestGuildName",
            realm: "$latestGuildRealm",
          },
        },
      },
      { $sort: { lastSeenAt: -1, classID: 1 } },
    ]);

    const choices = (identityRows as CharacterProfileChoice[]).map((choice) => ({
      ...choice,
      wclCanonicalCharacterIds: (choice.wclCanonicalCharacterIds || []).filter((id): id is number => typeof id === "number"),
    }));
    if (!classId && choices.length > 1) {
      return {
        type: "choices",
        character: {
          name: choices[0]?.name ?? name,
          realm: choices[0]?.realm ?? realm,
        },
        choices,
      };
    }

    const selectedChoice = classId ? choices.find((choice) => choice.classID === classId) : choices[0];

    let timelineRows: any[] = [];
    let rankingRows: any[] = [];
    let character: {
      wclCanonicalCharacterId: number | null;
      name: string;
      realm: string;
      region: string;
      classID: number;
    } | null = null;
    let profileCanonicalIds: number[] = [];
    let profileClassId: number | undefined;

    if (selectedChoice) {
      const canonicalIds = selectedChoice.wclCanonicalCharacterIds;
      profileCanonicalIds = canonicalIds;
      profileClassId = selectedChoice.classID;
      character = {
        wclCanonicalCharacterId: canonicalIds[0] ?? null,
        name: selectedChoice.name,
        realm: selectedChoice.realm,
        region: selectedChoice.region,
        classID: selectedChoice.classID,
      };

      const timelineMatch =
        canonicalIds.length > 0
          ? {
              wclCanonicalCharacterId: { $in: canonicalIds },
              classID: selectedChoice.classID,
              zoneId: { $in: TRACKED_RAIDS },
            }
          : {
              characterRealm: realmRegex,
              characterName: nameRegex,
              classID: selectedChoice.classID,
              zoneId: { $in: TRACKED_RAIDS },
            };

      [timelineRows, rankingRows] = await Promise.all([
        CharacterRaidParticipation.find(timelineMatch)
          .sort({ firstSeenAt: 1, zoneId: 1 })
          .lean(),
        canonicalIds.length > 0
          ? CharacterLeaderboard.find({
              wclCanonicalCharacterId: { $in: canonicalIds },
              classID: selectedChoice.classID,
              zoneId: { $in: TRACKED_RAIDS },
            })
              .sort({ zoneId: -1, score: -1 })
              .lean()
          : Promise.resolve([]),
      ]);
    } else {
      const fallbackCharacter = await Character.findOne({
        realm: realmRegex,
        name: nameRegex,
        ...(classId ? { classID: classId } : {}),
      })
        .select("wclCanonicalCharacterId name realm region classID")
        .lean();

      if (!fallbackCharacter) return null;

      character = fallbackCharacter;
      profileCanonicalIds = [fallbackCharacter.wclCanonicalCharacterId];
      profileClassId = fallbackCharacter.classID;

      [timelineRows, rankingRows] = await Promise.all([
        CharacterRaidParticipation.find({ wclCanonicalCharacterId: fallbackCharacter.wclCanonicalCharacterId, zoneId: { $in: TRACKED_RAIDS } })
          .sort({ firstSeenAt: 1, zoneId: 1 })
          .lean(),
        CharacterLeaderboard.find({
          wclCanonicalCharacterId: fallbackCharacter.wclCanonicalCharacterId,
          classID: fallbackCharacter.classID,
          zoneId: { $in: TRACKED_RAIDS },
        })
          .sort({ zoneId: -1, score: -1 })
          .lean(),
      ]);
    }

    const latestTimelineRow = [...timelineRows].sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())[0];
    if (latestTimelineRow) {
      character.name = latestTimelineRow.characterName;
      character.realm = latestTimelineRow.characterRealm;
      character.region = latestTimelineRow.characterRegion;
    }

    const raidIds = Array.from(new Set([...timelineRows.map((row) => row.zoneId), ...rankingRows.map((row: any) => row.zoneId)])).filter((id): id is number => typeof id === "number");
    const raids = await Raid.find({ id: { $in: raidIds } }).select("id name -_id").lean();
    const raidNameById = new Map(raids.map((raid) => [raid.id, raid.name]));
    const guildHistoryByGuild = new Map<
      string,
      {
        guildName: string;
        guildRealm: string;
        firstSeenAt: Date;
        lastSeenAt: Date;
      }
    >();

    timelineRows.forEach((row) => {
      const key = `${row.reportGuildName.toLowerCase()}:${row.reportGuildRealm.toLowerCase()}`;
      const existing = guildHistoryByGuild.get(key);

      if (!existing) {
        guildHistoryByGuild.set(key, {
          guildName: row.reportGuildName,
          guildRealm: row.reportGuildRealm,
          firstSeenAt: row.firstSeenAt,
          lastSeenAt: row.lastSeenAt,
        });
        return;
      }

      if (row.firstSeenAt < existing.firstSeenAt) existing.firstSeenAt = row.firstSeenAt;
      if (row.lastSeenAt > existing.lastSeenAt) existing.lastSeenAt = row.lastSeenAt;
    });

    const trackedGuildHistory = Array.from(guildHistoryByGuild.values()).sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime());
    const trackedFirstSeenAt = timelineRows.reduce<Date | undefined>((earliest, row) => (!earliest || row.firstSeenAt < earliest ? row.firstSeenAt : earliest), undefined);
    const trackedLastSeenAt = timelineRows.reduce<Date | undefined>((latest, row) => (!latest || row.lastSeenAt > latest ? row.lastSeenAt : latest), undefined);
    const nameHistory = await CharacterReportAppearance.aggregate([
      {
        $match: {
          ...(profileCanonicalIds.length > 0
            ? { wclCanonicalCharacterId: { $in: profileCanonicalIds } }
            : {
                characterRealm: realmRegex,
                characterName: nameRegex,
              }),
          ...(profileClassId ? { classID: profileClassId } : {}),
        },
      },
      {
        $group: {
          _id: {
            name: "$characterName",
            realm: "$characterRealm",
            region: "$characterRegion",
          },
          name: { $first: "$characterName" },
          realm: { $first: "$characterRealm" },
          region: { $first: "$characterRegion" },
          firstSeenAt: { $min: "$reportStartTime" },
          lastSeenAt: { $max: "$reportStartTime" },
          reportCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          name: 1,
          realm: 1,
          region: 1,
          firstSeenAt: 1,
          lastSeenAt: 1,
          reportCount: 1,
        },
      },
      { $sort: { lastSeenAt: -1, name: 1, realm: 1 } },
    ]);

    return {
      type: "profile",
      character: {
        wclCanonicalCharacterId: character.wclCanonicalCharacterId,
        name: character.name,
        realm: character.realm,
        region: character.region,
        classID: character.classID,
        firstReportSeenAt: trackedFirstSeenAt,
        lastReportSeenAt: trackedLastSeenAt,
        guildHistory: trackedGuildHistory.map((entry) => ({
          guildName: entry.guildName,
          guildRealm: entry.guildRealm,
          firstSeenAt: entry.firstSeenAt,
          lastSeenAt: entry.lastSeenAt,
        })),
        nameHistory,
      },
      raidTimeline: timelineRows.map((row) => ({
        zoneId: row.zoneId,
        raidName: raidNameById.get(row.zoneId) || `Raid ${row.zoneId}`,
        guildId: row.reportGuildId.toString(),
        guildName: row.reportGuildName,
        guildRealm: row.reportGuildRealm,
        characterName: row.characterName,
        characterRealm: row.characterRealm,
        characterRegion: row.characterRegion,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        reportCount: row.reportCount,
      })),
      rankings: rankingRows.map((row: any) => ({
        zoneId: row.zoneId,
        raidName: raidNameById.get(row.zoneId) || `Raid ${row.zoneId}`,
        encounterId: row.encounterId ?? null,
        encounterName: row.encounterName || null,
        metric: row.metric ?? null,
        specName: row.specName ?? null,
        rankPercent: row.rankPercent ?? null,
        score: row.score ?? 0,
        partition: row.partition ?? null,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async getCharacterRaidReportsByRealmName(realm: string, name: string, zoneId: number, guildId: string, classId?: number): Promise<CharacterRaidReportsResponse | null> {
    if (!mongoose.Types.ObjectId.isValid(guildId)) return null;

    const realmRegex = new RegExp(`^${this.escapeRegex(realm)}$`, "i");
    const nameRegex = new RegExp(`^${this.escapeRegex(name)}$`, "i");
    const reportGuildId = new mongoose.Types.ObjectId(guildId);
    const participationRows = await CharacterRaidParticipation.find({
      characterRealm: realmRegex,
      characterName: nameRegex,
      reportGuildId,
      zoneId,
      ...(classId ? { classID: classId } : {}),
    })
      .select("wclCanonicalCharacterId classID -_id")
      .lean();
    const canonicalIds = Array.from(new Set(participationRows.map((row) => row.wclCanonicalCharacterId).filter((id): id is number => typeof id === "number")));
    const participationClassIds = Array.from(new Set(participationRows.map((row) => row.classID).filter((id): id is number => typeof id === "number")));
    const appearanceMatch =
      canonicalIds.length > 0
        ? {
            wclCanonicalCharacterId: { $in: canonicalIds },
            reportGuildId,
            ...(classId ? { classID: classId } : participationClassIds.length > 0 ? { classID: { $in: participationClassIds } } : {}),
          }
        : {
            characterRealm: realmRegex,
            characterName: nameRegex,
            reportGuildId,
            ...(classId ? { classID: classId } : {}),
          };

    const [raid, appearanceRows] = await Promise.all([
      Raid.findOne({ id: zoneId }).select("id name -_id").lean(),
      CharacterReportAppearance.aggregate([
        {
          $match: appearanceMatch,
        },
        {
          $lookup: {
            from: "reports",
            let: { reportCode: "$reportCode", guildId: "$reportGuildId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ["$code", "$$reportCode"] }, { $eq: ["$guildId", "$$guildId"] }, { $eq: ["$zoneId", zoneId] }],
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  code: 1,
                  startTime: 1,
                  endTime: 1,
                  isOngoing: 1,
                  fightCount: 1,
                  encounterFights: 1,
                },
              },
            ],
            as: "report",
          },
        },
        { $unwind: "$report" },
        { $sort: { reportStartTime: -1, reportCode: 1 } },
        {
          $project: {
            _id: 0,
            wclCanonicalCharacterId: 1,
            characterName: 1,
            characterRealm: 1,
            characterRegion: 1,
            reportGuildName: 1,
            reportGuildRealm: 1,
            report: 1,
          },
        },
      ]),
    ]);

    if (!appearanceRows.length) return null;

    const firstAppearance = appearanceRows[0];
    const guildName = appearanceRows[0]?.reportGuildName ?? "";
    const guildRealm = appearanceRows[0]?.reportGuildRealm ?? "";

    return {
      character: {
        wclCanonicalCharacterId: firstAppearance.wclCanonicalCharacterId ?? null,
        name: firstAppearance.characterName,
        realm: firstAppearance.characterRealm,
        region: firstAppearance.characterRegion,
      },
      raid: raid ? { id: raid.id, name: raid.name } : null,
      guild: {
        id: guildId,
        name: guildName,
        realm: guildRealm,
      },
      reports: appearanceRows.map((row) => {
        const report = row.report;
        const encounterFights = Object.values(report.encounterFights ?? {}) as Array<{ kills?: number; wipes?: number }>;
        const kills = encounterFights.reduce((total, encounter) => total + (Number(encounter.kills) || 0), 0);
        const wipes = encounterFights.reduce((total, encounter) => total + (Number(encounter.wipes) || 0), 0);
        const durationSeconds = report.endTime && report.startTime ? Math.max(0, Math.round((report.endTime - report.startTime) / 1000)) : undefined;

        return {
          code: report.code,
          url: `https://www.warcraftlogs.com/reports/${report.code}`,
          startTime: report.startTime,
          endTime: report.endTime,
          isOngoing: report.isOngoing,
          durationSeconds,
          fightCount: report.fightCount,
          kills,
          wipes,
        };
      }),
    };
  }

  // Check and update character rankings (nightly job)
  async checkAndRefreshCharacterRankings(): Promise<void> {
    logger.info("Starting character ranking check and update...");

    const CURRENT_TIER_ID = CURRENT_RAID_IDS[0];
    const MYTHIC_DIFFICULTY = 5;
    const BATCH_SIZE = 200;
    const MAX_WCL_REQUESTS_PER_RUN = 20000;
    // Pause when 90% of WCL hourly budget is consumed, leaving 10% for live/other operations
    const RATE_LIMIT_PAUSE_PERCENT = 90;

    try {
      const raid = await Raid.findOne({ id: CURRENT_TIER_ID }).select("partitions").lean();
      const partition = (raid?.partitions || []).reduce((max: number, entry: any) => (typeof entry?.id === "number" && entry.id > max ? entry.id : max), -1);
      logger.info(`[CharacterRankings] Using partition ${partition} for zone ${CURRENT_TIER_ID}`);

      // Find eligible characters
      const cutoffDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const eligibleFilter: any = {
        // Eligible if lastMythicSeenAt within 14 days, rankingsAvailable not false and cooldown passed
        lastMythicSeenAt: { $gte: cutoffDate },
        rankingsAvailable: { $ne: false },
        nextEligibleRefreshAt: { $lte: new Date() },
      };

      // Count total eligible characters for progress tracking
      const totalEligibleCount = await Character.countDocuments(eligibleFilter);
      logger.info(`[CharacterRankings] Found ${totalEligibleCount} eligible characters to process`);

      let processedCount = 0;
      let batchIndex = 0;
      const processedCharacterIds = new Set<string>();
      let charactersProcessedThisRun = 0;

      while (processedCount < MAX_WCL_REQUESTS_PER_RUN) {
        const remaining = MAX_WCL_REQUESTS_PER_RUN - processedCount;
        const batchSize = Math.min(BATCH_SIZE, remaining);

        // Exclude already-processed characters so the query returns fresh ones
        const batchFilter =
          processedCharacterIds.size > 0 ? { ...eligibleFilter, _id: { $nin: Array.from(processedCharacterIds).map((id) => new mongoose.Types.ObjectId(id)) } } : eligibleFilter;

        const eligibleChars = await Character.aggregate([
          { $match: batchFilter },
          {
            $sort: {
              lastMythicSeenAt: -1,
              updatedAt: 1,
            },
          },
          { $limit: batchSize },
        ]);

        if (eligibleChars.length === 0) {
          logger.info(`[CharacterRankings] No more characters found in batch, stopping`);
          break;
        }

        batchIndex += 1;
        logger.info(
          `[CharacterRankings] Processing batch ${batchIndex}: ${eligibleChars.length} characters fetched (processed ${processedCount}/${MAX_WCL_REQUESTS_PER_RUN} requests, ${charactersProcessedThisRun}/${totalEligibleCount} characters)`,
        );

        for (const char of eligibleChars) {
          // Skip if we've already processed this character in this run
          const charId = String(char._id);
          if (processedCharacterIds.has(charId)) {
            logger.debug(`[CharacterRankings] Skipping already processed character ${char.name} (${char.realm})`);
            continue;
          }

          if (processedCount >= MAX_WCL_REQUESTS_PER_RUN) {
            logger.info(`[CharacterRankings] Reached request limit (${MAX_WCL_REQUESTS_PER_RUN}), stopping`);
            break;
          }

          processedCharacterIds.add(charId);
          charactersProcessedThisRun += 1;
          logger.info(`[CharacterRankings] Processing character ${charactersProcessedThisRun}/${totalEligibleCount}: ${char.name} (${char.realm})`);

          const classSpecMap = ROLE_BY_CLASS_AND_SPEC[char.classID] ?? {};
          const specSlugs = Object.keys(classSpecMap);
          if (specSlugs.length === 0) {
            logger.warn(`[CharacterRankings] No spec mappings found for classID ${char.classID} (${char.name}, ${char.realm})`);
            await Character.findByIdAndUpdate(char._id, {
              nextEligibleRefreshAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
            });
            continue;
          }

          // Check rate limit before WCL API call — wait for reset if near threshold
          if (rateLimitService.getPercentUsed() >= RATE_LIMIT_PAUSE_PERCENT) {
            const resetMs = rateLimitService.getTimeUntilReset();
            logger.info(
              `[CharacterRankings] Rate limit at ${rateLimitService.getPercentUsed().toFixed(1)}%, pausing for ${Math.ceil(resetMs / 1000)}s until reset (processed ${processedCount} so far)`,
            );
            await rateLimitService.waitForReset();
            logger.info(`[CharacterRankings] Rate limit reset, resuming`);
          }

          try {
            // Build a single query with aliased zoneRankings per spec.
            // Each alias fetches rankings for one spec, avoiding N+1 API calls.
            const specAliasFields = specSlugs.map((slug) => {
              const wclName = toWclSpecName(slug);
              const alias = toSpecAlias(slug);
              return `${alias}: zoneRankings(zoneID: $zoneID, difficulty: ${MYTHIC_DIFFICULTY}, metric: dps, compare: Rankings, timeframe: Historical, partition: ${partition}, specName: "${wclName}")`;
            });

            const query = `
              query($serverSlug: String!, $serverRegion: String!, $characterName: String!, $zoneID: Int!) {
                rateLimitData {
                  limitPerHour
                  pointsSpentThisHour
                  pointsResetIn
                }
                characterData {
                  character(
                    name: $characterName,
                    serverSlug: $serverSlug,
                    serverRegion: $serverRegion
                  ) {
                    id
                    canonicalID
                    name
                    classID
                    hidden
                    ${specAliasFields.join("\n                    ")}
                  }
                }
              }
            `;

            const variables = {
              characterName: char.name,
              serverSlug: char.realm.toLowerCase().replace(/\s+/g, "-"),
              serverRegion: char.region.toLowerCase(),
              zoneID: CURRENT_TIER_ID,
            };

            processedCount += 1;

            const result = await wclService.query<IWarcraftLogsResponse>(query, variables);

            const character = result.characterData?.character;
            if (!character || character.hidden) {
              await Character.findByIdAndUpdate(char._id, {
                wclProfileHidden: character?.hidden || false,
                rankingsAvailable: false,
                nextEligibleRefreshAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              });
              await Ranking.deleteMany({ characterId: char._id });
              logger.info(`[CharacterRankings] No rankings available for ${char.name} (${char.realm}) — hidden or missing`);
              await new Promise((resolve) => setTimeout(resolve, 100));
              continue;
            }

            let hasAnySpecRankings = false;

            // Process each spec's aliased zoneRankings from the single response
            for (const specSlug of specSlugs) {
              const alias = toSpecAlias(specSlug);
              const zoneRankings = (character as Record<string, unknown>)[alias] as IWarcraftLogsZoneRankings | null;

              if (!zoneRankings || (zoneRankings as any).error) {
                await Ranking.deleteMany({
                  characterId: char._id,
                  zoneId: CURRENT_TIER_ID,
                  difficulty: MYTHIC_DIFFICULTY,
                  partition,
                  specName: specSlug,
                  metric: "dps",
                });
                logger.debug(`[CharacterRankings] No rankings for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                continue;
              }

              // Data is already filtered to this spec by WCL — use directly
              const allStarsEntries = zoneRankings.allStars ?? [];
              const rankingsEntries = zoneRankings.rankings ?? [];

              if (allStarsEntries.length === 0 && rankingsEntries.length === 0) {
                await Ranking.deleteMany({
                  characterId: char._id,
                  zoneId: CURRENT_TIER_ID,
                  difficulty: MYTHIC_DIFFICULTY,
                  partition: zoneRankings.partition,
                  specName: specSlug,
                  metric: "dps",
                });
                logger.debug(`[CharacterRankings] No rankings for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                continue;
              }

              hasAnySpecRankings = true;

              // Check if rankings have changed by comparing with stored Ranking docs.
              // Compare both allStars totals AND per-boss bestAmount/rankPercent/totalKills
              // so that bosses excluded from allStars scoring are still detected as changed.
              const existingRankings = await Ranking.find({
                characterId: char._id,
                zoneId: CURRENT_TIER_ID,
                difficulty: MYTHIC_DIFFICULTY,
                partition: zoneRankings.partition,
                specName: specSlug,
                metric: "dps",
              }).lean();

              const freshPoints = allStarsEntries.reduce((sum, a) => sum + (a.points ?? 0), 0);
              const freshPossiblePoints = allStarsEntries.reduce((sum, a) => sum + (a.possiblePoints ?? 0), 0);
              const storedPoints = existingRankings.reduce((sum, r: any) => sum + (r.allStars?.points ?? 0), 0);
              const storedPossiblePoints = existingRankings.reduce((sum, r: any) => sum + (r.allStars?.possiblePoints ?? 0), 0);

              const allStarsChanged = freshPoints !== storedPoints || freshPossiblePoints !== storedPossiblePoints;

              // Build a fingerprint of per-boss data so non-allStars bosses are also detected
              const freshBossFingerprint = rankingsEntries
                .map((r) => `${r.encounter.id}:${r.bestAmount ?? 0}:${r.rankPercent ?? 0}:${r.totalKills ?? 0}`)
                .sort()
                .join("|");
              const storedBossFingerprint = existingRankings
                .map((r: any) => `${r.encounter?.id}:${r.bestAmount ?? 0}:${r.rankPercent ?? 0}:${r.totalKills ?? 0}`)
                .sort()
                .join("|");

              const hasChanged = existingRankings.length === 0 || allStarsChanged || freshBossFingerprint !== storedBossFingerprint;

              if (!hasChanged) {
                logger.debug(`[CharacterRankings] No changes for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                continue;
              }

              // Upsert rankings for this spec
              for (const r of rankingsEntries) {
                const rankingSpecSlug = r.spec ? slugifySpecName(r.spec) : specSlug;
                const role = resolveRole(char.classID, rankingSpecSlug);
                const normalizedBestSpecName = r.bestSpec ? slugifySpecName(r.bestSpec) : rankingSpecSlug;
                const rankingPartition = r.allStars?.partition ?? zoneRankings.partition ?? partition;

                await Ranking.findOneAndUpdate(
                  {
                    characterId: char._id,
                    zoneId: CURRENT_TIER_ID,
                    difficulty: MYTHIC_DIFFICULTY,
                    partition: rankingPartition,
                    "encounter.id": r.encounter.id,
                    specName: specSlug,
                    metric: "dps",
                  },
                  {
                    characterId: char._id,
                    wclCanonicalCharacterId: character.canonicalID,

                    name: char.name,
                    realm: char.realm,
                    region: char.region,
                    classID: char.classID,

                    zoneId: CURRENT_TIER_ID,
                    difficulty: MYTHIC_DIFFICULTY,
                    partition: rankingPartition,
                    metric: "dps",

                    encounter: {
                      id: r.encounter.id,
                      name: r.encounter.name,
                    },

                    specName: rankingSpecSlug,
                    role,

                    bestSpecName: normalizedBestSpecName,

                    rankPercent: r.rankPercent ?? 0,
                    medianPercent: r.medianPercent ?? 0,
                    lockedIn: r.lockedIn,
                    totalKills: r.totalKills,
                    bestAmount: r.bestAmount ?? 0,

                    allStars: r.allStars
                      ? {
                          points: typeof r.allStars.points === "number" ? r.allStars.points : 0,
                          possiblePoints: typeof r.allStars.possiblePoints === "number" ? r.allStars.possiblePoints : 0,
                        }
                      : { points: 0, possiblePoints: 0 },

                    ilvl: r.bestRank?.ilvl,
                  },
                  { upsert: true, new: true },
                );
              }

              logger.info(`[CharacterRankings] Updated rankings for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
            }

            // ── HPS rankings for healer specs ─────────────────────────
            const healerSpecSlugs = specSlugs.filter((slug) => classSpecMap[slug] === "healer");

            if (healerSpecSlugs.length > 0) {
              if (rateLimitService.getPercentUsed() >= RATE_LIMIT_PAUSE_PERCENT) {
                const resetMs = rateLimitService.getTimeUntilReset();
                logger.info(`[CharacterRankings] Rate limit at ${rateLimitService.getPercentUsed().toFixed(1)}%, pausing for ${Math.ceil(resetMs / 1000)}s before HPS query`);
                await rateLimitService.waitForReset();
                logger.info(`[CharacterRankings] Rate limit reset, resuming`);
              }

              const hpsSpecAliasFields = healerSpecSlugs.map((slug) => {
                const wclName = toWclSpecName(slug);
                const alias = toSpecAlias(slug);
                return `${alias}: zoneRankings(zoneID: $zoneID, difficulty: ${MYTHIC_DIFFICULTY}, metric: hps, compare: Rankings, timeframe: Historical, partition: ${partition}, specName: "${wclName}")`;
              });

              const hpsQuery = `
                query($serverSlug: String!, $serverRegion: String!, $characterName: String!, $zoneID: Int!) {
                  rateLimitData {
                    limitPerHour
                    pointsSpentThisHour
                    pointsResetIn
                  }
                  characterData {
                    character(
                      name: $characterName,
                      serverSlug: $serverSlug,
                      serverRegion: $serverRegion
                    ) {
                      id
                      canonicalID
                      name
                      classID
                      hidden
                      ${hpsSpecAliasFields.join("\n                      ")}
                    }
                  }
                }
              `;

              processedCount += 1;

              const hpsResult = await wclService.query<IWarcraftLogsResponse>(hpsQuery, variables);
              const hpsCharacter = hpsResult.characterData?.character;

              if (hpsCharacter && !hpsCharacter.hidden) {
                for (const specSlug of healerSpecSlugs) {
                  const alias = toSpecAlias(specSlug);
                  const hpsZoneRankings = (hpsCharacter as Record<string, unknown>)[alias] as IWarcraftLogsZoneRankings | null;

                  if (!hpsZoneRankings || (hpsZoneRankings as any).error) {
                    await Ranking.deleteMany({
                      characterId: char._id,
                      zoneId: CURRENT_TIER_ID,
                      difficulty: MYTHIC_DIFFICULTY,
                      partition,
                      specName: specSlug,
                      metric: "hps",
                    });
                    logger.debug(`[CharacterRankings] No HPS rankings for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                    continue;
                  }

                  const hpsAllStarsEntries = hpsZoneRankings.allStars ?? [];
                  const hpsRankingsEntries = hpsZoneRankings.rankings ?? [];

                  if (hpsAllStarsEntries.length === 0 && hpsRankingsEntries.length === 0) {
                    await Ranking.deleteMany({
                      characterId: char._id,
                      zoneId: CURRENT_TIER_ID,
                      difficulty: MYTHIC_DIFFICULTY,
                      partition: hpsZoneRankings.partition,
                      specName: specSlug,
                      metric: "hps",
                    });
                    logger.debug(`[CharacterRankings] No HPS rankings for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                    continue;
                  }

                  const existingHpsRankings = await Ranking.find({
                    characterId: char._id,
                    zoneId: CURRENT_TIER_ID,
                    difficulty: MYTHIC_DIFFICULTY,
                    partition: hpsZoneRankings.partition,
                    specName: specSlug,
                    metric: "hps",
                  }).lean();

                  const freshHpsPoints = hpsAllStarsEntries.reduce((sum, a) => sum + (a.points ?? 0), 0);
                  const freshHpsPossiblePoints = hpsAllStarsEntries.reduce((sum, a) => sum + (a.possiblePoints ?? 0), 0);
                  const storedHpsPoints = existingHpsRankings.reduce((sum, r: any) => sum + (r.allStars?.points ?? 0), 0);
                  const storedHpsPossiblePoints = existingHpsRankings.reduce((sum, r: any) => sum + (r.allStars?.possiblePoints ?? 0), 0);

                  const hpsAllStarsChanged = freshHpsPoints !== storedHpsPoints || freshHpsPossiblePoints !== storedHpsPossiblePoints;

                  const freshHpsFingerprint = hpsRankingsEntries
                    .map((r) => `${r.encounter.id}:${r.bestAmount ?? 0}:${r.rankPercent ?? 0}:${r.totalKills ?? 0}`)
                    .sort()
                    .join("|");
                  const storedHpsFingerprint = existingHpsRankings
                    .map((r: any) => `${r.encounter?.id}:${r.bestAmount ?? 0}:${r.rankPercent ?? 0}:${r.totalKills ?? 0}`)
                    .sort()
                    .join("|");

                  const hpsHasChanged = existingHpsRankings.length === 0 || hpsAllStarsChanged || freshHpsFingerprint !== storedHpsFingerprint;

                  if (!hpsHasChanged) {
                    logger.debug(`[CharacterRankings] No HPS changes for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                    continue;
                  }

                  for (const r of hpsRankingsEntries) {
                    const rankingSpecSlug = r.spec ? slugifySpecName(r.spec) : specSlug;
                    const role = resolveRole(char.classID, rankingSpecSlug);
                    const normalizedBestSpecName = r.bestSpec ? slugifySpecName(r.bestSpec) : rankingSpecSlug;
                    const rankingPartition = r.allStars?.partition ?? hpsZoneRankings.partition ?? partition;

                    await Ranking.findOneAndUpdate(
                      {
                        characterId: char._id,
                        zoneId: CURRENT_TIER_ID,
                        difficulty: MYTHIC_DIFFICULTY,
                        partition: rankingPartition,
                        "encounter.id": r.encounter.id,
                        specName: specSlug,
                        metric: "hps",
                      },
                      {
                        characterId: char._id,
                        wclCanonicalCharacterId: hpsCharacter.canonicalID,

                        name: char.name,
                        realm: char.realm,
                        region: char.region,
                        classID: char.classID,

                        zoneId: CURRENT_TIER_ID,
                        difficulty: MYTHIC_DIFFICULTY,
                        partition: rankingPartition,
                        metric: "hps",

                        encounter: {
                          id: r.encounter.id,
                          name: r.encounter.name,
                        },

                        specName: rankingSpecSlug,
                        role,

                        bestSpecName: normalizedBestSpecName,

                        rankPercent: r.rankPercent ?? 0,
                        medianPercent: r.medianPercent ?? 0,
                        lockedIn: r.lockedIn,
                        totalKills: r.totalKills,
                        bestAmount: r.bestAmount ?? 0,

                        allStars: r.allStars
                          ? {
                              points: typeof r.allStars.points === "number" ? r.allStars.points : 0,
                              possiblePoints: typeof r.allStars.possiblePoints === "number" ? r.allStars.possiblePoints : 0,
                            }
                          : { points: 0, possiblePoints: 0 },

                        ilvl: r.bestRank?.ilvl,
                      },
                      { upsert: true, new: true },
                    );
                  }

                  hasAnySpecRankings = true;
                  logger.info(`[CharacterRankings] Updated HPS rankings for ${char.name} (${char.realm}) [spec: ${specSlug}]`);
                }
              }
            }

            if (hasAnySpecRankings) {
              await Character.findByIdAndUpdate(char._id, {
                rankingsAvailable: true,
                nextEligibleRefreshAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
              });
            } else {
              await Character.findByIdAndUpdate(char._id, {
                rankingsAvailable: false,
                nextEligibleRefreshAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              });
            }

            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (error) {
            logger.error(`[CharacterRankings] Error checking rankings for ${char.name} (${char.realm}):`, error);
            // Set a short cooldown so errored characters don't block subsequent batches
            await Character.findByIdAndUpdate(char._id, {
              nextEligibleRefreshAt: new Date(Date.now() + 1 * 60 * 60 * 1000),
            }).catch(() => {});
          }
        }

        // Break if we've processed all eligible characters
        if (charactersProcessedThisRun >= totalEligibleCount) {
          logger.info(`[CharacterRankings] Processed all ${totalEligibleCount} eligible characters, stopping`);
          break;
        }
      }

      logger.info(`[CharacterRankings] Character ranking check completed: processed ${processedCount} API requests for ${charactersProcessedThisRun} characters`);

      logger.info("[CharacterRankings] Character ranking check and update completed");
    } catch (error) {
      logger.error("[CharacterRankings] Error in character ranking check:", error);
    }
  }

  /**
   * Rebuild the materialized CharacterLeaderboard collection from Ranking data.
   * Creates one document per character per leaderboard view.
   * Should be called after nightly rankings refresh completes.
   */
  async buildCharacterLeaderboards(): Promise<void> {
    const CURRENT_TIER_ID = CURRENT_RAID_IDS[0];
    const MYTHIC_DIFFICULTY = 5;
    const startTime = Date.now();

    logger.info("[Leaderboard] Starting leaderboard build...");

    try {
      // Discover distinct encounters, partitions, and metrics in the current tier
      const encounterIds: number[] = await Ranking.distinct("encounter.id", { zoneId: CURRENT_TIER_ID, difficulty: MYTHIC_DIFFICULTY });
      const partitions: number[] = await Ranking.distinct("partition", { zoneId: CURRENT_TIER_ID, difficulty: MYTHIC_DIFFICULTY });

      logger.info(`[Leaderboard] Found ${encounterIds.length} encounters, ${partitions.length} partitions`);

      // Build global guild map once (characterId → guild info)
      const allCharacterIds = await Ranking.distinct("characterId", { zoneId: CURRENT_TIER_ID, difficulty: MYTHIC_DIFFICULTY });
      const characters = await Character.find({ _id: { $in: allCharacterIds } })
        .select("_id guildName guildRealm")
        .lean();
      const guildMap = new Map<string, { name: string; realm: string } | null>();
      for (const c of characters) {
        const gn = c.guildName ?? null;
        const gr = c.guildRealm ?? null;
        guildMap.set(String(c._id), gn && gr ? { name: gn, realm: gr } : null);
      }

      const entries: any[] = [];

      // ── Boss leaderboards (per encounter × per partition × per metric) ─
      for (const encId of encounterIds) {
        for (const part of partitions) {
          // Group by (characterId, metric) to keep only the best spec per character per metric.
          // WCL canonical IDs can be shared across different classes, so canonical ID alone is not a safe identity key.
          const rows = await Ranking.aggregate([
            {
              $match: {
                zoneId: CURRENT_TIER_ID,
                difficulty: MYTHIC_DIFFICULTY,
                partition: part,
                "encounter.id": encId,
                bestAmount: { $ne: 0 },
                metric: { $ne: null },
              },
            },
            { $sort: { bestAmount: -1, rankPercent: -1, totalKills: -1 } },
            {
              $group: {
                _id: { characterId: "$characterId", metric: "$metric" },
                characterId: { $first: "$characterId" },
                wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
                name: { $first: "$name" },
                realm: { $first: "$realm" },
                region: { $first: "$region" },
                classID: { $first: "$classID" },
                specName: { $first: "$specName" },
                bestSpecName: { $first: "$bestSpecName" },
                role: { $first: "$role" },
                metric: { $first: "$metric" },
                ilvl: { $first: "$ilvl" },
                bestAmount: { $first: "$bestAmount" },
                encounterName: { $first: "$encounter.name" },
                rankPercent: { $first: "$rankPercent" },
                medianPercent: { $first: "$medianPercent" },
                lockedIn: { $first: "$lockedIn" },
                totalKills: { $first: "$totalKills" },
                updatedAt: { $first: "$updatedAt" },
              },
            },
          ]);

          for (const r of rows) {
            const guild = guildMap.get(String(r.characterId));
            entries.push({
              zoneId: CURRENT_TIER_ID,
              difficulty: MYTHIC_DIFFICULTY,
              type: "boss",
              encounterId: encId,
              partition: part,
              metric: r.metric ?? "dps",
              characterId: r.characterId,
              wclCanonicalCharacterId: r.wclCanonicalCharacterId,
              name: r.name,
              realm: r.realm,
              region: r.region,
              classID: r.classID,
              specName: r.specName,
              bestSpecName: r.bestSpecName,
              role: r.role,
              ilvl: r.ilvl ?? 0,
              score: r.bestAmount,
              encounterName: r.encounterName,
              rankPercent: r.rankPercent,
              medianPercent: r.medianPercent,
              lockedIn: r.lockedIn,
              totalKills: r.totalKills,
              bestAmount: r.bestAmount,
              allStarsPoints: 0,
              allStarsPossiblePoints: 0,
              bossScores: [],
              guildName: guild?.name ?? null,
              guildRealm: guild?.realm ?? null,
              sourcePartition: part,
              updatedAt: r.updatedAt ?? new Date(),
            });
          }
        }

        // Boss + all partitions (best per character per metric across partitions)
        const bestPerChar = await Ranking.aggregate([
          { $match: { zoneId: CURRENT_TIER_ID, difficulty: MYTHIC_DIFFICULTY, "encounter.id": encId, metric: { $ne: null } } },
          { $sort: { bestAmount: -1, rankPercent: -1, totalKills: -1, partition: -1 } },
          {
            $group: {
              _id: { characterId: "$characterId", metric: "$metric" },
              characterId: { $first: "$characterId" },
              wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
              name: { $first: "$name" },
              realm: { $first: "$realm" },
              region: { $first: "$region" },
              classID: { $first: "$classID" },
              specName: { $first: "$specName" },
              bestSpecName: { $first: "$bestSpecName" },
              role: { $first: "$role" },
              metric: { $first: "$metric" },
              ilvl: { $first: "$ilvl" },
              bestAmount: { $first: "$bestAmount" },
              encounterName: { $first: "$encounter.name" },
              rankPercent: { $first: "$rankPercent" },
              medianPercent: { $first: "$medianPercent" },
              lockedIn: { $first: "$lockedIn" },
              totalKills: { $first: "$totalKills" },
              partition: { $first: "$partition" },
              updatedAt: { $first: "$updatedAt" },
            },
          },
          { $match: { bestAmount: { $ne: 0 } } },
        ]);

        for (const r of bestPerChar) {
          const guild = guildMap.get(String(r.characterId));
          entries.push({
            zoneId: CURRENT_TIER_ID,
            difficulty: MYTHIC_DIFFICULTY,
            type: "boss",
            encounterId: encId,
            partition: null,
            metric: r.metric ?? "dps",
            characterId: r.characterId,
            wclCanonicalCharacterId: r.wclCanonicalCharacterId,
            name: r.name,
            realm: r.realm,
            region: r.region,
            classID: r.classID,
            specName: r.specName,
            bestSpecName: r.bestSpecName,
            role: r.role,
            ilvl: r.ilvl ?? 0,
            score: r.bestAmount,
            encounterName: r.encounterName,
            rankPercent: r.rankPercent,
            medianPercent: r.medianPercent,
            lockedIn: r.lockedIn,
            totalKills: r.totalKills,
            bestAmount: r.bestAmount,
            allStarsPoints: 0,
            allStarsPossiblePoints: 0,
            bossScores: [],
            guildName: guild?.name ?? null,
            guildRealm: guild?.realm ?? null,
            sourcePartition: r.partition,
            updatedAt: r.updatedAt ?? new Date(),
          });
        }
      }

      // ── AllStars leaderboards (per partition × per metric) ────────────
      for (const part of partitions) {
        const allStarsAgg = await Ranking.aggregate([
          {
            $match: {
              zoneId: CURRENT_TIER_ID,
              difficulty: MYTHIC_DIFFICULTY,
              partition: part,
              metric: { $ne: null },
              $or: [{ "allStars.points": { $gt: 0 } }, { bestAmount: { $gt: 0 } }, { rankPercent: { $gt: 0 } }, { totalKills: { $gt: 0 } }],
            },
          },
          { $sort: { "allStars.points": -1, rankPercent: -1, bestAmount: -1, totalKills: -1 } },
          {
            $group: {
              _id: { characterId: "$characterId", encounterId: "$encounter.id", metric: "$metric" },
              characterId: { $first: "$characterId" },
              wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
              name: { $first: "$name" },
              realm: { $first: "$realm" },
              region: { $first: "$region" },
              classID: { $first: "$classID" },
              specName: { $first: "$specName" },
              role: { $first: "$role" },
              metric: { $first: "$metric" },
              points: { $first: "$allStars.points" },
              possiblePoints: { $first: "$allStars.possiblePoints" },
              ilvl: { $first: "$ilvl" },
              rankPercent: { $first: "$rankPercent" },
              medianPercent: { $first: "$medianPercent" },
              updatedAt: { $first: "$updatedAt" },
            },
          },
          {
            $group: {
              _id: { characterId: "$_id.characterId", metric: "$_id.metric" },
              characterId: { $first: "$characterId" },
              wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
              name: { $first: "$name" },
              realm: { $first: "$realm" },
              region: { $first: "$region" },
              classID: { $first: "$classID" },
              specName: { $first: "$specName" },
              role: { $first: "$role" },
              metric: { $first: "$metric" },
              points: { $sum: "$points" },
              possiblePoints: { $sum: "$possiblePoints" },
              ilvl: { $first: "$ilvl" },
              rankPercent: { $max: "$rankPercent" },
              medianPercent: { $max: "$medianPercent" },
              updatedAt: { $max: "$updatedAt" },
              bossScores: {
                $push: {
                  encounterId: "$_id.encounterId",
                  points: "$points",
                  rankPercent: "$rankPercent",
                  specName: "$specName",
                },
              },
            },
          },
          { $match: { points: { $gt: 0 } } },
        ]);

        for (const r of allStarsAgg) {
          const guild = guildMap.get(String(r.characterId));
          entries.push({
            zoneId: CURRENT_TIER_ID,
            difficulty: MYTHIC_DIFFICULTY,
            type: "allstars",
            encounterId: null,
            partition: part,
            metric: r.metric ?? "dps",
            characterId: r.characterId,
            wclCanonicalCharacterId: r.wclCanonicalCharacterId,
            name: r.name,
            realm: r.realm,
            region: r.region,
            classID: r.classID,
            specName: r.specName,
            bestSpecName: "",
            role: r.role,
            ilvl: r.ilvl ?? 0,
            score: r.points,
            encounterName: "",
            rankPercent: r.rankPercent,
            medianPercent: r.medianPercent,
            lockedIn: false,
            totalKills: 0,
            bestAmount: 0,
            allStarsPoints: r.points,
            allStarsPossiblePoints: r.possiblePoints,
            bossScores: r.bossScores ?? [],
            guildName: guild?.name ?? null,
            guildRealm: guild?.realm ?? null,
            sourcePartition: part,
            updatedAt: r.updatedAt ?? new Date(),
          });
        }
      }

      // ── AllStars + all partitions (best per boss per metric across partitions) ─
      const allStarsAllPartitions = await Ranking.aggregate([
        {
          $match: {
            zoneId: CURRENT_TIER_ID,
            difficulty: MYTHIC_DIFFICULTY,
            metric: { $ne: null },
            $or: [{ "allStars.points": { $gt: 0 } }, { bestAmount: { $gt: 0 } }, { rankPercent: { $gt: 0 } }, { totalKills: { $gt: 0 } }],
          },
        },
        { $sort: { "allStars.points": -1, rankPercent: -1, bestAmount: -1, totalKills: -1, partition: -1 } },
        {
          $group: {
            _id: { characterId: "$characterId", encounterId: "$encounter.id", metric: "$metric" },
            characterId: { $first: "$characterId" },
            wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
            name: { $first: "$name" },
            realm: { $first: "$realm" },
            region: { $first: "$region" },
            classID: { $first: "$classID" },
            specName: { $first: "$specName" },
            role: { $first: "$role" },
            metric: { $first: "$metric" },
            points: { $first: "$allStars.points" },
            possiblePoints: { $first: "$allStars.possiblePoints" },
            ilvl: { $first: "$ilvl" },
            rankPercent: { $first: "$rankPercent" },
            medianPercent: { $first: "$medianPercent" },
            updatedAt: { $first: "$updatedAt" },
          },
        },
        {
          $group: {
            _id: { characterId: "$_id.characterId", metric: "$_id.metric" },
            characterId: { $first: "$characterId" },
            wclCanonicalCharacterId: { $first: "$wclCanonicalCharacterId" },
            name: { $first: "$name" },
            realm: { $first: "$realm" },
            region: { $first: "$region" },
            classID: { $first: "$classID" },
            specName: { $first: "$specName" },
            role: { $first: "$role" },
            metric: { $first: "$metric" },
            points: { $sum: "$points" },
            possiblePoints: { $sum: "$possiblePoints" },
            ilvl: { $first: "$ilvl" },
            rankPercent: { $max: "$rankPercent" },
            medianPercent: { $max: "$medianPercent" },
            updatedAt: { $max: "$updatedAt" },
            bossScores: {
              $push: {
                encounterId: "$_id.encounterId",
                points: "$points",
                rankPercent: "$rankPercent",
                specName: "$specName",
              },
            },
          },
        },
        { $match: { points: { $gt: 0 } } },
      ]);

      for (const r of allStarsAllPartitions) {
        const guild = guildMap.get(String(r.characterId));
        entries.push({
          zoneId: CURRENT_TIER_ID,
          difficulty: MYTHIC_DIFFICULTY,
          type: "allstars",
          encounterId: null,
          partition: null,
          metric: r.metric ?? "dps",
          characterId: r.characterId,
          wclCanonicalCharacterId: r.wclCanonicalCharacterId,
          name: r.name,
          realm: r.realm,
          region: r.region,
          classID: r.classID,
          specName: r.specName,
          bestSpecName: "",
          role: r.role,
          ilvl: r.ilvl ?? 0,
          score: r.points,
          encounterName: "",
          rankPercent: r.rankPercent,
          medianPercent: r.medianPercent,
          lockedIn: false,
          totalKills: 0,
          bestAmount: 0,
          allStarsPoints: r.points,
          allStarsPossiblePoints: r.possiblePoints,
          bossScores: r.bossScores ?? [],
          guildName: guild?.name ?? null,
          guildRealm: guild?.realm ?? null,
          sourcePartition: 0,
          updatedAt: r.updatedAt ?? new Date(),
        });
      }

      // ── Deduplicate entries by unique key ──────────────────────────
      const deduped = new Map<string, (typeof entries)[0]>();
      for (const e of entries) {
        const key = `${e.zoneId}|${e.difficulty}|${e.type}|${e.encounterId}|${e.partition}|${e.metric}|${e.characterId}`;
        const existing = deduped.get(key);
        if (!existing || e.score > existing.score) {
          deduped.set(key, e);
        }
      }
      const dedupedEntries = Array.from(deduped.values());

      // ── Atomic swap: drop old data, insert new ─────────────────────
      logger.info(`[Leaderboard] Inserting ${dedupedEntries.length} leaderboard entries (deduped from ${entries.length})...`);

      await CharacterLeaderboard.deleteMany({ zoneId: CURRENT_TIER_ID });
      // Sync after clearing this materialized tier so stale rows cannot block new unique indexes.
      await CharacterLeaderboard.syncIndexes();

      if (dedupedEntries.length > 0) {
        // Insert in batches of 5000 to avoid memory pressure
        const BATCH = 5000;
        for (let i = 0; i < dedupedEntries.length; i += BATCH) {
          await CharacterLeaderboard.insertMany(dedupedEntries.slice(i, i + BATCH), { ordered: false });
        }
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      logger.info(`[Leaderboard] Build completed: ${dedupedEntries.length} entries in ${duration}s`);
    } catch (error) {
      logger.error("[Leaderboard] Build failed:", error);
      throw error;
    }
  }

  /**
   * Query the materialized leaderboard for character rankings.
   *
   * All operations are simple indexed find/count — no aggregation needed at query time.
   * Ranks are either positional (for unfiltered views) or computed via fast countDocuments
   * (for name-filtered views where we need global rank).
   */
  async getCharacterRankings(options: {
    zoneId: number;
    encounterId?: number;
    classId?: number;
    specName?: string;
    role?: "dps" | "healer" | "tank";
    metric?: "dps" | "hps";
    partition?: number;
    limit?: number;
    page?: number;
    characterName?: string;
    guildName?: string;
  }): Promise<CharacterRankingsResponse> {
    const { zoneId, encounterId, classId, specName, role, metric = "dps", partition, limit = 100, page = 1, characterName, guildName } = options;

    const MYTHIC_DIFFICULTY = 5;
    const normalizedSpecName = specName?.trim().toLowerCase();
    const normalizedRole = role?.toLowerCase() as "dps" | "healer" | "tank" | undefined;
    const normalizedCharacterName = characterName?.trim();
    const normalizedGuildName = guildName?.trim();
    const escapeRegex = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const partialNameRegex = normalizedCharacterName ? this.getAccentInsensitiveRegex(normalizedCharacterName) : undefined;
    const partialGuildNameRegex = normalizedGuildName ? new RegExp(escapeRegex(normalizedGuildName), "i") : undefined;

    const safeLimit = Math.min(Math.max(limit, 1), 500);

    // ── Base query identifies the leaderboard view ───────────────────
    const baseQuery: any = {
      zoneId,
      difficulty: MYTHIC_DIFFICULTY,
      type: encounterId !== undefined ? "boss" : "allstars",
      encounterId: encounterId ?? null,
      partition: partition ?? null,
      metric,
    };

    // ── Optional filters ─────────────────────────────────────────────
    if (classId !== undefined) baseQuery.classID = classId;
    if (normalizedRole !== undefined) baseQuery.role = normalizedRole;

    // ── AllStars + spec filter: special in-memory path ───────────────
    // The leaderboard stores one entry per character (best spec per boss in bossScores).
    // Filtering by specName on the top-level field is unreliable because specName is
    // chosen by $first (arbitrary). Instead, find entries where bossScores contains a
    // parse for the requested spec, filter bossScores in memory, and recompute the
    // spec-specific allStars total. Some bosses have parses but zero all-star points.
    if (encounterId === undefined && normalizedSpecName !== undefined) {
      const specQuery = {
        ...baseQuery,
        bossScores: { $elemMatch: { specName: normalizedSpecName, rankPercent: { $gt: 0 } } },
      };

      const allSpecEntries = (await CharacterLeaderboard.find(specQuery).lean()) as any[];

      for (const e of allSpecEntries) {
        e.bossScores = (e.bossScores ?? []).filter((bs: any) => bs.specName === normalizedSpecName && bs.rankPercent > 0);
        e.allStarsPoints = e.bossScores.reduce((sum: number, bs: any) => sum + (bs.points ?? 0), 0);
        e.score = e.allStarsPoints;
      }

      allSpecEntries.sort((a: any, b: any) => b.score - a.score || (a.name ?? "").localeCompare(b.name ?? ""));

      let displayEntries = allSpecEntries;
      if (partialNameRegex) displayEntries = displayEntries.filter((e: any) => partialNameRegex.test(e.name ?? ""));
      if (partialGuildNameRegex) displayEntries = displayEntries.filter((e: any) => partialGuildNameRegex!.test(e.guildName ?? ""));

      const specTotalRanked = allSpecEntries.length;
      const specTotalItems = displayEntries.length;
      const specPage = Math.max(page, 1);
      const specSkip = (specPage - 1) * safeLimit;
      const pageEntries = displayEntries.slice(specSkip, specSkip + safeLimit);

      const rankMap = new Map(allSpecEntries.map((e: any, i: number) => [e, i + 1]));

      const data: CharacterRankingRow[] = pageEntries.map((e: any) => {
        const guild = e.guildName && e.guildRealm ? { name: e.guildName, realm: e.guildRealm } : null;
        const row: CharacterRankingRow = {
          rank: rankMap.get(e) ?? 0,
          character: {
            wclCanonicalCharacterId: e.wclCanonicalCharacterId,
            name: e.name,
            realm: e.realm,
            region: e.region,
            classID: e.classID,
            guild,
          },
          context: {
            zoneId: e.zoneId,
            difficulty: e.difficulty,
            metric: e.metric ?? "dps",
            partition: e.sourcePartition || e.partition,
            encounterId: null,
            specName: normalizedSpecName,
            role: e.role,
            ilvl: e.ilvl,
          },
          score: { type: "allStars", value: e.score },
          stats: {
            allStars: { points: e.allStarsPoints, possiblePoints: e.allStarsPossiblePoints },
            rankPercent: e.rankPercent,
            medianPercent: e.medianPercent,
          },
          updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : undefined,
        };
        if (e.bossScores?.length > 0) (row as any).bossScores = e.bossScores;
        return row;
      });

      return {
        data,
        pagination: {
          totalItems: specTotalItems,
          totalRankedItems: specTotalRanked,
          totalPages: Math.ceil(specTotalItems / safeLimit),
          currentPage: specPage,
          pageSize: safeLimit,
        },
      };
    }

    // Boss leaderboard or allStars without spec filter — use stored specName directly
    if (normalizedSpecName !== undefined) baseQuery.specName = normalizedSpecName;

    // Total ranked items (before any name filter)
    const totalRankedItems = await CharacterLeaderboard.countDocuments(baseQuery);

    let effectiveSkip: number;
    let effectivePage: number;
    let totalItems: number;
    let fetchQuery: any = { ...baseQuery };
    let needsGlobalRanks = false;

    if (partialNameRegex) {
      fetchQuery = { ...baseQuery, name: partialNameRegex };
      totalItems = await CharacterLeaderboard.countDocuments(fetchQuery);
      effectivePage = Math.max(page, 1);
      effectiveSkip = (effectivePage - 1) * safeLimit;
      needsGlobalRanks = true;
    } else {
      totalItems = totalRankedItems;
      effectivePage = Math.max(page, 1);
      effectiveSkip = (effectivePage - 1) * safeLimit;
    }

    // ── Guild name filter (narrows displayed rows, ranks stay global) ─
    if (partialGuildNameRegex) {
      fetchQuery.guildName = partialGuildNameRegex;
      totalItems = await CharacterLeaderboard.countDocuments(fetchQuery);
      needsGlobalRanks = true;
    }

    // ── Fetch the page ───────────────────────────────────────────────
    const entries = await CharacterLeaderboard.find(fetchQuery).sort({ score: -1, name: 1 }).skip(effectiveSkip).limit(safeLimit).lean();

    // ── Compute ranks ────────────────────────────────────────────────
    // When name-filtered, positional ranks are wrong (they'd show position within
    // filtered results). Instead, compute each row's global rank via indexed count.
    let ranks: number[];
    if (needsGlobalRanks && entries.length > 0) {
      ranks = await Promise.all(
        entries.map(async (e) => {
          const count = await CharacterLeaderboard.countDocuments({
            ...baseQuery,
            score: { $gt: e.score },
          });
          return count + 1;
        }),
      );
    } else {
      ranks = entries.map((_, i) => effectiveSkip + i + 1);
    }

    // ── Map to response format ───────────────────────────────────────
    const isBossType = encounterId !== undefined;

    const data: CharacterRankingRow[] = entries.map((e: any, i: number) => {
      const guild = e.guildName && e.guildRealm ? { name: e.guildName, realm: e.guildRealm } : null;

      const row: CharacterRankingRow = {
        rank: ranks[i],
        character: {
          wclCanonicalCharacterId: e.wclCanonicalCharacterId,
          name: e.name,
          realm: e.realm,
          region: e.region,
          classID: e.classID,
          guild,
        },
        context: {
          zoneId: e.zoneId,
          difficulty: e.difficulty,
          metric: e.metric ?? "dps",
          partition: e.sourcePartition || e.partition,
          encounterId: e.encounterId,
          specName: e.specName,
          bestSpecName: e.bestSpecName || undefined,
          role: e.role,
          ilvl: e.ilvl,
        },
        score: {
          type: isBossType ? "bestAmount" : "allStars",
          value: e.score,
        },
        stats: isBossType
          ? {
              bestAmount: e.bestAmount,
              rankPercent: e.rankPercent,
              medianPercent: e.medianPercent,
              lockedIn: e.lockedIn,
              totalKills: e.totalKills,
            }
          : {
              allStars: {
                points: e.allStarsPoints,
                possiblePoints: e.allStarsPossiblePoints,
              },
              rankPercent: e.rankPercent,
              medianPercent: e.medianPercent,
            },
        updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : undefined,
      };

      if (isBossType) {
        row.encounter = {
          id: e.encounterId,
          name: e.encounterName,
        };
      }

      if (!isBossType && e.bossScores?.length > 0) {
        (row as any).bossScores = e.bossScores;
      }

      return row;
    });

    return {
      data,
      pagination: {
        totalItems,
        totalRankedItems,
        totalPages: Math.ceil(totalItems / safeLimit),
        currentPage: effectivePage,
        pageSize: safeLimit,
      },
    };
  }
}

export default new CharacterService();
