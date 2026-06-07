"use client";

import { use, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import { Boss, CharacterProfileResponse, RaidInfo } from "@/types";
import { useRaids } from "@/lib/queries";
import { formatSpecName, getClassInfoById, getGuildProfileUrl, getParseColor, getSpecIconUrl } from "@/lib/utils";
import IconImage from "@/components/IconImage";

interface PageProps {
  params: Promise<{ realm: string; name: string }>;
}

const CLASS_COLORS: Record<string, string> = {
  "Death Knight": "#C41E3A",
  "Demon Hunter": "#A330C9",
  Druid: "#FF7C0A",
  Evoker: "#33937F",
  Hunter: "#AAD372",
  Mage: "#3FC7EB",
  Monk: "#00FF98",
  Paladin: "#F48CBA",
  Priest: "#FFFFFF",
  Rogue: "#FFF468",
  Shaman: "#0070DD",
  Warlock: "#8788EE",
  Warrior: "#C69B6D",
};

type CharacterRaidTimelineRow = CharacterProfileResponse["raidTimeline"][number];
type CharacterRanking = CharacterProfileResponse["rankings"][number];

type DisplayRaidTimelineRow =
  | {
      type: "appearance";
      raid: RaidInfo;
      row: CharacterRaidTimelineRow;
    }
  | {
      type: "missing";
      raid: RaidInfo;
    };

type BossRankingColumn = {
  encounterId: number;
  encounterName: string;
  boss?: Boss;
  bestRanking: CharacterRanking;
};

type RankingRaidGroup = {
  zoneId: number;
  raidName: string;
  raid?: RaidInfo;
  bestAllStars?: CharacterRanking;
  bossColumns: BossRankingColumn[];
};

function formatShortDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

function formatRealmName(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getClassColor(className: string) {
  return CLASS_COLORS[className] ?? "#D1D5DB";
}

function formatScore(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function getBossKey(zoneId: number, encounterId: number) {
  return `${zoneId}:${encounterId}`;
}

function getRankingParse(row: CharacterRanking) {
  return row.rankPercent ?? -1;
}

function getBetterRanking(a: CharacterRanking, b: CharacterRanking) {
  const parseDiff = getRankingParse(b) - getRankingParse(a);
  if (parseDiff !== 0) return parseDiff;
  return b.score - a.score;
}

function getMetricIcon(metric: string | null) {
  if (metric === "hps") return "/icons/roleicon_healer.png";
  return "/icons/roleicon_damage.png";
}

function RankingsMetricCell({ row }: { row: CharacterRanking }) {
  const metric = row.metric?.toUpperCase() ?? "DPS";

  return (
    <div className="flex items-center gap-2 text-gray-300">
      <Image src={getMetricIcon(row.metric)} alt={metric} width={18} height={18} className="h-[18px] w-[18px] shrink-0" />
      <span className="font-semibold">{metric}</span>
    </div>
  );
}

function RankingsBossParseCell({ row, classId }: { row?: CharacterRanking; classId: number }) {
  if (!row || row.rankPercent === null) return <span className="text-gray-600">-</span>;

  const parsePercent = Math.round(row.rankPercent);
  const specIcon = row.specName ? getSpecIconUrl(classId, row.specName) : undefined;

  return (
    <span className="inline-flex items-center justify-end gap-1 font-semibold tabular-nums" style={{ color: getParseColor(parsePercent) }}>
      {parsePercent}
      {specIcon ? <IconImage iconFilename={specIcon} alt={`${formatSpecName(row.specName!)} icon`} width={16} height={16} className="h-4 w-4 rounded" /> : null}
    </span>
  );
}

function RaidNameCell({ raid, muted = false }: { raid: RaidInfo; muted?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <IconImage iconFilename={raid.iconUrl} alt={`${raid.name} icon`} width={24} height={24} className="h-6 w-6 shrink-0 rounded object-cover" />
      <span className={`truncate font-semibold ${muted ? "" : "text-gray-100"}`}>{raid.name}</span>
    </div>
  );
}

export default function CharacterProfilePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const realm = decodeURIComponent(resolvedParams.realm);
  const name = decodeURIComponent(resolvedParams.name);
  const [profile, setProfile] = useState<CharacterProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bossesByRaid, setBossesByRaid] = useState<Map<number, Boss[]>>(new Map());
  const { data: raids = [], isLoading: isLoadingRaids, error: raidsError } = useRaids();

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const response = await api.getCharacterProfileByRealmName(realm, name);
        if (!cancelled) setProfile(response);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load character profile");
          setProfile(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [realm, name]);

  useEffect(() => {
    if (!profile?.rankings.length) {
      setBossesByRaid(new Map());
      return;
    }

    let cancelled = false;
    const rankedRaidIds = Array.from(new Set(profile.rankings.map((row) => row.zoneId)));
    if (!rankedRaidIds.length) return;
    setBossesByRaid(new Map());

    async function loadBosses() {
      const entries = await Promise.all(
        rankedRaidIds.map(async (zoneId) => {
          try {
            return [zoneId, await api.getBosses(zoneId)] as const;
          } catch {
            return [zoneId, [] as Boss[]] as const;
          }
        }),
      );

      if (cancelled) return;
      setBossesByRaid((current) => {
        const next = new Map(current);
        entries.forEach(([zoneId, bosses]) => next.set(zoneId, bosses));
        return next;
      });
    }

    loadBosses();

    return () => {
      cancelled = true;
    };
  }, [profile]);

  const raidTimelineRows = useMemo<DisplayRaidTimelineRow[]>(() => {
    if (!profile) return [];

    const raidById = new Map(raids.map((raid) => [raid.id, raid]));
    const trackedTimelineRows = profile.raidTimeline
      .filter((row) => raidById.has(row.zoneId))
      .sort((a, b) => {
        if (a.zoneId !== b.zoneId) return b.zoneId - a.zoneId;
        return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      });

    if (trackedTimelineRows.length === 0) return [];

    const rowsByRaidId = new Map<number, CharacterRaidTimelineRow[]>();
    trackedTimelineRows.forEach((row) => {
      const rows = rowsByRaidId.get(row.zoneId) ?? [];
      rows.push(row);
      rowsByRaidId.set(row.zoneId, rows);
    });

    const presentRaidIndexes = trackedTimelineRows
      .map((row) => raids.findIndex((raid) => raid.id === row.zoneId))
      .filter((index) => index !== -1);
    const firstIndex = Math.min(...presentRaidIndexes);
    const lastIndex = Math.max(...presentRaidIndexes);

    return raids.slice(firstIndex, lastIndex + 1).flatMap((raid): DisplayRaidTimelineRow[] => {
      const rows = rowsByRaidId.get(raid.id);
      if (!rows?.length) return [{ type: "missing", raid }];
      return rows.map((row) => ({ type: "appearance", raid, row }));
    });
  }, [profile, raids]);
  const raidReportCount = raidTimelineRows.reduce((total, row) => (row.type === "appearance" ? total + row.row.reportCount : total), 0);
  const rankingRaidGroups = useMemo<RankingRaidGroup[]>(() => {
    if (!profile?.rankings.length) return [];

    const raidById = new Map(raids.map((raid) => [raid.id, raid]));
    const groups = new Map<number, { zoneId: number; raidName: string; raid?: RaidInfo; allStars: CharacterRanking[]; bossRankings: Map<number, CharacterRanking[]> }>();

    profile.rankings.forEach((row) => {
      const group = groups.get(row.zoneId) ?? {
        zoneId: row.zoneId,
        raidName: row.raidName,
        raid: raidById.get(row.zoneId),
        allStars: [],
        bossRankings: new Map<number, CharacterRanking[]>(),
      };

      if (row.encounterId === null) {
        group.allStars.push(row);
      } else {
        const rankings = group.bossRankings.get(row.encounterId) ?? [];
        rankings.push(row);
        group.bossRankings.set(row.encounterId, rankings);
      }

      groups.set(row.zoneId, group);
    });

    return Array.from(groups.values())
      .sort((a, b) => b.zoneId - a.zoneId)
      .map((group) => {
        const bosses = bossesByRaid.get(group.zoneId) ?? [];
        const bossById = new Map(bosses.map((boss) => [boss.id, boss]));
        const bossOrder = new Map(bosses.map((boss, index) => [boss.id, index]));

        return {
          zoneId: group.zoneId,
          raidName: group.raidName,
          raid: group.raid,
          bestAllStars: [...group.allStars].sort(getBetterRanking)[0],
          bossColumns: Array.from(group.bossRankings.entries())
            .map(([encounterId, rankings]) => {
              const bestRanking = [...rankings].sort(getBetterRanking)[0];
              return {
                encounterId,
                encounterName: bestRanking.encounterName ?? `Encounter ${encounterId}`,
                boss: bossById.get(encounterId),
                bestRanking,
              };
            })
            .sort((a, b) => {
              const aOrder = bossOrder.get(a.encounterId) ?? Number.MAX_SAFE_INTEGER;
              const bOrder = bossOrder.get(b.encounterId) ?? Number.MAX_SAFE_INTEGER;
              if (aOrder !== bOrder) return aOrder - bOrder;
              return a.encounterName.localeCompare(b.encounterName);
            }),
        };
      });
  }, [profile, raids, bossesByRaid]);

  if (loading || isLoadingRaids) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-6xl text-center text-gray-300">Loading character...</div>
      </main>
    );
  }

  if (error || raidsError || !profile) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-6xl rounded-lg border border-gray-700 bg-gray-900 p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Character not found</h1>
          <p className="mt-2 text-sm text-gray-400">{error ?? (raidsError instanceof Error ? raidsError.message : "No character profile exists for this realm and name.")}</p>
        </div>
      </main>
    );
  }

  const character = profile.character;
  const classInfo = getClassInfoById(character.classID);
  const seenRange = `${formatShortDate(character.firstReportSeenAt)} - ${formatShortDate(character.lastReportSeenAt)}`;
  const latestGuild = [...character.guildHistory].sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())[0];

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="py-2">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 md:pr-6">
              <div className="flex min-w-0 items-center gap-4">
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded md:h-16 md:w-16">
                  <IconImage iconFilename={classInfo.iconUrl} alt={classInfo.name} fill style={{ objectFit: "cover" }} />
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1">
                    <h1 className="min-w-0 text-3xl font-bold leading-none md:text-4xl" style={{ color: getClassColor(classInfo.name) }}>
                      {character.name}
                    </h1>
                    <span className="pb-0.5 text-lg font-semibold leading-none text-gray-500 md:text-xl">{formatRealmName(character.realm)}</span>
                  </div>
                  {latestGuild ? (
                    <div className="text-sm font-semibold text-gray-400">
                      <Link href={getGuildProfileUrl(latestGuild.guildRealm, latestGuild.guildName)} className="text-blue-300 transition-colors hover:text-blue-200">
                        {latestGuild.guildName}
                      </Link>
                      <span className="ml-2 text-xs text-gray-600">{formatRealmName(latestGuild.guildRealm)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm md:ml-auto md:justify-end md:text-right md:text-base">
              <div>
                <div className="text-gray-500">Reports</div>
                <div className="text-xl font-bold tabular-nums text-gray-100 md:text-2xl">{raidReportCount}</div>
              </div>
              <div>
                <div className="text-gray-500">Guilds</div>
                <div className="text-xl font-bold tabular-nums text-gray-100 md:text-2xl">{profile.character.guildHistory.length}</div>
              </div>
              <div>
                <div className="text-gray-500">Seen</div>
                <div className="text-lg font-bold tabular-nums text-gray-100 md:text-xl">{seenRange}</div>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-gray-700 bg-gray-900">
          <div className="border-b border-gray-700 px-4 py-3">
            <h2 className="text-lg font-semibold text-white">Raid Timeline</h2>
            <p className="text-sm text-gray-400">Guilds and raid tiers where this character appeared in fetched report rosters.</p>
          </div>
          {raidTimelineRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] table-fixed border-collapse">
                <colgroup>
                  <col className="w-[34%]" />
                  <col className="w-[30%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-700 text-left text-xs font-semibold text-gray-400">
                    <th className="px-4 py-3">Raid</th>
                    <th className="px-4 py-3">Guild</th>
                    <th className="px-4 py-3 text-center">Reports</th>
                    <th className="px-4 py-3">First Seen</th>
                    <th className="px-4 py-3">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {raidTimelineRows.map((timelineRow) => {
                    if (timelineRow.type === "missing") {
                      return (
                        <tr key={`missing-${timelineRow.raid.id}`} className="border-b border-gray-800 bg-gray-950/35 text-gray-600 last:border-0">
                          <td className="px-4 py-3">
                            <RaidNameCell raid={timelineRow.raid} muted />
                          </td>
                          <td className="px-4 py-3 text-sm">Did not appear</td>
                          <td className="px-4 py-3 text-center font-semibold tabular-nums">0</td>
                          <td className="px-4 py-3 text-sm">-</td>
                          <td className="px-4 py-3 text-sm">-</td>
                        </tr>
                      );
                    }

                    const row = timelineRow.row;
                    return (
                      <tr key={`${row.zoneId}-${row.guildId}`} className="border-b border-gray-800 last:border-0">
                        <td className="px-4 py-3">
                          <RaidNameCell raid={timelineRow.raid} />
                        </td>
                        <td className="px-4 py-3 truncate">
                          <Link href={getGuildProfileUrl(row.guildRealm, row.guildName)} className="font-semibold text-blue-300 transition-colors hover:text-blue-200">
                            {row.guildName}
                          </Link>
                          <span className="ml-2 text-xs text-gray-500">{formatRealmName(row.guildRealm)}</span>
                        </td>
                        <td className="px-4 py-3 text-center font-semibold tabular-nums text-gray-200">{row.reportCount}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{formatShortDate(row.firstSeenAt)}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{formatShortDate(row.lastSeenAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-gray-400">No tracked raid appearances have been calculated yet.</div>
          )}
        </section>

        <section className="rounded-lg border border-gray-700 bg-gray-900">
          <div className="border-b border-gray-700 px-4 py-3">
            <h2 className="text-lg font-semibold text-white">Rankings</h2>
            <p className="text-sm text-gray-400">Best available parses grouped by raid and boss.</p>
          </div>
          {rankingRaidGroups.length ? (
            <div className="divide-y divide-gray-800">
              {rankingRaidGroups.map((group) => (
                <div key={group.zoneId}>
                  <div className="flex items-center gap-3 bg-gray-950/35 px-4 py-3">
                    <IconImage iconFilename={group.raid?.iconUrl} alt={`${group.raidName} icon`} width={30} height={30} className="h-[30px] w-[30px] shrink-0 rounded object-cover" />
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-gray-100">{group.raidName}</h3>
                      <div className="text-xs text-gray-500">{group.bossColumns.length} boss parses</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse">
                      <thead>
                        <tr className="border-b border-gray-800 text-left text-xs font-semibold text-gray-400">
                          <th className="px-4 py-3">View</th>
                          <th className="px-4 py-3">Metric</th>
                          <th className="px-4 py-3 text-right">Score</th>
                          {group.bossColumns.map((bossColumn) => (
                            <th key={getBossKey(group.zoneId, bossColumn.encounterId)} className="px-4 py-3">
                              <div className="flex justify-center" title={bossColumn.encounterName}>
                                <IconImage
                                  iconFilename={bossColumn.boss?.iconUrl}
                                  alt={`${bossColumn.encounterName} icon`}
                                  width={24}
                                  height={24}
                                  className="h-6 w-6 rounded object-cover"
                                />
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-800 last:border-0">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 font-semibold text-gray-100">
                              <IconImage iconFilename={group.raid?.iconUrl} alt={`${group.raidName} icon`} width={24} height={24} className="h-6 w-6 shrink-0 rounded object-cover" />
                              <span>All Stars</span>
                            </div>
                          </td>
                          {group.bestAllStars ? (
                            <>
                              <td className="px-4 py-3">
                                <RankingsMetricCell row={group.bestAllStars} />
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-100">{formatScore(group.bestAllStars.score)}</td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-gray-600">-</td>
                              <td className="px-4 py-3 text-right text-gray-600">-</td>
                            </>
                          )}
                          {group.bossColumns.map((bossColumn) => (
                            <td key={getBossKey(group.zoneId, bossColumn.encounterId)} className="px-4 py-3 text-center">
                              <RankingsBossParseCell row={bossColumn.bestRanking} classId={character.classID} />
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-gray-400">No rankings have been fetched for this character.</div>
          )}
        </section>
      </div>
    </main>
  );
}
