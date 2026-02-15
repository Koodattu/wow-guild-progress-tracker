"use client";

import type { Boss, CharacterRankingRow, ClassInfo } from "@/types";
import type { ColumnDef } from "@/types/index";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Table } from "./Table";
import IconImage from "./IconImage";
import { formatSpecName, getAllClasses, getClassInfoById, getParseColor, getSpecIconUrl } from "@/lib/utils";
import { type PatchPartitionOption } from "@/lib/patch-partitions";
import { Selector } from "./Selector";
import { useTranslations } from "next-intl";

interface RankingTableWrapperProps {
  data: CharacterRankingRow[];
  bosses: Boss[];
  partitionOptions?: PatchPartitionOption[];
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
    characterName?: string | null;
    page?: number;
  }) => void;
}

type RankingFilters = {
  encounterId?: number;
  classId?: number | null;
  specName?: string | null;
  partition?: number | null;
  characterName?: string | null;
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

function getSelectedIcon(selectedClass: ClassInfo | null, selectedSpec: string | null) {
  if (!selectedClass) return null;
  if (!selectedSpec) return `${selectedClass.iconUrl}.jpg`;
  return getSpecIconUrl(selectedClass.id, selectedSpec) ?? `${selectedClass.iconUrl}.jpg`;
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

function ClassSpecButton({ selectedClass, selectedSpec, allClassesLabel, onToggle }: ClassSpecButtonProps) {
  const icon = getSelectedIcon(selectedClass, selectedSpec);
  const label = selectedSpec ? formatSpecName(selectedSpec) : (selectedClass?.name ?? allClassesLabel);

  return (
    <button
      type="button"
      onClick={onToggle}
      className="relative w-full min-h-10 cursor-default rounded-md bg-gray-800 py-2 pl-3 pr-10 text-left text-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm font-bold"
    >
      <div className="flex items-center gap-3">
        {icon ? (
          <div style={{ width: "22px", height: "22px", position: "relative" }}>
            <IconImage iconFilename={icon} alt={selectedSpec ?? selectedClass?.name ?? "All classes"} fill style={{ objectFit: "cover" }} />
          </div>
        ) : null}
        <span className="font-bold">{label}</span>
      </div>
    </button>
  );
}

function SpecMenu({ classInfo, selectedSpec, onSpecSelect, onMenuEnter, onMenuLeave }: SpecMenuProps) {
  const sortedSpecs = useMemo(() => [...classInfo.specs].sort((a, b) => formatSpecName(a.name).localeCompare(formatSpecName(b.name))), [classInfo.specs]);

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
            className={`flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-blue-600 hover:text-white ${isSelected ? "text-white" : "text-gray-300"} font-bold`}
          >
            <div style={{ width: "22px", height: "22px", position: "relative" }}>
              <IconImage
                iconFilename={getSpecIconUrl(classInfo.id, spec.name) ?? `${classInfo.iconUrl}.jpg`}
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
          <div key={classInfo.id} className="relative" onMouseEnter={() => onHoverClass(classInfo)}>
            <button
              type="button"
              onClick={() => onClassSelect(classInfo)}
              className={`relative flex w-full items-center gap-2 py-2 pl-10 pr-4 text-left hover:bg-blue-600 hover:text-white ${
                isSelected ? "text-white" : "text-gray-300"
              } font-bold`}
            >
              <div style={{ width: "22px", height: "22px", position: "relative" }}>
                <IconImage iconFilename={`${classInfo.iconUrl}.jpg`} alt={classInfo.name} fill style={{ objectFit: "cover" }} />
              </div>
              {classInfo.name}
            </button>

            {isHovered ? (
              <SpecMenu classInfo={classInfo} selectedSpec={isSelected ? selectedSpec : null} onSpecSelect={onSpecSelect} onMenuEnter={onMenuEnter} onMenuLeave={onMenuLeave} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ClassSpecSelector({ selectedClass, selectedSpec, allClassesLabel, onClassSelect, onSpecSelect, onClear }: ClassSpecSelectorProps) {
  const classes = useMemo(() => [...getAllClasses()].sort((a, b) => a.name.localeCompare(b.name)), []);
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
    <div className="relative w-full max-w-xs" onMouseEnter={menu.cancelClose} onMouseLeave={menu.scheduleClose}>
      <ClassSpecButton selectedClass={selectedClass} selectedSpec={selectedSpec} allClassesLabel={allClassesLabel} onToggle={menu.toggleMenu} />

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
  bosses: Boss[];
  currentPage: number;
  pageSize: number;
  selectedSpec: string | null;
  t: (key: string) => string;
};

function formatRealmSlug(realm: string) {
  return realm
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildRankingColumns({ selectedBoss, bosses, currentPage, pageSize, selectedSpec, t }: BuildRankingColumnsOptions): ColumnDef<CharacterRankingRow>[] {
  const isShowingDamage = selectedBoss !== null;
  const showIlvl = isShowingDamage;

  const columns: ColumnDef<CharacterRankingRow>[] = [
    {
      id: "rank",
      header: t("columnRank"),
      accessor: (_row: CharacterRankingRow, index: number) => (currentPage - 1) * pageSize + index + 1,
      shrink: true,
    },
    {
      id: "character",
      header: t("columnName"),
      shrink: true,
      align: "left",
      accessor: (row: CharacterRankingRow) => {
        const realm = row.character.realm;
        const name = row.character.name;
        const wclUrl = `https://www.warcraftlogs.com/character/eu/${encodeURIComponent(realm)}/${encodeURIComponent(name)}`;

        return (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div style={{ width: "24px", height: "24px", position: "relative" }}>
                <IconImage
                  iconFilename={row.context.specName ? getSpecIconUrl(row.character.classID, row.context.specName) : getClassInfoById(row.character.classID)?.iconUrl}
                  alt={row.character.name}
                  fill
                  style={{ objectFit: "cover" }}
                />
              </div>
              <span className="flex items-center gap-2">{row.character.name}</span>
            </div>
            <a
              href={wclUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`${row.character.name} on Warcraft Logs`}
              className="inline-flex items-center opacity-80 transition-opacity hover:opacity-100"
            >
              <Image src="/wcl-logo.png" alt="Warcraft Logs" width={18} height={18} />
            </a>
          </div>
        );
      },
    },
    {
      id: "guild",
      header: t("columnGuild"),
      shrink: true,
      accessor: (row: CharacterRankingRow) => {
        const guild = row.character.guild;
        if (!guild?.name || !guild?.realm) return "—";
        return `${guild.name} - ${formatRealmSlug(guild.realm)}`;
      },
    },
  ];

  if (showIlvl) {
    columns.push({
      id: "ilvl",
      header: t("columnIlvl"),
      accessor: (row: CharacterRankingRow) => (row.context.ilvl ? row.context.ilvl.toFixed(0) : "—"),
      shrink: true,
    });
  }

  columns.push({
    id: "metric",
    header: isShowingDamage ? t("columnDps") : t("columnScore"),
    shrink: true,
    accessor: (row: CharacterRankingRow) => {
      const value = isShowingDamage ? row.stats.bestAmount?.toFixed(1) : row.stats.allStars?.points?.toFixed(1);
      if (!value) return "—";
      return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },
  });

  // Per-boss rankPercent columns (only in all-bosses AllStars view)
  if (!isShowingDamage && bosses.length > 0) {
    for (const boss of bosses) {
      columns.push({
        id: `boss-${boss.id}`,
        header: (
          <div className="flex justify-center" title={boss.name}>
            <IconImage iconFilename={boss.iconUrl} alt={boss.name} width={24} height={24} className="rounded" />
          </div>
        ),
        shrink: true,
        accessor: (row: CharacterRankingRow) => {
          const bossScore = row.bossScores?.find((b) => b.encounterId === boss.id);
          if (!bossScore || !bossScore.rankPercent) return <span className="text-gray-600">—</span>;
          const pct = Math.round(bossScore.rankPercent);
          const showSpecIcon = !selectedSpec && bossScore.specName;
          const specIcon = showSpecIcon ? getSpecIconUrl(row.character.classID, bossScore.specName!) : null;
          return (
            <span className="inline-flex items-center gap-1" style={{ color: getParseColor(pct), fontWeight: 700 }}>
              {pct}
              {specIcon ? <IconImage iconFilename={specIcon} alt={bossScore.specName!} width={16} height={16} style={{ objectFit: "cover" }} /> : null}
            </span>
          );
        },
      });
    }
  }

  return columns;
}

export function RankingTableWrapper({ data, bosses, partitionOptions = [], loading = false, error = null, pagination, onFiltersChange }: RankingTableWrapperProps) {
  const t = useTranslations("characterRankingsPage");
  const [selectedBoss, setSelectedBoss] = useState<Boss | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassInfo | null>(null);
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null);
  const [selectedPartition, setSelectedPartition] = useState<PatchPartitionOption | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const searchInitializedRef = useRef(false);
  const searchDebounceRef = useRef<number | null>(null);
  const applyFiltersRef = useRef<(overrides?: Partial<RankingFilters>) => void>(() => undefined);

  const applyFilters = useCallback(
    (overrides: Partial<RankingFilters> = {}) => {
      onFiltersChange?.({
        encounterId: selectedBoss?.id,
        classId: selectedClass?.id ?? null,
        specName: selectedSpec,
        partition: selectedPartition?.value ?? null,
        characterName: searchValue.trim() || null,
        page: 1,
        ...overrides,
      });
    },
    [onFiltersChange, selectedBoss?.id, selectedClass?.id, selectedPartition?.value, selectedSpec, searchValue],
  );

  useEffect(() => {
    applyFiltersRef.current = applyFilters;
  }, [applyFilters]);

  useEffect(() => {
    if (!searchInitializedRef.current) {
      searchInitializedRef.current = true;
      return;
    }

    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = window.setTimeout(() => {
      applyFiltersRef.current({
        characterName: searchValue.trim() || null,
        page: 1,
      });
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [searchValue]);

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
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    applyFilters({ page });
  };

  const columns = useMemo(() => {
    const currentPage = pagination?.currentPage ?? 1;
    const pageSize = pagination?.pageSize ?? 50;
    return buildRankingColumns({
      selectedBoss,
      bosses,
      currentPage,
      pageSize,
      selectedSpec,
      t,
    });
  }, [pagination?.currentPage, pagination?.pageSize, selectedBoss, bosses, selectedSpec, t]);

  const title = selectedBoss ? `${t("titleForBoss")} ${selectedBoss.name}` : t("titleAllStars");

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-md border border-red-500/40 bg-red-950/30 px-4 py-3 text-red-200">{error}</div> : null}
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
                <IconImage iconFilename={boss?.iconUrl} alt={`${boss?.name} icon`} width={24} height={24} />
                {boss?.name}
              </div>
            )}
            renderOption={(boss) => (
              <>
                <IconImage iconFilename={boss.iconUrl} alt={`${boss.name} icon`} width={24} height={24} />
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

          {/* Character Search */}
          <div className="w-full max-w-xs">
            <input
              type="text"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              maxLength={64}
              placeholder={t("searchPlaceholder")}
              className="w-full min-h-10 rounded-md bg-gray-800 py-2 px-3 text-white shadow-md placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm font-bold"
            />
          </div>

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

      <Table columns={columns} data={data} loading={loading} pagination={pagination} onPageChange={handlePageChange} />
    </div>
  );
}
