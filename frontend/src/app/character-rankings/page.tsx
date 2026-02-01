"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CharacterRankingRow } from "@/types";

type Filters = {
  encounterId?: number;
  classId?: number;
  specName?: string;
  role?: "dps" | "healer" | "tank";
  metric?: "dps" | "hps";
  page?: number;
  limit?: number;
};

function buildQuery(filters: Filters) {
  const sp = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default function CharacterRankingsPage() {
  const [rows, setRows] = useState<CharacterRankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // change these values to test different queries
  const filters: Filters = {
    limit: 50,
    page: 1,
    role: "dps",
    encounterId: 3132,
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const qs = buildQuery(filters);
        const data = await api.getCharacterRankings(qs);
        setRows(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-300">{error}</div>;

  return (
    <div className="w-full px-3 md:px-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-gray-700">
            <th className="py-2 px-4">Character</th>
            <th className="py-2 px-4">Class ID</th>
            <th className="py-2 px-4">specName</th>
            <th className="py-2 px-4">raw dmg</th>
            <th className="py-2 px-4">All star points for encounter</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-700">
              <td className="py-2 px-4">{row.character.name}</td>
              <td className="py-2 px-4">{row.character.classID}</td>
              <td className="py-2 px-4">{row.context.specName}</td>
              <td className="py-2 px-4">{row.score.value}</td>
              <td className="py-2 px-4">{row.stats.allStars?.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
