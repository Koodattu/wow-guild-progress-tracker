"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Boss, CharacterRankingRow } from "@/types";
import IconImage from "@/components/IconImage";
import { getClassInfoById, getSpecIconUrl } from "@/lib/utils";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";

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
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBoss, setSelectedBoss] = useState<Boss | null>(null);

  const [filters, setFilters] = useState<Filters>({
    limit: 50,
    page: 1,
    role: "dps",
  });

  useEffect(() => {
    const fetchBosses = async () => {
      try {
        const bossesData = await api.getBosses(44);
        setBosses(bossesData);
      } catch (error) {
        console.error("Error fetching bosses:", error);
      }
    };
    fetchBosses();
  }, []);

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
  }, [filters]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-300">{error}</div>;

  return (
    <div className="container mx-auto px-3 md:px-4 max-w-full md:max-w-[95%] lg:max-w-[90%]">
      <div className="grid grid-cols-2 gap-4 mb-4 max-w-[50%]">
        {/* Boss Select */}
        <Listbox
          value={selectedBoss}
          onChange={(boss) => {
            setSelectedBoss(boss);
            setFilters((prev) => ({ ...prev, encounterId: boss?.id }));
          }}
        >
          <div className="relative">
            <ListboxButton className="relative w-full cursor-default rounded-md bg-gray-800 py-2 pl-3 pr-10 text-left text-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm">
              {selectedBoss ? (
                <div className="flex items-center gap-2">
                  <IconImage
                    iconFilename={selectedBoss.iconUrl}
                    alt={`${selectedBoss.name} icon`}
                    width={24}
                    height={24}
                  />
                  {selectedBoss.name}
                </div>
              ) : (
                "All bosses"
              )}
            </ListboxButton>
            <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
              <ListboxOption
                key={0}
                value={null}
                className={({ active }) =>
                  `relative cursor-default select-none py-2 pl-10 pr-4 ${
                    active ? "bg-blue-600 text-white" : "text-gray-300"
                  }`
                }
              >
                {({ selected }) => (
                  <div className="flex items-center gap-2">
                    All bosses
                    {selected && (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-400">
                        ✓
                      </span>
                    )}
                  </div>
                )}
              </ListboxOption>
              {bosses.map((boss) => (
                <ListboxOption
                  key={boss.id}
                  value={boss}
                  className={({ active }) =>
                    `relative cursor-default select-none py-2 pl-10 pr-4 ${
                      active ? "bg-blue-600 text-white" : "text-gray-300"
                    }`
                  }
                >
                  {({ selected }) => (
                    <div className="flex items-center gap-2">
                      <IconImage
                        iconFilename={boss.iconUrl}
                        alt={`${boss.name} icon`}
                        width={24}
                        height={24}
                      />
                      {boss.name}
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-400">
                          ✓
                        </span>
                      )}
                    </div>
                  )}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </div>
        </Listbox>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-gray-700">
            <th className="py-2 px-4">Rank</th>
            <th className="py-2 px-4">Name</th>
            <th className="py-2 px-4">specName</th>
            <th className="py-2 px-4">raw dmg</th>
            <th className="py-2 px-4">All star points for encounter</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-700">
              <td className="py-2 px-4">{i + 1}</td>
              <td className="py-2 px-4 flex gap-4 items-center">
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    position: "relative",
                  }}
                >
                  <IconImage
                    iconFilename={`
                      ${
                        row.context.specName
                          ? getSpecIconUrl(
                              row.character.classID,
                              row.context.specName,
                            )
                          : getClassInfoById(row.character.classID)?.iconUrl
                      }`.trim()}
                    alt={`${row.character.name} icon`}
                    fill
                    style={{ objectFit: "cover" }}
                  />
                </div>
                {row.character.name}
              </td>
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
