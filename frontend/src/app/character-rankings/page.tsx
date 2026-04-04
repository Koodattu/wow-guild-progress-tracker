"use client";

import { useEffect, useMemo, useState } from "react";
import { useCharacterRankingOptions, useBosses, useCharacterRankings } from "@/lib/queries";
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
  const [selectedRaidPartition, setSelectedRaidPartition] = useState<CharacterRankingsSelection | null>(null);
  const [filters, setFilters] = useState<Filters>({
    limit: 100,
    page: 1,
  });

  // ─── React Query hooks ───────────────────────────────────────────────────────

  const { data: optionsData, isLoading: optionsLoading, error: optionsError } = useCharacterRankingOptions();
  const { data: bosses = [] } = useBosses(selectedRaidPartition?.zoneId ?? null);

  const queryString = useMemo(() => buildQuery(filters), [filters]);
  const rankingsEnabled = !!filters.zoneId;
  const { data: rankingsData, isLoading: rankingsLoading, error: rankingsError } = useCharacterRankings(queryString, rankingsEnabled);

  // ─── Derived state ───────────────────────────────────────────────────────────

  const raidOptions = optionsData?.raids ?? [];
  const rows = rankingsData?.data ?? [];
  const pagination = rankingsData?.pagination ?? {
    totalItems: 0,
    totalRankedItems: 0,
    totalPages: 0,
    currentPage: 1,
    pageSize: 100,
  };
  const loading = optionsLoading || rankingsLoading;
  const error = optionsError?.message ?? rankingsError?.message ?? null;

  // ─── Initialize selection from options ────────────────────────────────────────

  useEffect(() => {
    if (!optionsData || selectedRaidPartition) return;

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
  }, [optionsData, selectedRaidPartition]);

  // ─── Handlers ─────────────────────────────────────────────────────────────────

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
        onFiltersChange={(newFilters) => {
          setFilters((prev) => ({ ...prev, ...newFilters }));
        }}
      />
    </div>
  );
}
