"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import IconImage from "./IconImage";
import type { CharacterRankingsRaidOption } from "@/types";

export type CharacterRankingsSelection = {
  zoneId: number;
  partition: number | null;
};

interface CharacterRankingsRaidPartitionSelectorProps {
  raids: CharacterRankingsRaidOption[];
  selected: CharacterRankingsSelection | null;
  onChange: (selection: CharacterRankingsSelection) => void;
}

function getExpansionIconPath(expansionName: string): string {
  const filename = expansionName.toLowerCase().replace(/\s+/g, "-");
  return `/expansions/${filename}.png`;
}

export default function CharacterRankingsRaidPartitionSelector({
  raids,
  selected,
  onChange,
}: CharacterRankingsRaidPartitionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const groupedRaids: Record<string, CharacterRankingsRaidOption[]> = {};
  const expansionOrder: string[] = [];

  raids.forEach((raid) => {
    if (!groupedRaids[raid.expansion]) {
      groupedRaids[raid.expansion] = [];
      expansionOrder.push(raid.expansion);
    }
    groupedRaids[raid.expansion].push(raid);
  });

  const selectedRaid = selected ? raids.find((raid) => raid.id === selected.zoneId) : null;
  const selectedPartition = selected && selected.partition !== null ? selectedRaid?.partitions.find((partition) => partition.id === selected.partition) : null;

  const selectedLabel = selectedRaid
    ? selectedPartition
      ? `${selectedRaid.name} - ${selectedPartition.name}`
      : `${selectedRaid.name} - All Patches`
    : "Select raid and patch";

  return (
    <div className="relative" ref={dropdownRef}>
      <label htmlFor="character-rankings-raid-partition-select" className="text-xs text-gray-400 mb-1 block">
        Raid and Patch
      </label>
      <button
        id="character-rankings-raid-partition-select"
        onClick={() => setIsOpen((open) => !open)}
        className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2 min-w-[380px] justify-between hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {selectedRaid?.iconUrl && <IconImage iconFilename={selectedRaid.iconUrl} alt={`${selectedRaid.name} icon`} width={24} height={24} className="rounded" />}
          <span className="truncate">{selectedLabel}</span>
        </div>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-96 overflow-y-auto">
          {expansionOrder.map((expansion) => (
            <div key={expansion}>
              <div className="px-3 py-2 text-xs font-semibold text-gray-400 bg-gray-900 sticky top-0 flex items-center gap-2">
                <span>{expansion}</span>
                <Image src={getExpansionIconPath(expansion)} alt={`${expansion} icon`} height={25} width={40} />
              </div>

              {groupedRaids[expansion].map((raid) => {
                const isRaidSelected = selected?.zoneId === raid.id && selected.partition === null;

                return (
                  <div key={raid.id} className="border-b border-gray-700/60 last:border-b-0">
                    <button
                      onClick={() => {
                        onChange({ zoneId: raid.id, partition: null });
                        setIsOpen(false);
                      }}
                      className={`w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${isRaidSelected ? "bg-gray-700" : ""}`}
                    >
                      <IconImage iconFilename={raid.iconUrl} alt={`${raid.name} icon`} width={22} height={22} className="rounded" />
                      <span className="font-semibold">{raid.name}</span>
                      <span className="text-xs text-gray-400">(All Patches)</span>
                    </button>

                    {raid.partitions.map((partition) => {
                      const isPartitionSelected = selected?.zoneId === raid.id && selected.partition === partition.id;

                      return (
                        <button
                          key={`${raid.id}-${partition.id}`}
                          onClick={() => {
                            onChange({ zoneId: raid.id, partition: partition.id });
                            setIsOpen(false);
                          }}
                          className={`w-full px-10 py-2 text-left hover:bg-gray-700/80 transition-colors text-sm flex items-center justify-between ${
                            isPartitionSelected ? "bg-gray-700/80" : ""
                          }`}
                        >
                          <span className="text-gray-300">{partition.name}</span>
                          <span className="text-[11px] text-gray-500">Patch {partition.id}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
