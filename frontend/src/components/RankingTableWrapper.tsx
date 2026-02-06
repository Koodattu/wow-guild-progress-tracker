"use client";

import type { Boss, CharacterRankingRow, ClassInfo } from "@/types";
import type { ColumnDef } from "@/types/index";
import { useMemo, useState } from "react";
import { Table } from "./Table";
import { BossSelector } from "./BossSelector";
import IconImage from "./IconImage";
import { getClassInfoById, getSpecIconUrl } from "@/lib/utils";

interface RankingTableWrapperProps {
  data: CharacterRankingRow[];
  bosses: Boss[];
  classes: ClassInfo[];
  loading?: boolean;
  error?: string | null;
  pagination?: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  };
  onFiltersChange?: (filters: {
    encounterId?: number;
    classId?: number | null;
    specName?: string | null;
    page?: number;
  }) => void;
}

export function RankingTableWrapper({
  data,
  bosses,
  classes,
  loading = false,
  error = null,
  pagination,
  onFiltersChange,
}: RankingTableWrapperProps) {
  const [selectedBoss, setSelectedBoss] = useState<Boss | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null);

  const handleBossChange = (boss: Boss | null) => {
    setSelectedBoss(boss);
    onFiltersChange?.({
      encounterId: boss?.id,
      classId: selectedClassId,
      specName: selectedSpec,
      page: 1,
    });
  };

  const handleClassChange = (classId: number | null) => {
    setSelectedClassId(classId);
    onFiltersChange?.({
      encounterId: selectedBoss?.id,
      classId,
      specName: selectedSpec,
      page: 1,
    });
  };

  const handleSpecChange = (spec: string | null) => {
    setSelectedSpec(spec);
    onFiltersChange?.({
      encounterId: selectedBoss?.id,
      classId: selectedClassId,
      specName: spec,
      page: 1,
    });
  };

  const handlePageChange = (page: number) => {
    onFiltersChange?.({
      encounterId: selectedBoss?.id,
      classId: selectedClassId,
      specName: selectedSpec,
      page,
    });
  };

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

  const columns = useMemo(() => {
    const rankCol = getRankColumn(
      pagination?.currentPage ?? 1,
      pagination?.pageSize ?? 50,
    );
    const isShowingDamage = selectedBoss !== null;
    return isShowingDamage
      ? [rankCol, characterColumn, specColumn, damageColumn]
      : [rankCol, characterColumn, specColumn, allStarsColumn];
  }, [selectedBoss, pagination?.currentPage, pagination?.pageSize]);

  const title = selectedBoss
    ? `Rankings for ${selectedBoss.name}`
    : "All Star Rankings";

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-300">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <div className="flex flex-wrap gap-4">
          <BossSelector
            bosses={bosses}
            selectedBoss={selectedBoss}
            onChange={handleBossChange}
          />
        </div>
      </div>

      <Table
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={handlePageChange}
        rowKey={(row) => `${row.character.wclCanonicalCharacterId}`}
      />
    </div>
  );
}
