"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Boss, CharacterRankingRow, CharacterRankingsRaidOption } from "@/types";
import { RankingTableWrapper } from "@/components/RankingTableWrapper";
import CharacterRankingsRaidPartitionSelector, { type CharacterRankingsSelection } from "@/components/CharacterRankingsRaidPartitionSelector";

type Filters = {
  zoneId?: number;
  encounterId?: number;
  classId?: number | null;
  specName?: string | null;
  role?: "dps" | "healer" | "tank" | null;
  page?: number;
  limit?: number;
  partition?: number | null;
  characterName?: string | null;
  guildName?: string | null;
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
  const [raidOptions, setRaidOptions] = useState<CharacterRankingsRaidOption[]>([]);
  const [selectedRaidPartition, setSelectedRaidPartition] = useState<CharacterRankingsSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const [pagination, setPagination] = useState({
    totalItems: 0,
    totalRankedItems: 0,
    totalPages: 0,
    currentPage: 1,
    pageSize: 100,
  });
  const [jumpTo, setJumpTo] = useState<{ rank: number; wclCanonicalCharacterId: number } | null>(null);

  const [filters, setFilters] = useState<Filters>({
    limit: 100,
    page: 1,
  });

  useEffect(() => {
    let isActive = true;
    const fetchRankingOptions = async () => {
      try {
        const optionsData = await api.getCharacterRankingOptions();
        if (!isActive) return;

        setRaidOptions(optionsData.raids || []);

        const defaultSelection: CharacterRankingsSelection = {
          zoneId: optionsData.defaultSelection.zoneId,
          partition: optionsData.defaultSelection.partition,
        };

        setSelectedRaidPartition(defaultSelection);
        setFilters((prev) => ({
          ...prev,
          zoneId: defaultSelection.zoneId,
          partition: defaultSelection.partition,
          page: 1,
        }));
      } catch (fetchError) {
        if (!isActive) return;
        setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch ranking options");
      }
    };

    fetchRankingOptions();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const zoneId = selectedRaidPartition?.zoneId;
    if (!zoneId) return;

    let isActive = true;
    const fetchBosses = async () => {
      try {
        const bossesData = await api.getBosses(zoneId);
        if (!isActive) return;
        setBosses(bossesData);
      } catch (fetchError) {
        if (!isActive) return;
        console.error("Error fetching bosses:", fetchError);
      }
    };

    fetchBosses();
    return () => {
      isActive = false;
    };
  }, [selectedRaidPartition?.zoneId]);

  const queryString = useMemo(() => buildQuery(filters), [filters]);

  const handleRaidPartitionChange = (selection: CharacterRankingsSelection) => {
    setSelectedRaidPartition(selection);
    setFilters((prev) => ({
      ...prev,
      zoneId: selection.zoneId,
      partition: selection.partition,
      encounterId: undefined,
      page: 1,
    }));
  };

  useEffect(() => {
    if (!filters.zoneId) return;

    const requestId = (requestIdRef.current += 1);
    let isActive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.getCharacterRankings(queryString);
        if (!isActive || requestId !== requestIdRef.current) return;
        setRows(response.data);
        setPagination(response.pagination);
        setJumpTo(response.jumpTo ?? null);
      } catch (e) {
        if (!isActive || requestId !== requestIdRef.current) return;
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!isActive || requestId !== requestIdRef.current) return;
        setLoading(false);
      }
    })();
    return () => {
      isActive = false;
    };
  }, [queryString]);

  return (
    <div className="container mx-auto px-3 md:px-4 max-w-full md:max-w-[95%] lg:max-w-[90%] py-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Character Rankings</h1>
          <p className="text-gray-500 text-sm">Select a raid or a specific patch partition.</p>
        </div>
        <CharacterRankingsRaidPartitionSelector raids={raidOptions} selected={selectedRaidPartition} onChange={handleRaidPartitionChange} />
      </div>

      <RankingTableWrapper
        key={`rankings-${selectedRaidPartition?.zoneId ?? "none"}`}
        data={rows}
        bosses={bosses}
        partitionOptions={[]}
        showPartitionSelector={false}
        loading={loading}
        error={error}
        pagination={pagination}
        jumpTo={jumpTo}
        onFiltersChange={(newFilters) => {
          setFilters((prev) => ({ ...prev, ...newFilters }));
        }}
      />
    </div>
  );
}
