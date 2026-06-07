"use client";

import { type KeyboardEvent, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Boss, CharacterProfileChoice, CharacterProfileLookupResponse, CharacterProfileResponse, CharacterRaidReportsResponse, RaidInfo } from "@/types";
import { useRaids } from "@/lib/queries";
import { formatRealmName, formatSpecName, formatTime, getClassInfoById, getGuildProfileUrl, getParseColor, getSpecIconUrl } from "@/lib/utils";
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

type SelectedTimelineReports = {
  raid: RaidInfo;
  row: CharacterRaidTimelineRow;
};

type BossRankingColumn = {
  encounterId: number;
  encounterName: string;
  boss?: Boss;
  bestRanking?: CharacterRanking;
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

function formatReportDateTime(value?: number | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("fi-FI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRealmSlug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

function getCharacterExternalUrls(region: string, realm: string, name: string) {
  const encodedRegion = encodeURIComponent(region.toLowerCase());
  const encodedRealm = encodeURIComponent(formatRealmSlug(realm));
  const encodedName = encodeURIComponent(name);

  return {
    wcl: `https://www.warcraftlogs.com/character/${encodedRegion}/${encodedRealm}/${encodedName}`,
    raiderIo: `https://raider.io/characters/${encodedRegion}/${encodedRealm}/${encodedName}`,
    armory: `https://worldofwarcraft.blizzard.com/en-gb/character/${encodedRegion}/${encodedRealm}/${encodedName}`,
  };
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

function getCharacterProfileHref(realm: string, name: string, classID: number) {
  return `/characters/${encodeURIComponent(realm)}/${encodeURIComponent(name)}?class=${encodeURIComponent(String(classID))}`;
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

function CharacterExternalLink({ href, title, src, alt, imageClassName = "" }: { href: string; title: string; src: string; alt: string; imageClassName?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={title}
      title={title}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md opacity-80 transition-[opacity,transform] hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 active:scale-[0.96] md:h-8 md:w-8"
    >
      <Image src={src} alt={alt} width={24} height={24} className={`h-5 w-5 object-contain md:h-6 md:w-6 ${imageClassName}`} />
    </a>
  );
}

function CharacterRaidReportsDialog({
  selected,
  reports,
  loading,
  error,
  onClose,
}: {
  selected: SelectedTimelineReports;
  reports: CharacterRaidReportsResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-5xl overflow-hidden rounded-lg bg-gray-900 shadow-[0_18px_70px_rgba(0,0,0,0.55)] ring-1 ring-gray-700" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-gray-700 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconImage iconFilename={selected.raid.iconUrl} alt={`${selected.raid.name} icon`} width={32} height={32} className="h-8 w-8 shrink-0 rounded object-cover" />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-white">{selected.raid.name} Reports</h2>
              <p className="truncate text-sm text-gray-400">
                {selected.row.guildName} <span className="text-gray-600">{formatRealmName(selected.row.guildRealm)}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md bg-gray-800 text-lg leading-none text-gray-200 transition-colors hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 active:scale-[0.96]"
            aria-label="Close reports dialog"
          >
            x
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto">
          {loading ? (
            <div className="px-4 py-10 text-center text-gray-300">Loading reports...</div>
          ) : error ? (
            <div className="px-4 py-10 text-center text-red-300">{error}</div>
          ) : reports?.reports.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead className="sticky top-0 z-10 bg-gray-900 shadow-[0_1px_0_rgba(55,65,81,1)]">
                  <tr className="text-left text-xs font-semibold uppercase text-gray-400">
                    <th className="px-4 py-3">Report</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3 text-right">Duration</th>
                    <th className="px-4 py-3 text-right">Pulls</th>
                    <th className="px-4 py-3 text-right">Kills</th>
                    <th className="px-4 py-3 text-right">Wipes</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">WCL</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.reports.map((report) => (
                    <tr key={report.code} className="border-b border-gray-800/80 last:border-0 hover:bg-gray-800/45">
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-100">{report.code}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-300">{formatReportDateTime(report.startTime)}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-300">{report.durationSeconds !== undefined ? formatTime(report.durationSeconds) : "-"}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-gray-200">{report.fightCount}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-green-300">{report.kills}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-red-300">{report.wipes}</td>
                      <td className="px-4 py-3 text-sm">
                        {report.isOngoing ? (
                          <span className="inline-flex rounded bg-green-900/60 px-2 py-1 text-xs font-semibold uppercase text-green-300">Live</span>
                        ) : (
                          <span className="text-gray-500">Complete</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={report.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-10 items-center justify-center rounded-md bg-gray-800 px-3 text-sm font-semibold text-blue-300 transition-colors hover:bg-gray-700 hover:text-blue-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 active:scale-[0.96]"
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-gray-400">No report appearances were found for this timeline row.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function CharacterChoiceCard({ choice }: { choice: CharacterProfileChoice }) {
  const classInfo = getClassInfoById(choice.classID);

  return (
    <Link
      href={getCharacterProfileHref(choice.realm, choice.name, choice.classID)}
      className="group flex min-h-[136px] flex-col justify-between rounded-lg bg-gray-900 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.24)] ring-1 ring-gray-700 transition-[background-color,box-shadow,transform] hover:bg-gray-800/80 hover:shadow-[0_16px_42px_rgba(0,0,0,0.34)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 active:scale-[0.96]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md shadow-sm shadow-black/35 ring-1 ring-white/10">
          <IconImage iconFilename={classInfo.iconUrl} alt={classInfo.name} fill style={{ objectFit: "cover" }} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-lg font-bold" style={{ color: getClassColor(classInfo.name) }}>
            {choice.name}
          </div>
          <div className="truncate text-sm font-semibold text-gray-400">
            {classInfo.name} <span className="text-gray-600">{formatRealmName(choice.realm)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-gray-500">Reports</div>
          <div className="font-bold tabular-nums text-gray-100">{choice.reportCount}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Guilds</div>
          <div className="font-bold tabular-nums text-gray-100">{choice.guildCount}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Last Seen</div>
          <div className="font-bold tabular-nums text-gray-100">{formatShortDate(choice.lastSeenAt)}</div>
        </div>
      </div>

      {choice.latestGuild ? (
        <div className="mt-3 truncate text-xs font-semibold text-gray-500">
          {choice.latestGuild.name} <span className="text-gray-700">{formatRealmName(choice.latestGuild.realm)}</span>
        </div>
      ) : null}
    </Link>
  );
}

function CharacterChoicesView({ name, realm, choices }: { name: string; realm: string; choices: CharacterProfileChoice[] }) {
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="py-2">
          <h1 className="text-3xl font-bold text-white md:text-4xl">{name}</h1>
          <p className="mt-1 text-lg font-semibold text-gray-500">{formatRealmName(realm)}</p>
        </header>

        <section className="rounded-lg bg-gray-950/35 p-4 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset] ring-1 ring-gray-800">
          <h2 className="text-lg font-semibold text-white">Select Character</h2>
          <p className="text-sm text-gray-400">Multiple classes have appeared with this character name and realm in raid reports.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {choices.map((choice) => (
              <CharacterChoiceCard key={`${choice.region}-${choice.realm}-${choice.name}-${choice.classID}`} choice={choice} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function CharacterProfilePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const realm = decodeURIComponent(resolvedParams.realm);
  const name = decodeURIComponent(resolvedParams.name);
  const searchParams = useSearchParams();
  const classParam = searchParams.get("class");
  const selectedClassId = useMemo(() => {
    if (!classParam) return undefined;
    const parsed = Number(classParam);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [classParam]);
  const [lookup, setLookup] = useState<CharacterProfileLookupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bossesByRaid, setBossesByRaid] = useState<Map<number, Boss[]>>(new Map());
  const [selectedTimelineReports, setSelectedTimelineReports] = useState<SelectedTimelineReports | null>(null);
  const [timelineReports, setTimelineReports] = useState<CharacterRaidReportsResponse | null>(null);
  const [timelineReportsLoading, setTimelineReportsLoading] = useState(false);
  const [timelineReportsError, setTimelineReportsError] = useState<string | null>(null);
  const [isNameHistoryOpen, setIsNameHistoryOpen] = useState(false);
  const timelineReportsRequestId = useRef(0);
  const { data: raids = [], isLoading: isLoadingRaids, error: raidsError } = useRaids();
  const profile = lookup?.type === "profile" ? lookup : null;
  const choices = lookup?.type === "choices" ? lookup : null;

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const response = await api.getCharacterProfileByRealmName(realm, name, selectedClassId);
        if (!cancelled) setLookup(response);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load character profile");
          setLookup(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [realm, name, selectedClassId]);

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

  const handleCloseTimelineReports = useCallback(() => {
    timelineReportsRequestId.current += 1;
    setSelectedTimelineReports(null);
    setTimelineReports(null);
    setTimelineReportsError(null);
    setTimelineReportsLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedTimelineReports) return;

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        handleCloseTimelineReports();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedTimelineReports, handleCloseTimelineReports]);

  async function handleOpenTimelineReports(raid: RaidInfo, row: CharacterRaidTimelineRow) {
    const requestId = timelineReportsRequestId.current + 1;
    timelineReportsRequestId.current = requestId;
    setSelectedTimelineReports({ raid, row });
    setTimelineReports(null);
    setTimelineReportsError(null);
    setTimelineReportsLoading(true);

    try {
      const response = await api.getCharacterRaidReportsByRealmName(row.characterRealm, row.characterName, row.zoneId, row.guildId, profile?.character.classID);
      if (timelineReportsRequestId.current === requestId) {
        setTimelineReports(response);
      }
    } catch (err) {
      if (timelineReportsRequestId.current === requestId) {
        setTimelineReportsError(err instanceof Error ? err.message : "Failed to load reports");
      }
    } finally {
      if (timelineReportsRequestId.current === requestId) {
        setTimelineReportsLoading(false);
      }
    }
  }

  function handleTimelineReportKeyDown(event: KeyboardEvent<HTMLTableRowElement>, raid: RaidInfo, row: CharacterRaidTimelineRow) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleOpenTimelineReports(raid, row);
  }

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
        const bossEntries =
          bosses.length > 0
            ? bosses.map((boss) => [boss.id, boss.name, boss] as const)
            : Array.from(group.bossRankings.entries()).map(([encounterId, rankings]) => {
                const bestRanking = [...rankings].sort(getBetterRanking)[0];
                return [encounterId, bestRanking.encounterName ?? `Encounter ${encounterId}`, undefined] as const;
              });

        return {
          zoneId: group.zoneId,
          raidName: group.raidName,
          raid: group.raid,
          bestAllStars: [...group.allStars].sort(getBetterRanking)[0],
          bossColumns: bossEntries.map(([encounterId, encounterName, boss]) => ({
            encounterId,
            encounterName,
            boss,
            bestRanking: [...(group.bossRankings.get(encounterId) ?? [])].sort(getBetterRanking)[0],
          })),
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

  if (choices) {
    return <CharacterChoicesView name={choices.character.name} realm={choices.character.realm} choices={choices.choices} />;
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
  const externalUrls = getCharacterExternalUrls(character.region, character.realm, character.name);
  const nameHistory = character.nameHistory ?? [];

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
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
                      <h1 className="min-w-0 text-3xl font-bold leading-none md:text-4xl" style={{ color: getClassColor(classInfo.name) }}>
                        {character.name}
                      </h1>
                      <div className="flex shrink-0 items-center gap-0">
                        <CharacterExternalLink href={externalUrls.wcl} title="View on Warcraft Logs" src="/wcl-logo.png" alt="Warcraft Logs" />
                        <CharacterExternalLink
                          href={externalUrls.raiderIo}
                          title="View on Raider.IO"
                          src="/raiderio-logo.png"
                          alt="Raider.IO"
                        />
                        <CharacterExternalLink href={externalUrls.armory} title="View on World of Warcraft Armory" src="/wow_logo.png" alt="World of Warcraft" />
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold leading-none text-gray-500 md:text-xl">{formatRealmName(character.realm)}</span>
                      {nameHistory.length > 1 ? (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setIsNameHistoryOpen((open) => !open)}
                            className="inline-flex min-h-8 items-center gap-1 rounded-md bg-gray-900 px-2 text-xs font-semibold text-gray-300 shadow-sm shadow-black/20 ring-1 ring-gray-700 transition-[background-color,color,transform] hover:bg-gray-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 active:scale-[0.96]"
                            aria-expanded={isNameHistoryOpen}
                          >
                            Name history <span className={`transition-transform ${isNameHistoryOpen ? "rotate-180" : ""}`}>v</span>
                          </button>
                          {isNameHistoryOpen ? (
                            <div className="absolute left-0 top-9 z-20 w-72 overflow-hidden rounded-lg bg-gray-950 shadow-[0_18px_55px_rgba(0,0,0,0.45)] ring-1 ring-gray-700">
                              <div className="max-h-80 overflow-y-auto py-1">
                                {nameHistory.map((entry) => {
                                  const isCurrent = entry.name === character.name && entry.realm === character.realm;
                                  return (
                                    <div key={`${entry.region}-${entry.realm}-${entry.name}`} className="px-3 py-2 text-sm">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className={`truncate font-semibold ${isCurrent ? "text-white" : "text-gray-300"}`}>{entry.name}</div>
                                          <div className="truncate text-xs text-gray-500">{formatRealmName(entry.realm)}</div>
                                        </div>
                                        <div className="shrink-0 text-right text-xs text-gray-500">
                                          <div className="tabular-nums">{entry.reportCount}</div>
                                          <div className="tabular-nums">{formatShortDate(entry.lastSeenAt)}</div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
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
                      <tr
                        key={`${row.zoneId}-${row.guildId}`}
                        role="button"
                        tabIndex={0}
                        title={`Show ${row.reportCount} reports for ${row.guildName} in ${timelineRow.raid.name}`}
                        onClick={() => handleOpenTimelineReports(timelineRow.raid, row)}
                        onKeyDown={(event) => handleTimelineReportKeyDown(event, timelineRow.raid, row)}
                        className="group cursor-pointer border-b border-gray-800 transition-colors last:border-0 hover:bg-blue-950/35 focus-visible:bg-blue-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                      >
                        <td className="px-4 py-3">
                          <RaidNameCell raid={timelineRow.raid} />
                        </td>
                        <td className="px-4 py-3 truncate">
                          <Link
                            href={getGuildProfileUrl(row.guildRealm, row.guildName)}
                            onClick={(event) => event.stopPropagation()}
                            className="font-semibold text-blue-300 transition-colors hover:text-blue-200"
                          >
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

        {selectedTimelineReports ? (
          <CharacterRaidReportsDialog
            selected={selectedTimelineReports}
            reports={timelineReports}
            loading={timelineReportsLoading}
            error={timelineReportsError}
            onClose={handleCloseTimelineReports}
          />
        ) : null}

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
                      <div className="text-xs text-gray-500">{group.bossColumns.length} bosses</div>
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
