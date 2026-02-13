"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getPatchPartitionOptions } from "@/lib/patch-partitions";
import type { Boss, CharacterRankingRow } from "@/types";
import { RankingTableWrapper } from "@/components/RankingTableWrapper";

type Filters = {
  encounterId?: number;
  classId?: number | null;
  specName?: string | null;
  role?: "dps" | "healer" | "tank";
  page?: number;
  limit?: number;
  partition?: number | null;
  characterName?: string | null;
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
  const [partitionOptions, setPartitionOptions] = useState(
    getPatchPartitionOptions(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const [pagination, setPagination] = useState({
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    pageSize: 100,
  });

  const [filters, setFilters] = useState<Filters>({
    limit: 100,
    page: 1,
  });

  useEffect(() => {
    let isActive = true;
    const fetchBosses = async () => {
      try {
        const homeData = await api.getHomeData();
        const currentRaidId = homeData.raid?.id;
        if (!currentRaidId) return;
        const bossesData = await api.getBosses(currentRaidId);
        const raidData = await api.getRaid(currentRaidId);
        const partitionData = getPatchPartitionOptions(
          raidData.partitions || [],
        );
        if (!isActive) return;
        setBosses(bossesData);
        setPartitionOptions(partitionData);
      } catch (error) {
        console.error("Error fetching bosses:", error);
      }
    };
    fetchBosses();
    return () => {
      isActive = false;
    };
  }, []);

  const queryString = useMemo(() => buildQuery(filters), [filters]);

  useEffect(() => {
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
      <RankingTableWrapper
        data={rows}
        bosses={bosses}
        partitionOptions={partitionOptions}
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
