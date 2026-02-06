"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Boss, CharacterRankingRow, ClassInfo } from "@/types";
import { RankingTableWrapper } from "@/components/RankingTableWrapper";

type Filters = {
  encounterId?: number;
  classId?: number | null;
  specName?: string | null;
  role?: "dps" | "healer" | "tank";
  metric?: "dps" | "hps";
  page?: number;
  limit?: number;
  partition?: number | null;
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
  const [pagination, setPagination] = useState({
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    pageSize: 50,
  });

  const [filters, setFilters] = useState<Filters>({
    limit: 50,
    page: 1,
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
        const response = await api.getCharacterRankings(qs);
        setRows(response.data);
        setPagination(response.pagination);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [filters]);

  return (
    <div className="container mx-auto px-3 md:px-4 max-w-full md:max-w-[95%] lg:max-w-[90%] py-6">
      <RankingTableWrapper
        data={rows}
        bosses={bosses}
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
