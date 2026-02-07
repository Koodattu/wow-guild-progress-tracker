"use client";

import type { Boss, CharacterRankingRow, ClassInfo } from "@/types";
import type { ColumnDef } from "@/types/index";
import { use, useCallback, useMemo, useRef, useState } from "react";
import { Table } from "./Table";
import IconImage from "./IconImage";
import {
  formatSpecName,
  getAllClasses,
  getClassInfoById,
  getSpecIconUrl,
} from "@/lib/utils";
import {
  getPatchPartitionOptions,
  type PatchPartitionOption,
} from "@/lib/patch-partitions";
import { Selector } from "./Selector";
import { useTranslations } from "next-intl";

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

type RankingFilters = {
  encounterId?: number;
  classId?: number | null;
  specName?: string | null;
  partition?: number | null;
  page?: number;
};

type ClassSpecSelectorProps = {
  selectedClass: ClassInfo | null;
  selectedSpec: string | null;
  allClassesLabel: string;
  onClassSelect: (classInfo: ClassInfo) => void;
  onSpecSelect: (classInfo: ClassInfo, specName: string) => void;
  onClear: () => void;
};

type ClassSpecButtonProps = {
  selectedClass: ClassInfo | null;
  selectedSpec: string | null;
  allClassesLabel: string;
  onToggle: () => void;
};

type ClassMenuProps = {
  classes: ClassInfo[];
  selectedClass: ClassInfo | null;
  selectedSpec: string | null;
  hoveredClass: ClassInfo | null;
  allClassesLabel: string;
  onHoverClass: (classInfo: ClassInfo) => void;
  onClear: () => void;
  onClassSelect: (classInfo: ClassInfo) => void;
  onSpecSelect: (classInfo: ClassInfo, specName: string) => void;
  onMenuEnter: () => void;
  onMenuLeave: () => void;
};

type SpecMenuProps = {
  classInfo: ClassInfo;
  selectedSpec: string | null;
  onSpecSelect: (classInfo: ClassInfo, specName: string) => void;
  onMenuEnter: () => void;
  onMenuLeave: () => void;
};

type UseHoverMenuOptions = {
  closeDelayMs?: number;
};

function getSelectedIcon(
  selectedClass: ClassInfo | null,
  selectedSpec: string | null,
) {
  if (!selectedClass) return null;
  if (!selectedSpec) return `${selectedClass.iconUrl}.jpg`;
  return (
    getSpecIconUrl(selectedClass.id, selectedSpec) ??
    `${selectedClass.iconUrl}.jpg`
  );
}

function useHoverMenu({ closeDelayMs = 250 }: UseHoverMenuOptions = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredClass, setHoveredClass] = useState<ClassInfo | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimeoutRef.current = window.setTimeout(() => {
      setHoveredClass(null);
      setIsOpen(false);
      closeTimeoutRef.current = null;
    }, closeDelayMs);
  }, [cancelClose, closeDelayMs]);

  const closeMenu = useCallback(() => {
    cancelClose();
    setHoveredClass(null);
    setIsOpen(false);
  }, [cancelClose]);

  const toggleMenu = useCallback(() => {
    setIsOpen((open) => !open);
  }, []);

  return {
    isOpen,
    hoveredClass,
    setHoveredClass,
    toggleMenu,
    closeMenu,
    cancelClose,
    scheduleClose,
  };
}

function ClassSpecButton({
  selectedClass,
  selectedSpec,
  allClassesLabel,
  onToggle,
}: ClassSpecButtonProps) {
  const icon = getSelectedIcon(selectedClass, selectedSpec);
  const label = selectedSpec
    ? formatSpecName(selectedSpec)
    : (selectedClass?.name ?? allClassesLabel);

  return (
    <button
      type="button"
      onClick={onToggle}
      className="relative w-full min-h-[40px] cursor-default rounded-md bg-gray-800 py-2 pl-3 pr-10 text-left text-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm font-bold"
    >
      <div className="flex items-center gap-3">
        {icon ? (
          <div style={{ width: "22px", height: "22px", position: "relative" }}>
            <IconImage
              iconFilename={icon}
              alt={selectedSpec ?? selectedClass?.name ?? "All classes"}
              fill
              style={{ objectFit: "cover" }}
            />
          </div>
        ) : null}
        <span className="font-bold">{label}</span>
      </div>
    </button>
  );
}

function SpecMenu({
  classInfo,
  selectedSpec,
  onSpecSelect,
  onMenuEnter,
  onMenuLeave,
}: SpecMenuProps) {
  const sortedSpecs = useMemo(
    () =>
      [...classInfo.specs].sort((a, b) =>
        formatSpecName(a.name).localeCompare(formatSpecName(b.name)),
      ),
    [classInfo.specs],
  );

  return (
    <div
      className="absolute left-full top-0 z-30 ml-2 min-w-[220px] rounded-md bg-gray-900 py-2 shadow-xl ring-1 ring-black ring-opacity-30"
      onMouseEnter={onMenuEnter}
      onMouseLeave={onMenuLeave}
    >
      {sortedSpecs.map((spec) => {
        const specLabel = formatSpecName(spec.name);
        const isSelected = selectedSpec === spec.name;
        return (
          <button
            key={spec.name}
            type="button"
            onClick={() => onSpecSelect(classInfo, spec.name)}
            className={`flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-blue-600 hover:text-white ${
              isSelected ? "text-white" : "text-gray-300"
            } font-bold`}
          >
            <div
              style={{ width: "22px", height: "22px", position: "relative" }}
            >
              <IconImage
                iconFilename={
                  getSpecIconUrl(classInfo.id, spec.name) ??
                  `${classInfo.iconUrl}.jpg`
                }
                alt={`${classInfo.name} ${specLabel}`}
                fill
                style={{ objectFit: "cover" }}
              />
            </div>
            <span className="font-bold">{specLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

function ClassMenu({
  classes,
  selectedClass,
  selectedSpec,
  hoveredClass,
  allClassesLabel,
  onHoverClass,
  onClear,
  onClassSelect,
  onSpecSelect,
  onMenuEnter,
  onMenuLeave,
}: ClassMenuProps) {
  return (
    <div
      className="absolute z-20 mt-1 w-full rounded-md bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
      onMouseEnter={onMenuEnter}
      onMouseLeave={onMenuLeave}
    >
      <button
        type="button"
        onClick={onClear}
        className="relative flex w-full items-center gap-2 py-2 pl-10 pr-4 text-left text-gray-300 hover:bg-blue-600 hover:text-white font-bold"
      >
        {allClassesLabel}
      </button>
      {classes.map((classInfo) => {
        const isSelected = selectedClass?.id === classInfo.id;
        const isHovered = hoveredClass?.id === classInfo.id;
        return (
          <div
            key={classInfo.id}
            className="relative"
            onMouseEnter={() => onHoverClass(classInfo)}
          >
            <button
              type="button"
              onClick={() => onClassSelect(classInfo)}
              className={`relative flex w-full items-center gap-2 py-2 pl-10 pr-4 text-left hover:bg-blue-600 hover:text-white ${
                isSelected ? "text-white" : "text-gray-300"
              } font-bold`}
            >
              <div
                style={{ width: "22px", height: "22px", position: "relative" }}
              >
                <IconImage
                  iconFilename={`${classInfo.iconUrl}.jpg`}
                  alt={classInfo.name}
                  fill
                  style={{ objectFit: "cover" }}
                />
              </div>
              {classInfo.name}
            </button>

            {isHovered ? (
              <SpecMenu
                classInfo={classInfo}
                selectedSpec={isSelected ? selectedSpec : null}
                onSpecSelect={onSpecSelect}
                onMenuEnter={onMenuEnter}
                onMenuLeave={onMenuLeave}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ClassSpecSelector({
  selectedClass,
  selectedSpec,
  allClassesLabel,
  onClassSelect,
  onSpecSelect,
  onClear,
}: ClassSpecSelectorProps) {
  const classes = useMemo(
    () => [...getAllClasses()].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const menu = useHoverMenu();

  const handleClassSelect = useCallback(
    (classInfo: ClassInfo) => {
      onClassSelect(classInfo);
      menu.closeMenu();
    },
    [menu, onClassSelect],
  );

  const handleSpecSelect = useCallback(
    (classInfo: ClassInfo, specName: string) => {
      onSpecSelect(classInfo, specName);
      menu.closeMenu();
    },
    [menu, onSpecSelect],
  );

  const handleClear = useCallback(() => {
    onClear();
    menu.closeMenu();
  }, [menu, onClear]);

  return (
    <div
      className="relative w-full max-w-xs"
      onMouseEnter={menu.cancelClose}
      onMouseLeave={menu.scheduleClose}
    >
      <ClassSpecButton
        selectedClass={selectedClass}
        selectedSpec={selectedSpec}
        allClassesLabel={allClassesLabel}
        onToggle={menu.toggleMenu}
      />

      {menu.isOpen ? (
        <ClassMenu
          classes={classes}
          selectedClass={selectedClass}
          selectedSpec={selectedSpec}
          hoveredClass={menu.hoveredClass}
          allClassesLabel={allClassesLabel}
          onHoverClass={menu.setHoveredClass}
          onClear={handleClear}
          onClassSelect={handleClassSelect}
          onSpecSelect={handleSpecSelect}
          onMenuEnter={menu.cancelClose}
          onMenuLeave={menu.scheduleClose}
        />
      ) : null}
    </div>
  );
}

type BuildRankingColumnsOptions = {
  selectedBoss: Boss | null;
  currentPage: number;
  pageSize: number;
  t: (key: string) => string;
};

function buildRankingColumns({
  selectedBoss,
  currentPage,
  pageSize,
  t,
}: BuildRankingColumnsOptions): ColumnDef<CharacterRankingRow>[] {
  const isShowingDamage = selectedBoss !== null;

  return [
    {
      id: "rank",
      header: t("columnRank"),
      accessor: (_row: CharacterRankingRow, index: number) =>
        (currentPage - 1) * pageSize + index + 1,
      width: "w-16",
    },
    {
      id: "character",
      header: t("columnName"),
      width: "w-1/5",
      accessor: (row: CharacterRankingRow) => (
        <div className="flex gap-4 items-center">
          <div style={{ width: "24px", height: "24px", position: "relative" }}>
            <IconImage
              iconFilename={
                row.context.specName
                  ? getSpecIconUrl(row.character.classID, row.context.specName)
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
      header: t("columnIlvl"),
      accessor: (row: CharacterRankingRow) =>
        row.context.ilvl ? row.context.ilvl.toFixed(0) : "—",
      width: "w-4",
    },
    {
      id: "metric",
      header: isShowingDamage ? t("columnDps") : t("columnScore"),
      accessor: (row: CharacterRankingRow) => {
        const value = isShowingDamage
          ? row.stats.bestAmount?.toFixed(1)
          : row.stats.allStars?.points?.toFixed(1);
        if (!value) return "—";
        return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      },
    },
  ];
}

export function RankingTableWrapper({
  data,
  bosses,
  loading = false,
  error = null,
  pagination,
  onFiltersChange,
}: RankingTableWrapperProps) {
  const t = useTranslations("characterRankingsPage");
  const [selectedBoss, setSelectedBoss] = useState<Boss | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassInfo | null>(null);
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null);
  const [selectedPartition, setSelectedPartition] =
    useState<PatchPartitionOption | null>(null);
  const partitionOptions = getPatchPartitionOptions();

  const applyFilters = useCallback(
    (overrides: Partial<RankingFilters> = {}) => {
      onFiltersChange?.({
        encounterId: selectedBoss?.id,
        classId: selectedClass?.id ?? null,
        specName: selectedSpec,
        partition: selectedPartition?.value ?? null,
        page: 1,
        ...overrides,
      });
    },
    [
      onFiltersChange,
      selectedBoss?.id,
      selectedClass?.id,
      selectedPartition?.value,
      selectedSpec,
    ],
  );

  const handleBossChange = (boss: Boss | null) => {
    setSelectedBoss(boss);
    applyFilters({ encounterId: boss?.id, page: 1 });
  };

  const handleClassChange = (classInfo: ClassInfo) => {
    setSelectedClass(classInfo);
    setSelectedSpec(null);
    applyFilters({ classId: classInfo.id, specName: null, page: 1 });
  };

  const handleSpecSelect = (classInfo: ClassInfo, specName: string) => {
    setSelectedClass(classInfo);
    setSelectedSpec(specName);
    applyFilters({ classId: classInfo.id, specName, page: 1 });
  };

  const clearClassAndSpec = () => {
    setSelectedClass(null);
    setSelectedSpec(null);
    applyFilters({ classId: null, specName: null, page: 1 });
  };

  const handlePartitionChange = (partition: PatchPartitionOption | null) => {
    setSelectedPartition(partition);
    applyFilters({ partition: partition?.value ?? null, page: 1 });
  };

  const handlePageChange = (page: number) => {
    applyFilters({ page });
  };

  const columns = useMemo(() => {
    const currentPage = pagination?.currentPage ?? 1;
    const pageSize = pagination?.pageSize ?? 50;
    return buildRankingColumns({
      selectedBoss,
      currentPage,
      pageSize,
      t,
    });
  }, [pagination?.currentPage, pagination?.pageSize, selectedBoss, t]);

  const title = selectedBoss
    ? `${t("titleForBoss")} ${selectedBoss.name}`
    : t("titleAllStars");

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-950/30 px-4 py-3 text-red-200">
          {error}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <div className="flex gap-4 w-full">
          {/* Boss Selector */}
          <Selector
            items={bosses}
            selectedItem={selectedBoss}
            onChange={handleBossChange}
            placeholder={t("placeholderAllBosses")}
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
          <ClassSpecSelector
            selectedClass={selectedClass}
            selectedSpec={selectedSpec}
            allClassesLabel={t("allClasses")}
            onClassSelect={handleClassChange}
            onSpecSelect={handleSpecSelect}
            onClear={clearClassAndSpec}
          />

          {/* Patch Selector */}
          <Selector
            items={partitionOptions}
            selectedItem={selectedPartition}
            onChange={handlePartitionChange}
            placeholder={t("placeholderAllPatches")}
            renderButton={(partition) => <span>{partition?.label}</span>}
            renderOption={(partition) => <span>{partition.label}</span>}
          />
        </div>
      </div>

      <Table
        columns={columns}
        data={data}
        loading={loading}
        pagination={pagination}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
