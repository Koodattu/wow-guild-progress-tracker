"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { CharacterProfileResponse } from "@/types";
import { formatSpecName, getClassInfoById, getGuildProfileUrl, getParseColor } from "@/lib/utils";
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

export default function CharacterProfilePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const realm = decodeURIComponent(resolvedParams.realm);
  const name = decodeURIComponent(resolvedParams.name);
  const [profile, setProfile] = useState<CharacterProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-6xl text-center text-gray-300">Loading character...</div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-6xl rounded-lg border border-gray-700 bg-gray-900 p-8 text-center">
          <h1 className="text-xl font-semibold text-white">Character not found</h1>
          <p className="mt-2 text-sm text-gray-400">{error ?? "No character profile exists for this realm and name."}</p>
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
                <div className="text-xl font-bold tabular-nums text-gray-100 md:text-2xl">{profile.raidTimeline.reduce((total, row) => total + row.reportCount, 0)}</div>
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
          {profile.raidTimeline.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="border-b border-gray-700 text-left text-xs font-semibold text-gray-400">
                    <th className="px-4 py-3">Raid</th>
                    <th className="px-4 py-3">Guild</th>
                    <th className="px-4 py-3 text-right">Reports</th>
                    <th className="px-4 py-3">First Seen</th>
                    <th className="px-4 py-3">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.raidTimeline.map((row) => (
                    <tr key={`${row.zoneId}-${row.guildId}`} className="border-b border-gray-800 last:border-0">
                      <td className="px-4 py-3 font-semibold text-gray-100">{row.raidName}</td>
                      <td className="px-4 py-3">
                        <Link href={getGuildProfileUrl(row.guildRealm, row.guildName)} className="font-semibold text-blue-300 transition-colors hover:text-blue-200">
                          {row.guildName}
                        </Link>
                        <span className="ml-2 text-xs text-gray-500">{formatRealmName(row.guildRealm)}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-200">{row.reportCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{formatShortDate(row.firstSeenAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{formatShortDate(row.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-gray-400">No raid timeline has been calculated yet.</div>
          )}
        </section>

        <section className="rounded-lg border border-gray-700 bg-gray-900">
          <div className="border-b border-gray-700 px-4 py-3">
            <h2 className="text-lg font-semibold text-white">Rankings</h2>
            <p className="text-sm text-gray-400">Existing ranking data, when this character has been processed by the ranking job.</p>
          </div>
          {profile.rankings.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="border-b border-gray-700 text-left text-xs font-semibold text-gray-400">
                    <th className="px-4 py-3">Raid</th>
                    <th className="px-4 py-3">View</th>
                    <th className="px-4 py-3">Spec</th>
                    <th className="px-4 py-3">Metric</th>
                    <th className="px-4 py-3 text-right">Score</th>
                    <th className="px-4 py-3 text-right">Parse</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.rankings.map((row, index) => {
                    const parsePercent = row.rankPercent ? Math.round(row.rankPercent) : null;
                    return (
                      <tr
                        key={`${row.zoneId}-${row.encounterId ?? "all"}-${row.metric ?? "metric"}-${row.partition ?? "all"}-${index}`}
                        className="border-b border-gray-800 last:border-0"
                      >
                        <td className="px-4 py-3 font-semibold text-gray-100">{row.raidName}</td>
                        <td className="px-4 py-3 text-gray-300">{row.encounterName ?? "All Stars"}</td>
                        <td className="px-4 py-3 text-gray-300">{row.specName ? formatSpecName(row.specName) : "-"}</td>
                        <td className="px-4 py-3 text-gray-300">{row.metric?.toUpperCase() ?? "-"}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-100">{formatScore(row.score)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums" style={parsePercent !== null ? { color: getParseColor(parsePercent) } : undefined}>
                          {parsePercent !== null ? parsePercent : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-gray-400">No rankings have been fetched for this character.</div>
          )}
        </section>
      </div>
    </main>
  );
}
