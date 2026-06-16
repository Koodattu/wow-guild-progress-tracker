import mongoose from "mongoose";
import { CURRENT_RAID_IDS } from "../config/guilds";
import Character from "../models/Character";
import CharacterMechanicsLeaderboard, { IMechanicsBossScore } from "../models/CharacterMechanicsLeaderboard";
import CharacterReportAppearance from "../models/CharacterReportAppearance";
import Fight, { IPlayerDeath } from "../models/Fight";
import GuildProcessingQueue from "../models/GuildProcessingQueue";
import Ranking from "../models/Ranking";
import cacheService from "./cache.service";
import logger from "../utils/logger";

const MYTHIC_DIFFICULTY = 5;
const PARSE_WEIGHT = 0.5;
const SURVIVAL_WEIGHT = 0.5;
const REPORT_LOOKUP_BATCH_SIZE = 500;
const REPORT_GROUP_BATCH_SIZE = 200;
const FIGHT_CURSOR_BATCH_SIZE = 1000;

type Metric = "dps" | "hps";
type Role = "dps" | "healer" | "tank";

type BuildResult = {
  zones: Array<{
    zoneId: number;
    entries: number;
    fights: number;
    reports: number;
    appearances: number;
  }>;
  entries: number;
};

type QueryResponse = {
  data: any[];
  pagination: {
    totalItems: number;
    totalRankedItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  };
};

type SurvivalStats = {
  pulls: number;
  deaths: number;
  survivedPulls: number;
  earlyDeaths: number;
  scoreTotal: number;
  deathPercentTotal: number;
};

type AppearanceIdentity = {
  characterId: mongoose.Types.ObjectId;
  wclCanonicalCharacterId: number;
  name: string;
  realm: string;
  region: string;
  classID: number;
  rankingFightIds: number[];
};

type ParseRow = {
  characterId: mongoose.Types.ObjectId;
  wclCanonicalCharacterId: number;
  name: string;
  realm: string;
  region: string;
  classID: number;
  specName: string;
  bestSpecName: string;
  role: Role;
  metric: Metric;
  ilvl: number;
  bestAmount: number;
  encounterId: number;
  encounterName: string;
  rankPercent: number;
  medianPercent: number;
  totalKills: number;
  partition: number;
  updatedAt: Date;
};

type MechanicsFight = {
  reportCode: string;
  fightId: number;
  encounterID: number;
  encounterName: string;
  duration: number;
  deaths?: IPlayerDeath[];
};

class CharacterMechanicsService {
  private isBuilding = false;
  private mechanicsIndexesCreated = false;
  private fightLookupIndexCreated = false;

  async hasUnfinishedDeathEventBackfill(): Promise<boolean> {
    const unfinished = await GuildProcessingQueue.countDocuments({
      jobType: "rescan_deaths",
      status: { $in: ["pending", "in_progress", "paused"] },
    });
    return unfinished > 0;
  }

  async buildCurrentRaidMechanicsLeaderboards(): Promise<BuildResult> {
    return this.buildMechanicsLeaderboards(CURRENT_RAID_IDS);
  }

  async buildMechanicsLeaderboards(zoneIds: number[]): Promise<BuildResult> {
    if (this.isBuilding) {
      throw new Error("Character mechanics leaderboard build is already running");
    }

    this.isBuilding = true;
    const startedAt = Date.now();
    const zoneResults: BuildResult["zones"] = [];
    let totalEntries = 0;

    try {
      logger.info(`[MechanicsLeaderboard] Starting mechanics leaderboard build for raid(s): ${zoneIds.join(", ")}`);

      for (const zoneId of zoneIds) {
        const result = await this.buildZoneMechanicsLeaderboard(zoneId);
        zoneResults.push(result);
        totalEntries += result.entries;
      }

      await cacheService.invalidatePattern(/^character-mechanics:/);
      await cacheService.invalidatePattern(/^characters:profile:/);

      const duration = Math.round((Date.now() - startedAt) / 1000);
      logger.info(`[MechanicsLeaderboard] Build completed: ${totalEntries} entries across ${zoneIds.length} raid(s) in ${duration}s`);

      return { zones: zoneResults, entries: totalEntries };
    } finally {
      this.isBuilding = false;
    }
  }

  private async buildZoneMechanicsLeaderboard(zoneId: number): Promise<BuildResult["zones"][number]> {
    const startedAt = Date.now();
    await this.ensureBuildIndexes();

    const parseRows = (await Ranking.aggregate([
      {
        $match: {
          zoneId,
          difficulty: MYTHIC_DIFFICULTY,
          metric: { $in: ["dps", "hps"] },
          rankPercent: { $ne: null },
          bestAmount: { $gt: 0 },
        },
      },
      { $sort: { rankPercent: -1, bestAmount: -1, totalKills: -1, partition: -1 } },
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
          bestSpecName: { $first: "$bestSpecName" },
          role: { $first: "$role" },
          metric: { $first: "$metric" },
          ilvl: { $first: "$ilvl" },
          bestAmount: { $first: "$bestAmount" },
          encounterId: { $first: "$encounter.id" },
          encounterName: { $first: "$encounter.name" },
          rankPercent: { $first: "$rankPercent" },
          medianPercent: { $first: "$medianPercent" },
          totalKills: { $first: "$totalKills" },
          partition: { $first: "$partition" },
          updatedAt: { $first: "$updatedAt" },
        },
      },
    ]).allowDiskUse(true)) as ParseRow[];

    if (parseRows.length === 0) {
      await CharacterMechanicsLeaderboard.deleteMany({ zoneId });
      logger.info(`[MechanicsLeaderboard] Raid ${zoneId}: no parse rows found, cleared existing mechanics entries`);
      return { zoneId, entries: 0, fights: 0, reports: 0, appearances: 0 };
    }

    const encounterIds = Array.from(new Set(parseRows.map((row) => row.encounterId).filter((id): id is number => typeof id === "number")));
    const survivalBuild = await this.buildSurvivalStatsFromFetchedFights(zoneId, encounterIds);
    const survivalByCharacterEncounter = survivalBuild.stats;

    const characterIds = Array.from(new Set(parseRows.map((row) => String(row.characterId))));
    const characters = await Character.find({ _id: { $in: characterIds } })
      .select("_id guildName guildRealm")
      .lean();
    const guildByCharacter = new Map<string, { name: string; realm: string } | null>();
    for (const character of characters) {
      const guildName = character.guildName ?? null;
      const guildRealm = character.guildRealm ?? null;
      guildByCharacter.set(String(character._id), guildName && guildRealm ? { name: guildName, realm: guildRealm } : null);
    }

    const bossEntries = parseRows.flatMap((row) => {
      const survival = survivalByCharacterEncounter.get(this.getCharacterEncounterKey(row.characterId, row.encounterId));
      const survivalSummary = this.summarizeSurvivalStats(survival);
      if (survivalSummary.survivalScore === null) return [];

      const parseScore = this.roundScore(row.rankPercent ?? 0);
      const score = this.combineScores(parseScore, survivalSummary.survivalScore);
      const guild = guildByCharacter.get(String(row.characterId)) ?? null;

      return [
        {
          zoneId,
          difficulty: MYTHIC_DIFFICULTY,
          type: "boss" as const,
          encounterId: row.encounterId,
          metric: row.metric ?? "dps",
          characterId: row.characterId,
          wclCanonicalCharacterId: row.wclCanonicalCharacterId,
          name: row.name,
          realm: row.realm,
          region: row.region,
          classID: row.classID,
          specName: row.specName,
          bestSpecName: row.bestSpecName ?? "",
          role: row.role,
          ilvl: row.ilvl ?? 0,
          score,
          parseScore,
          survivalScore: survivalSummary.survivalScore,
          encounterName: row.encounterName,
          rankPercent: row.rankPercent ?? 0,
          medianPercent: row.medianPercent ?? 0,
          totalKills: row.totalKills ?? 0,
          bestAmount: row.bestAmount ?? 0,
          pulls: survivalSummary.pulls,
          deaths: survivalSummary.deaths,
          survivedPulls: survivalSummary.survivedPulls,
          earlyDeaths: survivalSummary.earlyDeaths,
          averageDeathPercent: survivalSummary.averageDeathPercent,
          deathDataAvailable: true,
          bossScores: [],
          guildName: guild?.name ?? null,
          guildRealm: guild?.realm ?? null,
          sourcePartition: row.partition ?? 0,
          updatedAt: row.updatedAt ?? new Date(),
        },
      ];
    });

    const overallEntries = this.buildOverallEntries(bossEntries);
    const entries = [...bossEntries, ...overallEntries];

    await CharacterMechanicsLeaderboard.deleteMany({ zoneId });

    if (entries.length > 0) {
      const BATCH_SIZE = 5000;
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        await CharacterMechanicsLeaderboard.bulkWrite(
          batch.map((entry) => ({
            replaceOne: {
              filter: this.toUniqueFilter(entry),
              replacement: entry,
              upsert: true,
            },
          })),
          { ordered: false },
        );
      }
    }

    const duration = Math.round((Date.now() - startedAt) / 1000);
    logger.info(
      `[MechanicsLeaderboard] Raid ${zoneId}: built ${entries.length} entries from ${parseRows.length} parse rows, ${survivalBuild.fights} fetched fight(s), ${survivalBuild.appearances} appearance lookup row(s) in ${duration}s`,
    );

    return {
      zoneId,
      entries: entries.length,
      fights: survivalBuild.fights,
      reports: survivalBuild.reports,
      appearances: survivalBuild.appearances,
    };
  }

  private async ensureBuildIndexes(): Promise<void> {
    if (!this.mechanicsIndexesCreated) {
      await CharacterMechanicsLeaderboard.createIndexes();
      this.mechanicsIndexesCreated = true;
    }

    if (!this.fightLookupIndexCreated) {
      await Fight.collection.createIndex(
        {
          zoneId: 1,
          difficulty: 1,
          deathEventsFetchStatus: 1,
          reportCode: 1,
          fightId: 1,
          encounterID: 1,
        },
        { name: "mechanics_death_fights_lookup" },
      );
      this.fightLookupIndexCreated = true;
    }
  }

  private async buildSurvivalStatsFromFetchedFights(
    zoneId: number,
    encounterIds: number[],
  ): Promise<{ stats: Map<string, SurvivalStats>; fights: number; reports: number; appearances: number }> {
    const survivalByCharacterEncounter = new Map<string, SurvivalStats>();
    const fightGroups = new Map<string, MechanicsFight[]>();
    const seenReports = new Set<string>();
    let fightCount = 0;
    let appearanceLookupRows = 0;
    let currentReportCode: string | null = null;

    const cursor = Fight.find({
      zoneId,
      difficulty: MYTHIC_DIFFICULTY,
      encounterID: { $in: encounterIds },
      deathEventsFetchStatus: "fetched",
      duration: { $gt: 0 },
    })
      .select("reportCode fightId encounterID encounterName duration deaths")
      .sort({ reportCode: 1, fightId: 1 })
      .lean()
      .cursor({ batchSize: FIGHT_CURSOR_BATCH_SIZE });

    const flushFightGroups = async () => {
      if (fightGroups.size === 0) return;
      const reportCodes = Array.from(fightGroups.keys());
      const appearances = await this.findReportAppearances(reportCodes);
      appearanceLookupRows += appearances.length;
      this.addSurvivalStats(Array.from(fightGroups.values()).flat(), appearances, survivalByCharacterEncounter);
      fightGroups.clear();
    };

    for await (const fight of cursor as AsyncIterable<MechanicsFight>) {
      if (!fight.reportCode) continue;

      if (currentReportCode && fight.reportCode !== currentReportCode && fightGroups.size >= REPORT_GROUP_BATCH_SIZE) {
        await flushFightGroups();
      }

      currentReportCode = fight.reportCode;
      fightCount += 1;
      seenReports.add(fight.reportCode);

      if (!fightGroups.has(fight.reportCode)) {
        fightGroups.set(fight.reportCode, []);
      }
      fightGroups.get(fight.reportCode)!.push(fight);
    }

    await flushFightGroups();

    return {
      stats: survivalByCharacterEncounter,
      fights: fightCount,
      reports: seenReports.size,
      appearances: appearanceLookupRows,
    };
  }

  private async findReportAppearances(reportCodes: string[]): Promise<Array<AppearanceIdentity & { reportCode: string }>> {
    const appearances: Array<AppearanceIdentity & { reportCode: string }> = [];

    for (let i = 0; i < reportCodes.length; i += REPORT_LOOKUP_BATCH_SIZE) {
      const batch = reportCodes.slice(i, i + REPORT_LOOKUP_BATCH_SIZE);
      const rows = (await CharacterReportAppearance.find({
        reportCode: { $in: batch },
        hidden: false,
        characterId: { $ne: null },
        wclCanonicalCharacterId: { $ne: null },
      } as any)
        .select("reportCode characterId wclCanonicalCharacterId characterName characterRealm characterRegion classID rankingFightIds")
        .lean()) as any[];

      for (const row of rows) {
        if (!row.characterId || typeof row.wclCanonicalCharacterId !== "number") continue;
        appearances.push({
          reportCode: row.reportCode,
          characterId: row.characterId,
          wclCanonicalCharacterId: row.wclCanonicalCharacterId,
          name: row.characterName,
          realm: row.characterRealm,
          region: row.characterRegion,
          classID: row.classID,
          rankingFightIds: Array.isArray(row.rankingFightIds) ? row.rankingFightIds.filter((fightId: unknown): fightId is number => typeof fightId === "number") : [],
        });
      }
    }

    return appearances;
  }

  private addSurvivalStats(
    fights: Array<{ reportCode: string; fightId: number; encounterID: number; duration: number; deaths?: IPlayerDeath[] }>,
    appearances: Array<AppearanceIdentity & { reportCode: string }>,
    survivalByCharacterEncounter: Map<string, SurvivalStats>,
  ): void {
    const appearancesByReport = new Map<string, Map<string, AppearanceIdentity & { reportCode: string }>>();
    const appearancesByReportFight = new Map<string, Map<string, AppearanceIdentity & { reportCode: string }>>();
    const exactIdentityByReport = new Map<string, Map<string, AppearanceIdentity & { reportCode: string }>>();
    const nameIdentityByReport = new Map<string, Map<string, (AppearanceIdentity & { reportCode: string }) | null>>();
    const reportsWithFightParticipants = new Set<string>();

    for (const appearance of appearances) {
      if (!appearancesByReport.has(appearance.reportCode)) {
        appearancesByReport.set(appearance.reportCode, new Map());
        exactIdentityByReport.set(appearance.reportCode, new Map());
        nameIdentityByReport.set(appearance.reportCode, new Map());
      }

      appearancesByReport.get(appearance.reportCode)!.set(this.getCharacterKey(appearance.characterId), appearance);
      exactIdentityByReport.get(appearance.reportCode)!.set(this.getDeathIdentityKey(appearance.name, appearance.realm), appearance);

      const nameKey = this.normalizeIdentityPart(appearance.name);
      const nameMap = nameIdentityByReport.get(appearance.reportCode)!;
      nameMap.set(nameKey, nameMap.has(nameKey) ? null : appearance);

      for (const fightId of appearance.rankingFightIds) {
        reportsWithFightParticipants.add(appearance.reportCode);
        const fightKey = this.getReportFightKey(appearance.reportCode, fightId);
        if (!appearancesByReportFight.has(fightKey)) {
          appearancesByReportFight.set(fightKey, new Map());
        }
        appearancesByReportFight.get(fightKey)!.set(this.getCharacterKey(appearance.characterId), appearance);
      }
    }

    for (const fight of fights) {
      const reportParticipants = appearancesByReport.get(fight.reportCode);
      if (!reportParticipants?.size || !fight.duration || fight.duration <= 0) continue;

      const deathsByCharacter = new Map<string, { death: IPlayerDeath; order: number }>();
      const deaths = [...(fight.deaths ?? [])].sort((a, b) => (a.deathTime ?? a.timestamp ?? 0) - (b.deathTime ?? b.timestamp ?? 0));
      const exactMap = exactIdentityByReport.get(fight.reportCode) ?? new Map();
      const nameMap = nameIdentityByReport.get(fight.reportCode) ?? new Map();
      const exactFightParticipants = appearancesByReportFight.get(this.getReportFightKey(fight.reportCode, fight.fightId));
      const fallbackParticipants = reportsWithFightParticipants.has(fight.reportCode) ? undefined : reportParticipants;
      const participants = new Map(exactFightParticipants?.size ? exactFightParticipants : fallbackParticipants);

      let matchedDeathOrder = 0;
      for (const death of deaths) {
        const appearance =
          exactMap.get(this.getDeathIdentityKey(death.name, death.server)) ?? nameMap.get(this.normalizeIdentityPart(death.name)) ?? null;
        if (!appearance) continue;

        matchedDeathOrder += 1;
        const characterKey = this.getCharacterKey(appearance.characterId);
        if (!deathsByCharacter.has(characterKey)) {
          deathsByCharacter.set(characterKey, { death, order: matchedDeathOrder });
        }
        participants.set(characterKey, appearance);
      }

      for (const participant of participants.values()) {
        const statKey = this.getCharacterEncounterKey(participant.characterId, fight.encounterID);
        const stats = survivalByCharacterEncounter.get(statKey) ?? {
          pulls: 0,
          deaths: 0,
          survivedPulls: 0,
          earlyDeaths: 0,
          scoreTotal: 0,
          deathPercentTotal: 0,
        };

        const deathRecord = deathsByCharacter.get(this.getCharacterKey(participant.characterId));
        stats.pulls += 1;

        if (deathRecord) {
          const deathTime = Number.isFinite(deathRecord.death.deathTime) ? deathRecord.death.deathTime : 0;
          const deathPercent = this.clamp(deathTime / fight.duration, 0, 1);
          stats.deaths += 1;
          stats.deathPercentTotal += deathPercent;
          if (deathRecord.order <= 3) stats.earlyDeaths += 1;
          stats.scoreTotal += this.scoreDeath(deathPercent, deathRecord.order);
        } else {
          stats.survivedPulls += 1;
          stats.scoreTotal += 100;
        }

        survivalByCharacterEncounter.set(statKey, stats);
      }
    }
  }

  private buildOverallEntries(bossEntries: any[]): any[] {
    const groups = new Map<string, any[]>();
    for (const entry of bossEntries) {
      const key = `${entry.characterId}|${entry.metric}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    const overallEntries: any[] = [];

    for (const entries of groups.values()) {
      const sortedBossScores: IMechanicsBossScore[] = entries
        .map((entry) => ({
          encounterId: entry.encounterId,
          encounterName: entry.encounterName,
          score: entry.score,
          parseScore: entry.parseScore,
          survivalScore: entry.survivalScore,
          pulls: entry.pulls,
          deaths: entry.deaths,
          survivedPulls: entry.survivedPulls,
          earlyDeaths: entry.earlyDeaths,
          averageDeathPercent: entry.averageDeathPercent,
          deathDataAvailable: entry.deathDataAvailable,
          specName: entry.specName,
          rankPercent: entry.rankPercent,
        }))
        .sort((a, b) => a.encounterId - b.encounterId);

      const first = entries[0];
      const totals = this.summarizeBossScores(sortedBossScores);

      overallEntries.push({
        ...first,
        type: "overall" as const,
        encounterId: null,
        encounterName: "",
        score: totals.score,
        parseScore: totals.parseScore,
        survivalScore: totals.survivalScore,
        pulls: totals.pulls,
        deaths: totals.deaths,
        survivedPulls: totals.survivedPulls,
        earlyDeaths: totals.earlyDeaths,
        averageDeathPercent: totals.averageDeathPercent,
        deathDataAvailable: totals.deathDataAvailable,
        bossScores: sortedBossScores,
        totalKills: entries.reduce((sum, entry) => sum + (entry.totalKills ?? 0), 0),
        bestAmount: 0,
        ilvl: Math.round(entries.reduce((sum, entry) => sum + (entry.ilvl ?? 0), 0) / entries.length),
        rankPercent: totals.parseScore,
        medianPercent: 0,
        updatedAt: entries.reduce((latest, entry) => (entry.updatedAt > latest ? entry.updatedAt : latest), first.updatedAt),
      });
    }

    return overallEntries;
  }

  async getMechanicsRankings(options: {
    zoneId: number;
    encounterId?: number;
    classId?: number;
    specName?: string;
    role?: Role;
    metric?: Metric;
    limit?: number;
    page?: number;
    characterName?: string;
    guildName?: string;
  }): Promise<QueryResponse> {
    const { zoneId, encounterId, classId, specName, role, metric = "dps", limit = 100, page = 1, characterName, guildName } = options;
    const normalizedSpecName = specName?.trim().toLowerCase();
    const normalizedRole = role?.toLowerCase() as Role | undefined;
    const normalizedCharacterName = characterName?.trim();
    const normalizedGuildName = guildName?.trim();
    const partialNameRegex = normalizedCharacterName ? this.getAccentInsensitiveRegex(normalizedCharacterName) : undefined;
    const partialGuildNameRegex = normalizedGuildName ? new RegExp(this.escapeRegex(normalizedGuildName), "i") : undefined;
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const isBossType = encounterId !== undefined;

    const baseQuery: any = {
      zoneId,
      difficulty: MYTHIC_DIFFICULTY,
      type: isBossType ? "boss" : "overall",
      encounterId: encounterId ?? null,
      metric,
      deathDataAvailable: true,
      survivalScore: { $ne: null },
    };

    if (classId !== undefined) baseQuery.classID = classId;
    if (normalizedRole !== undefined) baseQuery.role = normalizedRole;

    if (!isBossType && normalizedSpecName !== undefined) {
      return this.getOverallSpecMechanicsRankings({
        baseQuery,
        normalizedSpecName,
        partialNameRegex,
        partialGuildNameRegex,
        page,
        safeLimit,
      });
    }

    if (normalizedSpecName !== undefined) baseQuery.specName = normalizedSpecName;

    const totalRankedItems = await CharacterMechanicsLeaderboard.countDocuments(baseQuery);
    let fetchQuery: any = { ...baseQuery };
    let totalItems = totalRankedItems;
    let needsGlobalRanks = false;
    const effectivePage = Math.max(page, 1);
    const effectiveSkip = (effectivePage - 1) * safeLimit;

    if (partialNameRegex) {
      fetchQuery.name = partialNameRegex;
      totalItems = await CharacterMechanicsLeaderboard.countDocuments(fetchQuery);
      needsGlobalRanks = true;
    }

    if (partialGuildNameRegex) {
      fetchQuery.guildName = partialGuildNameRegex;
      totalItems = await CharacterMechanicsLeaderboard.countDocuments(fetchQuery);
      needsGlobalRanks = true;
    }

    const entries = await CharacterMechanicsLeaderboard.find(fetchQuery).sort({ score: -1, name: 1 }).skip(effectiveSkip).limit(safeLimit).lean();

    const ranks =
      needsGlobalRanks && entries.length > 0
        ? await Promise.all(
            entries.map(async (entry: any) => {
              const count = await CharacterMechanicsLeaderboard.countDocuments({
                ...baseQuery,
                score: { $gt: entry.score },
              });
              return count + 1;
            }),
          )
        : entries.map((_, index) => effectiveSkip + index + 1);

    return {
      data: entries.map((entry: any, index) => this.toResponseRow(entry, ranks[index], isBossType)),
      pagination: {
        totalItems,
        totalRankedItems,
        totalPages: Math.ceil(totalItems / safeLimit),
        currentPage: effectivePage,
        pageSize: safeLimit,
      },
    };
  }

  private async getOverallSpecMechanicsRankings(options: {
    baseQuery: any;
    normalizedSpecName: string;
    partialNameRegex?: RegExp;
    partialGuildNameRegex?: RegExp;
    page: number;
    safeLimit: number;
  }): Promise<QueryResponse> {
    const { baseQuery, normalizedSpecName, partialNameRegex, partialGuildNameRegex, page, safeLimit } = options;
    const entries = (await CharacterMechanicsLeaderboard.find({
      ...baseQuery,
      bossScores: { $elemMatch: { specName: normalizedSpecName, deathDataAvailable: true, survivalScore: { $ne: null } } },
    }).lean()) as any[];
    const scoredEntries: any[] = [];

    for (const entry of entries) {
      entry.bossScores = (entry.bossScores ?? []).filter(
        (bossScore: IMechanicsBossScore) => bossScore.specName === normalizedSpecName && bossScore.deathDataAvailable === true && bossScore.survivalScore !== null,
      );
      if (entry.bossScores.length === 0) continue;

      const totals = this.summarizeBossScores(entry.bossScores);
      entry.score = totals.score;
      entry.parseScore = totals.parseScore;
      entry.survivalScore = totals.survivalScore;
      entry.pulls = totals.pulls;
      entry.deaths = totals.deaths;
      entry.survivedPulls = totals.survivedPulls;
      entry.earlyDeaths = totals.earlyDeaths;
      entry.averageDeathPercent = totals.averageDeathPercent;
      entry.deathDataAvailable = totals.deathDataAvailable;
      entry.specName = normalizedSpecName;
      scoredEntries.push(entry);
    }

    scoredEntries.sort((a, b) => b.score - a.score || (a.name ?? "").localeCompare(b.name ?? ""));
    const totalRankedItems = scoredEntries.length;
    let displayEntries = scoredEntries;
    if (partialNameRegex) displayEntries = displayEntries.filter((entry) => partialNameRegex.test(entry.name ?? ""));
    if (partialGuildNameRegex) displayEntries = displayEntries.filter((entry) => partialGuildNameRegex.test(entry.guildName ?? ""));

    const effectivePage = Math.max(page, 1);
    const effectiveSkip = (effectivePage - 1) * safeLimit;
    const pageEntries = displayEntries.slice(effectiveSkip, effectiveSkip + safeLimit);
    const rankMap = new Map(scoredEntries.map((entry, index) => [entry, index + 1]));

    return {
      data: pageEntries.map((entry) => this.toResponseRow(entry, rankMap.get(entry) ?? 0, false)),
      pagination: {
        totalItems: displayEntries.length,
        totalRankedItems,
        totalPages: Math.ceil(displayEntries.length / safeLimit),
        currentPage: effectivePage,
        pageSize: safeLimit,
      },
    };
  }

  private toResponseRow(entry: any, rank: number, isBossType: boolean): any {
    const guild = entry.guildName && entry.guildRealm ? { name: entry.guildName, realm: entry.guildRealm } : null;
    const row: any = {
      rank,
      character: {
        wclCanonicalCharacterId: entry.wclCanonicalCharacterId,
        name: entry.name,
        realm: entry.realm,
        region: entry.region,
        classID: entry.classID,
        guild,
      },
      context: {
        zoneId: entry.zoneId,
        difficulty: entry.difficulty,
        metric: entry.metric ?? "dps",
        partition: entry.sourcePartition,
        encounterId: entry.encounterId,
        specName: entry.specName,
        bestSpecName: entry.bestSpecName || undefined,
        role: entry.role,
        ilvl: entry.ilvl,
      },
      score: {
        type: "mechanics",
        value: entry.score,
      },
      stats: {
        rankPercent: entry.rankPercent,
        medianPercent: entry.medianPercent,
        mechanics: {
          parseScore: entry.parseScore,
          survivalScore: entry.survivalScore,
          pulls: entry.pulls,
          deaths: entry.deaths,
          survivedPulls: entry.survivedPulls,
          earlyDeaths: entry.earlyDeaths,
          averageDeathPercent: entry.averageDeathPercent,
          deathDataAvailable: entry.deathDataAvailable,
        },
      },
      updatedAt: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : undefined,
    };

    if (isBossType) {
      row.encounter = {
        id: entry.encounterId,
        name: entry.encounterName,
      };
    } else if (entry.bossScores?.length > 0) {
      row.bossScores = entry.bossScores;
    }

    return row;
  }

  private summarizeSurvivalStats(stats?: SurvivalStats): {
    survivalScore: number | null;
    pulls: number;
    deaths: number;
    survivedPulls: number;
    earlyDeaths: number;
    averageDeathPercent: number | null;
  } {
    if (!stats || stats.pulls <= 0) {
      return {
        survivalScore: null,
        pulls: 0,
        deaths: 0,
        survivedPulls: 0,
        earlyDeaths: 0,
        averageDeathPercent: null,
      };
    }

    return {
      survivalScore: this.roundScore(stats.scoreTotal / stats.pulls),
      pulls: stats.pulls,
      deaths: stats.deaths,
      survivedPulls: stats.survivedPulls,
      earlyDeaths: stats.earlyDeaths,
      averageDeathPercent: stats.deaths > 0 ? this.roundScore((stats.deathPercentTotal / stats.deaths) * 100) : null,
    };
  }

  private summarizeBossScores(bossScores: IMechanicsBossScore[]): {
    score: number;
    parseScore: number;
    survivalScore: number | null;
    pulls: number;
    deaths: number;
    survivedPulls: number;
    earlyDeaths: number;
    averageDeathPercent: number | null;
    deathDataAvailable: boolean;
  } {
    if (bossScores.length === 0) {
      return {
        score: 0,
        parseScore: 0,
        survivalScore: null,
        pulls: 0,
        deaths: 0,
        survivedPulls: 0,
        earlyDeaths: 0,
        averageDeathPercent: null,
        deathDataAvailable: false,
      };
    }

    const score = this.roundScore(bossScores.reduce((sum, bossScore) => sum + bossScore.score, 0) / bossScores.length);
    const parseScore = this.roundScore(bossScores.reduce((sum, bossScore) => sum + bossScore.parseScore, 0) / bossScores.length);
    const survivalScores = bossScores.filter((bossScore) => bossScore.survivalScore !== null);
    const survivalScore =
      survivalScores.length > 0 ? this.roundScore(survivalScores.reduce((sum, bossScore) => sum + (bossScore.survivalScore ?? 0), 0) / survivalScores.length) : null;
    const pulls = bossScores.reduce((sum, bossScore) => sum + bossScore.pulls, 0);
    const deaths = bossScores.reduce((sum, bossScore) => sum + bossScore.deaths, 0);
    const survivedPulls = bossScores.reduce((sum, bossScore) => sum + bossScore.survivedPulls, 0);
    const earlyDeaths = bossScores.reduce((sum, bossScore) => sum + bossScore.earlyDeaths, 0);
    const deathPercentTotal = bossScores.reduce((sum, bossScore) => sum + (bossScore.averageDeathPercent ?? 0) * bossScore.deaths, 0);

    return {
      score,
      parseScore,
      survivalScore,
      pulls,
      deaths,
      survivedPulls,
      earlyDeaths,
      averageDeathPercent: deaths > 0 ? this.roundScore(deathPercentTotal / deaths) : null,
      deathDataAvailable: pulls > 0,
    };
  }

  private combineScores(parseScore: number, survivalScore: number): number {
    return this.roundScore(parseScore * PARSE_WEIGHT + survivalScore * SURVIVAL_WEIGHT);
  }

  private scoreDeath(deathPercent: number, deathOrder: number): number {
    const orderWeight = deathOrder <= 1 ? 1 : deathOrder === 2 ? 0.85 : deathOrder === 3 ? 0.7 : 0.45;
    const penalty = 100 * Math.pow(1 - deathPercent, 1.6) * orderWeight;
    return this.roundScore(this.clamp(100 - penalty, 0, 100));
  }

  private toUniqueFilter(entry: any): Record<string, unknown> {
    return {
      zoneId: entry.zoneId,
      difficulty: entry.difficulty,
      type: entry.type,
      encounterId: entry.encounterId,
      metric: entry.metric,
      characterId: entry.characterId,
    };
  }

  private getCharacterEncounterKey(characterId: mongoose.Types.ObjectId, encounterId: number): string {
    return `${this.getCharacterKey(characterId)}|${encounterId}`;
  }

  private getCharacterKey(characterId: mongoose.Types.ObjectId): string {
    return String(characterId);
  }

  private getReportFightKey(reportCode: string, fightId: number): string {
    return `${reportCode}|${fightId}`;
  }

  private getDeathIdentityKey(name: string, realm: string): string {
    return `${this.normalizeIdentityPart(name)}|${this.normalizeIdentityPart(realm)}`;
  }

  private normalizeIdentityPart(value: string): string {
    return (value ?? "").toLowerCase().replace(/['`\-\s]/g, "");
  }

  private roundScore(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 10) / 10;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private getAccentInsensitiveRegex(input: string): RegExp {
    const escaped = this.escapeRegex(input.trim());
    return new RegExp(escaped, "i");
  }
}

export default new CharacterMechanicsService();
