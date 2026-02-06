"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Boss, CharacterRankingRow } from "@/types";
import type { ColumnDef } from "@/types/index";
import IconImage from "@/components/IconImage";
import { getClassInfoById, getSpecIconUrl } from "@/lib/utils";
import { RankingTable } from "@/components/RankingTable";

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

const characterColumn: ColumnDef<CharacterRankingRow> = {
  id: "character",
  header: "Name",
  accessor: (row) => (
    <div className="flex gap-4 items-center">
      <div style={{ width: "24px", height: "24px", position: "relative" }}>
        <IconImage
          iconFilename={`
            ${
              row.context.specName
                ? getSpecIconUrl(row.character.classID, row.context.specName)
                : getClassInfoById(row.character.classID)?.iconUrl
            }
          `.trim()}
          alt={`${row.character.name} icon`}
          fill
          style={{ objectFit: "cover" }}
        />
      </div>
      {row.character.name}
    </div>
  ),
};

const specColumn: ColumnDef<CharacterRankingRow> = {
  id: "spec",
  header: "Spec",
  accessor: (row) => row.context.specName || "—",
};

const getRankColumn = (
  currentPage: number,
  pageSize: number,
): ColumnDef<CharacterRankingRow> => ({
  id: "rank",
  header: "Rank",
  accessor: (row, index) => (currentPage - 1) * pageSize + index + 1,
  width: "w-16",
});

const allStarsColumn: ColumnDef<CharacterRankingRow> = {
  id: "allstars",
  header: "All Star Points",
  accessor: (row) => row.stats.allStars?.points?.toFixed(2) ?? "—",
};

const damageColumn: ColumnDef<CharacterRankingRow> = {
  id: "dps",
  header: "DPS",
  accessor: (row) => row.stats.bestAmount?.toFixed(2) ?? "—",
};

export default function CharacterRankingsPage() {
  const [rows, setRows] = useState<CharacterRankingRow[]>([]);
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBoss, setSelectedBoss] = useState<Boss | null>(null);
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

  const isShowingDamage = selectedBoss !== null;
  const rankCol = getRankColumn(pagination.currentPage, pagination.pageSize);
  const allStarsColumns: ColumnDef<CharacterRankingRow>[] = [
    rankCol,
    characterColumn,
    specColumn,
    allStarsColumn,
  ];

  const damageColumns: ColumnDef<CharacterRankingRow>[] = [
    rankCol,
    characterColumn,
    specColumn,
    damageColumn,
  ];
  const columns = isShowingDamage ? damageColumns : allStarsColumns;
  const title = isShowingDamage
    ? `Rankings for ${selectedBoss?.name || "Boss"}`
    : "All Star Rankings";

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

  console.log(rows);

  return (
    <div className="container mx-auto px-3 md:px-4 max-w-full md:max-w-[95%] lg:max-w-[90%] py-6">
      <RankingTable
        columns={columns}
        data={rows}
        bosses={bosses}
        selectedBoss={selectedBoss}
        onBossChange={(boss) => {
          setSelectedBoss(boss);
          setFilters((prev) => ({ ...prev, encounterId: boss?.id, page: 1 }));
        }}
        title={title}
        loading={loading}
        error={error}
        pagination={pagination}
        onPageChange={(page) => {
          setFilters((prev) => ({ ...prev, page }));
        }}
      />
    </div>
  );
}
