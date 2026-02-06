"use client";

import type { Boss, CharacterRankingRow, ClassInfo } from "@/types";
import type { ColumnDef } from "@/types/index";
import { useMemo, useRef, useState } from "react";
import { Table } from "./Table";
import IconImage from "./IconImage";
import { getAllClasses, getClassInfoById, getSpecIconUrl } from "@/lib/utils";
import {
  getPatchPartitionOptions,
  type PatchPartitionOption,
} from "@/lib/patch-partitions";
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
    partition?: number | null;
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
  const [isClassMenuOpen, setIsClassMenuOpen] = useState(false);
  const [hoveredClass, setHoveredClass] = useState<ClassInfo | null>(null);
  const classMenuCloseTimeout = useRef<number | null>(null);
  const [selectedPartition, setSelectedPartition] =
    useState<PatchPartitionOption | null>(null);
  const classes = getAllClasses();
  const partitionOptions = getPatchPartitionOptions();

  const handleBossChange = (boss: Boss | null) => {
    setSelectedBoss(boss);
    onFiltersChange?.({
      encounterId: boss?.id,
      classId: selectedClass?.id ?? null,
      specName: selectedSpec,
      partition: selectedPartition?.value ?? null,
      page: 1,
    });
  };

  const handleClassChange = (classInfo: ClassInfo | null) => {
    setSelectedClass(classInfo);
    setSelectedSpec(null);
    setIsClassMenuOpen(false);
    setHoveredClass(null);
    if (classMenuCloseTimeout.current) {
      window.clearTimeout(classMenuCloseTimeout.current);
      classMenuCloseTimeout.current = null;
    }
    onFiltersChange?.({
      encounterId: selectedBoss?.id,
      classId: classInfo?.id ?? null,
      specName: null,
      partition: selectedPartition?.value ?? null,
      page: 1,
    });
  };

  const handleSpecSelect = (classInfo: ClassInfo, specName: string) => {
    setSelectedClass(classInfo);
    setSelectedSpec(specName);
    setIsClassMenuOpen(false);
    setHoveredClass(null);
    if (classMenuCloseTimeout.current) {
      window.clearTimeout(classMenuCloseTimeout.current);
      classMenuCloseTimeout.current = null;
    }
    onFiltersChange?.({
      encounterId: selectedBoss?.id,
      classId: classInfo.id,
      specName,
      partition: selectedPartition?.value ?? null,
      page: 1,
    });
  };

  const clearClassAndSpec = () => {
    setSelectedClass(null);
    setSelectedSpec(null);
    setIsClassMenuOpen(false);
    setHoveredClass(null);
    if (classMenuCloseTimeout.current) {
      window.clearTimeout(classMenuCloseTimeout.current);
      classMenuCloseTimeout.current = null;
    }
    onFiltersChange?.({
      encounterId: selectedBoss?.id,
      classId: null,
      specName: null,
      partition: selectedPartition?.value ?? null,
      page: 1,
    });
  };

  const scheduleClassMenuClose = () => {
    if (classMenuCloseTimeout.current) {
      window.clearTimeout(classMenuCloseTimeout.current);
    }
    classMenuCloseTimeout.current = window.setTimeout(() => {
      setHoveredClass(null);
      setIsClassMenuOpen(false);
      classMenuCloseTimeout.current = null;
    }, 250);
  };

  const cancelClassMenuClose = () => {
    if (classMenuCloseTimeout.current) {
      window.clearTimeout(classMenuCloseTimeout.current);
      classMenuCloseTimeout.current = null;
    }
  };

  const handleSpecChange = (spec: string | null) => {
    setSelectedSpec(spec);
    onFiltersChange?.({
      encounterId: selectedBoss?.id,
      classId: selectedClass?.id ?? null,
      specName: spec,
      partition: selectedPartition?.value ?? null,
      page: 1,
    });
  };

  const handlePartitionChange = (partition: PatchPartitionOption | null) => {
    setSelectedPartition(partition);
    onFiltersChange?.({
      encounterId: selectedBoss?.id,
      classId: selectedClass?.id ?? null,
      specName: selectedSpec,
      partition: partition?.value ?? null,
      page: 1,
    });
  };

  const handlePageChange = (page: number) => {
    onFiltersChange?.({
      encounterId: selectedBoss?.id,
      classId: selectedClass?.id ?? null,
      specName: selectedSpec,
      partition: selectedPartition?.value ?? null,
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
        accessor: (row: CharacterRankingRow) => {
          const value = isShowingDamage
            ? row.stats.bestAmount?.toFixed(1)
            : row.stats.allStars?.points?.toFixed(1);
          if (!value) return "—";
          return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        },
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
          <div
            className="relative w-full max-w-xs"
            onMouseEnter={cancelClassMenuClose}
            onMouseLeave={scheduleClassMenuClose}
          >
            <button
              type="button"
              onClick={() => setIsClassMenuOpen((open) => !open)}
              className="relative w-full min-h-[40px] cursor-default rounded-md bg-gray-800 py-2 pl-3 pr-10 text-left text-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm font-bold"
            >
              <div className="flex items-center gap-3">
                {selectedClass ? (
                  <IconImage
                    iconFilename={
                      selectedSpec
                        ? (getSpecIconUrl(selectedClass.id, selectedSpec) ??
                          `${selectedClass.iconUrl}.jpg`)
                        : `${selectedClass.iconUrl}.jpg`
                    }
                    alt={selectedSpec ?? selectedClass.name}
                    width={24}
                    height={24}
                    style={{ objectFit: "cover" }}
                  />
                ) : null}
                <span className="font-bold">
                  {selectedSpec
                    ? selectedSpec.charAt(0).toUpperCase() +
                      selectedSpec.slice(1)
                    : (selectedClass?.name ?? "All classes")}
                </span>
              </div>
            </button>

            {isClassMenuOpen ? (
              <div
                className="absolute z-20 mt-1 w-full rounded-md bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
                onMouseEnter={cancelClassMenuClose}
                onMouseLeave={scheduleClassMenuClose}
              >
                <button
                  type="button"
                  onClick={clearClassAndSpec}
                  className="relative flex w-full items-center gap-2 py-2 pl-10 pr-4 text-left text-gray-300 hover:bg-blue-600 hover:text-white font-bold"
                >
                  All classes
                </button>
                {classes.map((classInfo) => (
                  <div
                    key={classInfo.id}
                    className="relative"
                    onMouseEnter={() => setHoveredClass(classInfo)}
                  >
                    <button
                      type="button"
                      onClick={() => handleClassChange(classInfo)}
                      className={`relative flex w-full items-center gap-2 py-2 pl-10 pr-4 text-left hover:bg-blue-600 hover:text-white ${
                        selectedClass?.id === classInfo.id
                          ? "text-white"
                          : "text-gray-300"
                      } font-bold`}
                    >
                      <IconImage
                        iconFilename={`${classInfo.iconUrl}.jpg`}
                        alt={classInfo.name}
                        width={24}
                        height={24}
                        style={{ objectFit: "cover" }}
                      />
                      {classInfo.name}
                    </button>

                    {hoveredClass?.id === classInfo.id ? (
                      <div
                        className="absolute left-full top-0 z-30 ml-2 min-w-[220px] rounded-md bg-gray-900 py-2 shadow-xl ring-1 ring-black ring-opacity-30"
                        onMouseEnter={cancelClassMenuClose}
                        onMouseLeave={scheduleClassMenuClose}
                      >
                        {classInfo.specs.map((spec) => {
                          const specLabel =
                            spec.name.charAt(0).toUpperCase() +
                            spec.name.slice(1);
                          return (
                            <button
                              key={spec.name}
                              type="button"
                              onClick={() =>
                                handleSpecSelect(classInfo, spec.name)
                              }
                              className={`flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-blue-600 hover:text-white ${
                                selectedClass?.id === classInfo.id &&
                                selectedSpec === spec.name
                                  ? "text-white"
                                  : "text-gray-300"
                              } font-bold`}
                            >
                              <IconImage
                                iconFilename={
                                  getSpecIconUrl(classInfo.id, spec.name) ??
                                  `${classInfo.iconUrl}.jpg`
                                }
                                alt={`${classInfo.name} ${specLabel}`}
                                width={22}
                                height={22}
                                style={{ objectFit: "cover" }}
                              />
                              <span className="font-bold">{specLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Patch Selector */}
          <Selector
            items={partitionOptions}
            selectedItem={selectedPartition}
            onChange={handlePartitionChange}
            placeholder="All patches"
            renderButton={(partition) => <span>{partition?.label}</span>}
            renderOption={(partition) => <span>{partition.label}</span>}
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
