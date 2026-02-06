"use client";

import type { Boss, CharacterRankingRow, ClassInfo } from "@/types";
import type { ColumnDef } from "@/types/index";
import { useMemo, useState } from "react";
import { Table } from "./Table";
import IconImage from "./IconImage";
import { getAllClasses, getClassInfoById, getSpecIconUrl } from "@/lib/utils";
import { Selector } from "./Selector";

interface RankingTableWrapperProps {
  data: CharacterRankingRow[];
  bosses: Boss[];
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
  loading = false,
  error = null,
  pagination,
  onFiltersChange,
}: RankingTableWrapperProps) {
  const [selectedBoss, setSelectedBoss] = useState<Boss | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassInfo | null>(null);
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null);
  const classes = getAllClasses();

  console.log(selectedClass);

  const handleBossChange = (boss: Boss | null) => {
    setSelectedBoss(boss);
    onFiltersChange?.({
      encounterId: boss?.id,
      classId: selectedClass?.id ?? null,
      specName: selectedSpec,
      page: 1,
    });
  };

  const handleClassChange = (classInfo: ClassInfo | null) => {
    setSelectedClass(classInfo);
    onFiltersChange?.({
      encounterId: selectedBoss?.id,
      classId: classInfo?.id ?? null,
      specName: selectedSpec,
      page: 1,
    });
  };

  const handleSpecChange = (spec: string | null) => {
    setSelectedSpec(spec);
    onFiltersChange?.({
      encounterId: selectedBoss?.id,
      classId: selectedClass?.id ?? null,
      specName: spec,
      page: 1,
    });
  };

  const handlePageChange = (page: number) => {
    onFiltersChange?.({
      encounterId: selectedBoss?.id,
      classId: selectedClass?.id ?? null,
      specName: selectedSpec,
      page,
    });
  };

  const columns = useMemo(() => {
    const currentPage = pagination?.currentPage ?? 1;
    const pageSize = pagination?.pageSize ?? 50;
    const isShowingDamage = selectedBoss !== null;

    return [
      {
        id: "rank",
        header: "Rank",
        accessor: (row: CharacterRankingRow, index: number) =>
          (currentPage - 1) * pageSize + index + 1,
        width: "w-16",
      },
      {
        id: "character",
        header: "Name",
        width: "w-1/5",
        accessor: (row: CharacterRankingRow) => (
          <div className="flex gap-4 items-center">
            <div
              style={{ width: "24px", height: "24px", position: "relative" }}
            >
              <IconImage
                iconFilename={
                  row.context.specName
                    ? getSpecIconUrl(
                        row.character.classID,
                        row.context.specName,
                      )
                    : getClassInfoById(row.character.classID)?.iconUrl
                }
                alt={row.character.name}
                fill
                style={{ objectFit: "cover" }}
              />
            </div>
            {row.character.name}
          </div>
        ),
      },
      {
        id: "ilvl",
        header: "Ilvl",
        accessor: (row: CharacterRankingRow) =>
          row.context.ilvl ? row.context.ilvl.toFixed(0) : "—",
        width: "w-4",
      },
      {
        id: "metric",
        header: isShowingDamage ? "DPS" : "Score",
        accessor: (row: CharacterRankingRow) =>
          isShowingDamage
            ? (row.stats.bestAmount?.toFixed(2) ?? "—")
            : (row.stats.allStars?.points?.toFixed(2) ?? "—"),
      },
    ] as ColumnDef<CharacterRankingRow>[];
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
        <div className="flex gap-4 w-full">
          {/* Boss Selector */}
          <Selector
            items={bosses}
            selectedItem={selectedBoss}
            onChange={handleBossChange}
            placeholder="All bosses"
            renderButton={(boss) => (
              <div className="flex items-center gap-2">
                <IconImage
                  iconFilename={boss?.iconUrl}
                  alt={`${boss?.name} icon`}
                  width={24}
                  height={24}
                />
                {boss?.name}
              </div>
            )}
            renderOption={(boss) => (
              <>
                <IconImage
                  iconFilename={boss.iconUrl}
                  alt={`${boss.name} icon`}
                  width={24}
                  height={24}
                />
                {boss.name}
              </>
            )}
          />

          {/* Class / Spec Selector */}
          <Selector
            items={classes}
            selectedItem={selectedClass}
            onChange={handleClassChange}
            placeholder="All classes"
            renderButton={(classInfo) => (
              <div className="flex items-center gap-2">
                <IconImage
                  iconFilename={`${classInfo?.iconUrl}.jpg`}
                  alt={classInfo?.name ?? "Class icon"}
                  width={24}
                  height={24}
                  style={{ objectFit: "cover" }}
                />
                {classInfo?.name}
              </div>
            )}
            renderOption={(classInfo) => (
              <div className="flex items-center gap-2">
                <IconImage
                  iconFilename={`${classInfo?.iconUrl}.jpg`}
                  alt={classInfo?.name ?? "Class icon"}
                  width={24}
                  height={24}
                  style={{ objectFit: "cover" }}
                />
                {classInfo?.name}
              </div>
            )}
          />
        </div>
      </div>

      <Table
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
