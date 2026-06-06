"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { CharacterProfileResponse } from "@/types";
import { formatSpecName, getClassInfoById, getGuildProfileUrl, getParseColor } from "@/lib/utils";

interface PageProps {
  params: Promise<{ realm: string; name: string }>;
}

function formatShortDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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
  const className = getClassInfoById(character.classID)?.name ?? `Class ${character.classID}`;
  const seenRange = `${formatShortDate(character.firstReportSeenAt)} - ${formatShortDate(character.lastReportSeenAt)}`;

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-lg border border-gray-700 bg-gray-900 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-400">{className}</div>
              <h1 className="mt-1 text-3xl font-bold text-white">
                {character.name}
                <span className="ml-2 text-lg font-medium text-gray-500">{character.realm}</span>
              </h1>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              <div>
                <div className="text-gray-500">Reports</div>
                <div className="font-semibold tabular-nums text-gray-100">{profile.raidTimeline.reduce((total, row) => total + row.reportCount, 0)}</div>
              </div>
              <div>
                <div className="text-gray-500">Guilds</div>
                <div className="font-semibold tabular-nums text-gray-100">{profile.character.guildHistory.length}</div>
              </div>
              <div>
                <div className="text-gray-500">Seen</div>
                <div className="font-semibold text-gray-100">{seenRange}</div>
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
                        <span className="ml-2 text-xs text-gray-500">{row.guildRealm}</span>
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
                      <tr key={`${row.zoneId}-${row.encounterId ?? "all"}-${row.metric ?? "metric"}-${row.partition ?? "all"}-${index}`} className="border-b border-gray-800 last:border-0">
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
