"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCharacterMechanics, useCharacterMechanicsOptions, useCharacterRankingOptions, useBosses, useCharacterRankings, useCharacterSearch } from "@/lib/queries";
import { RankingTableWrapper } from "@/components/RankingTableWrapper";
import CharacterRankingsRaidPartitionSelector, { type CharacterRankingsSelection } from "@/components/CharacterRankingsRaidPartitionSelector";
import IconImage from "@/components/IconImage";
import { getClassInfoById } from "@/lib/utils";
import type { CharacterSearchResult } from "@/types";

type Filters = {
  zoneId?: number;
  encounterId?: number;
  classId?: number | null;
  specName?: string | null;
  metric?: "dps" | "hps";
  page?: number;
  limit?: number;
  partition?: number | null;
  characterName?: string | null;
  guildName?: string | null;
  scoreType?: "combined" | "survival";
};

type CharacterTab = "rankings" | "mechanics" | "combined";

const CHARACTER_TABS: Array<{
  id: CharacterTab;
  label: string;
  title: string;
  description: string;
}> = [
  {
    id: "rankings",
    label: "Rankings",
    title: "Character Rankings",
    description: "Select a raid or a specific patch partition.",
  },
  {
    id: "mechanics",
    label: "Mechanics",
    title: "Mechanics",
    description: "Survival score by raid.",
  },
  {
    id: "combined",
    label: "Combined",
    title: "Combined Score",
    description: "Combined parse and survival score by raid.",
  },
];

function buildQuery(filters: Filters) {
  const sp = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function getCharacterHref(character: CharacterSearchResult) {
  return `/characters/${encodeURIComponent(character.realm)}/${encodeURIComponent(character.name)}?class=${encodeURIComponent(String(character.classID))}`;
}

function CharacterSearchCard() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const trimmedSearch = search.trim();
  const canSearch = debouncedSearch.trim().length >= 3;
  const { data, isFetching, error } = useCharacterSearch(debouncedSearch.trim(), canSearch);
  const characters = data?.characters ?? [];

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(trimmedSearch);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [trimmedSearch]);

  return (
    <section className="mb-4 ml-auto max-w-xl rounded-md bg-gray-900/80 px-3 py-3 shadow-lg shadow-black/20 ring-1 ring-white/10 md:px-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="min-w-0 md:w-72">
          <h2 className="text-sm font-semibold text-white">Find a character</h2>
          <p className="text-xs text-gray-500">Type at least 3 characters.</p>
        </div>
        <div className="relative min-w-0 flex-1">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setIsOpen(false), 120);
            }}
            placeholder="Search character name..."
            aria-label="Search character"
            className="h-10 w-full rounded bg-gray-950/70 px-3 text-sm text-white shadow-inner shadow-black/30 ring-1 ring-white/10 outline-none transition-[box-shadow,color] placeholder:text-gray-600 focus:ring-2 focus:ring-blue-400/60"
          />

          {isOpen && trimmedSearch.length > 0 && (
            <div className="absolute left-0 right-0 top-11 z-30 overflow-hidden rounded-md bg-gray-950 shadow-2xl shadow-black/50 ring-1 ring-white/10">
              {trimmedSearch.length < 3 ? (
                <div className="px-3 py-3 text-sm text-gray-500">Keep typing to search.</div>
              ) : isFetching ? (
                <div className="px-3 py-3 text-sm text-gray-400">Searching...</div>
              ) : error ? (
                <div className="px-3 py-3 text-sm text-red-300">Could not search characters.</div>
              ) : characters.length ? (
                <div className="max-h-96 overflow-y-auto py-1">
                  {characters.map((character) => {
                    const classInfo = getClassInfoById(character.classID);
                    const displayName = character.matchedName ?? character.name;
                    const displayRealm = character.matchedRealm ?? character.realm;
                    const isAlias = displayName !== character.name || displayRealm !== character.realm;
                    return (
                      <Link
                        key={`${character.wclCanonicalCharacterId}-${character.classID}-${displayRealm}-${displayName}`}
                        href={getCharacterHref(character)}
                        className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm text-gray-200 transition-[background-color,color] hover:bg-blue-500/15 hover:text-white"
                      >
                        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded shadow-sm shadow-black/40 ring-1 ring-white/10">
                          <IconImage iconFilename={classInfo.iconUrl} alt={classInfo.name} fill style={{ objectFit: "cover" }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{displayName}</div>
                          <div className="truncate text-xs text-gray-500">
                            {displayRealm}
                            {character.guild ? ` - ${character.guild.name}` : ""}
                          </div>
                          {isAlias ? (
                            <div className="truncate text-xs text-gray-600">
                              Current: {character.name} - {character.realm}
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-xs text-gray-600">{classInfo.name}</div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-3 text-sm text-gray-500">No characters found.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function CharacterRankingsPage() {
  const [activeTab, setActiveTab] = useState<CharacterTab>("rankings");
  const [selectedRaidPartition, setSelectedRaidPartition] = useState<CharacterRankingsSelection | null>(null);
  const [filters, setFilters] = useState<Filters>({
    limit: 100,
    page: 1,
  });

  // ─── React Query hooks ───────────────────────────────────────────────────────

  const isMechanicsBackedTab = activeTab === "mechanics" || activeTab === "combined";
  const activeTabConfig = CHARACTER_TABS.find((tab) => tab.id === activeTab) ?? CHARACTER_TABS[0];
  const { data: rankingOptionsData, isLoading: rankingOptionsLoading, error: rankingOptionsError } = useCharacterRankingOptions();
  const { data: mechanicsOptionsData, isLoading: mechanicsOptionsLoading, error: mechanicsOptionsError } = useCharacterMechanicsOptions();
  const optionsData = isMechanicsBackedTab ? (mechanicsOptionsData ?? rankingOptionsData) : rankingOptionsData;
  const optionsLoading = isMechanicsBackedTab ? mechanicsOptionsLoading && !rankingOptionsData : rankingOptionsLoading;
  const optionsError = isMechanicsBackedTab ? (mechanicsOptionsError ?? rankingOptionsError) : rankingOptionsError;
  const { data: bosses = [] } = useBosses(selectedRaidPartition?.zoneId ?? null);

  const queryFilters = useMemo<Filters>(() => {
    if (!isMechanicsBackedTab) return filters;
    const scoreType: Filters["scoreType"] = activeTab === "mechanics" ? "survival" : "combined";
    return { ...filters, partition: undefined, scoreType };
  }, [activeTab, filters, isMechanicsBackedTab]);
  const queryString = useMemo(() => buildQuery(queryFilters), [queryFilters]);
  const rankingsEnabled = activeTab === "rankings" && !!filters.zoneId;
  const mechanicsEnabled = isMechanicsBackedTab && !!filters.zoneId;
  const { data: rankingsData, isLoading: rankingsLoading, error: rankingsError } = useCharacterRankings(queryString, rankingsEnabled);
  const { data: mechanicsData, isLoading: mechanicsLoading, error: mechanicsError } = useCharacterMechanics(queryString, mechanicsEnabled);

  // ─── Derived state ───────────────────────────────────────────────────────────

  const raidOptions = optionsData?.raids ?? [];
  const activeData = isMechanicsBackedTab ? mechanicsData : rankingsData;
  const rows = activeData?.data ?? [];
  const pagination = activeData?.pagination ?? {
    totalItems: 0,
    totalRankedItems: 0,
    totalPages: 0,
    currentPage: 1,
    pageSize: 100,
  };
  const loading = optionsLoading || (isMechanicsBackedTab ? mechanicsLoading : rankingsLoading);
  const error = optionsError?.message ?? (isMechanicsBackedTab ? mechanicsError?.message : rankingsError?.message) ?? null;

  // ─── Initialize selection from options ────────────────────────────────────────

  useEffect(() => {
    if (!optionsData) return;
    if (selectedRaidPartition && raidOptions.some((raid) => raid.id === selectedRaidPartition.zoneId)) return;

    const defaultSelection: CharacterRankingsSelection = {
      zoneId: optionsData.defaultSelection.zoneId,
      partition: optionsData.defaultSelection.partition,
    };

    setSelectedRaidPartition(defaultSelection);
    setFilters((prev) => ({
      ...prev,
      zoneId: defaultSelection.zoneId,
      partition: isMechanicsBackedTab ? undefined : defaultSelection.partition,
      page: 1,
    }));
  }, [isMechanicsBackedTab, optionsData, raidOptions, selectedRaidPartition]);

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  const handleRaidPartitionChange = (selection: CharacterRankingsSelection) => {
    setSelectedRaidPartition(selection);
    setFilters((prev) => ({
      ...prev,
      zoneId: selection.zoneId,
      partition: isMechanicsBackedTab ? undefined : selection.partition,
      encounterId: undefined,
      page: 1,
    }));
  };

  const handleTabChange = (tab: CharacterTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setFilters((prev) => ({
      ...prev,
      partition: tab === "rankings" ? (selectedRaidPartition?.partition ?? null) : undefined,
      encounterId: undefined,
      page: 1,
    }));
  };

  return (
    <div className="container mx-auto px-3 md:px-4 max-w-full md:max-w-[95%] lg:max-w-[90%] py-6">
      <CharacterSearchCard />

      <div className="mb-4 inline-flex rounded-md bg-gray-900/80 p-1 ring-1 ring-white/10">
        {CHARACTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={`min-h-10 rounded px-4 py-2 text-sm font-semibold transition-[background-color,color,transform] active:scale-[0.96] ${
              activeTab === tab.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">{activeTabConfig.title}</h1>
          <p className="text-gray-500 text-sm">{activeTabConfig.description}</p>
        </div>
        <CharacterRankingsRaidPartitionSelector
          raids={raidOptions}
          selected={selectedRaidPartition}
          onChange={handleRaidPartitionChange}
          label={isMechanicsBackedTab ? "Raid" : undefined}
          showPartitions={!isMechanicsBackedTab}
        />
      </div>

      <RankingTableWrapper
        key={`${activeTab}-${selectedRaidPartition?.zoneId ?? "none"}`}
        data={rows}
        bosses={bosses}
        variant={activeTab}
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
