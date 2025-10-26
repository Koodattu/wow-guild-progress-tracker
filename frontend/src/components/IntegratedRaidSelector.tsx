"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { RaidInfo, RaidDates } from "@/types";
import { getIconUrl } from "@/lib/utils";

interface IntegratedRaidSelectorProps {
  raids: RaidInfo[];
  selectedRaidId: number | null;
  onRaidSelect: (raidId: number) => void;
  raidDates: RaidDates | null;
}

// Convert expansion name to filename format (lowercase, spaces to hyphens)
function getExpansionIconPath(expansionName: string): string {
  const filename = expansionName.toLowerCase().replace(/\s+/g, "-");
  return `/expansions/${filename}.png`;
}

export default function IntegratedRaidSelector({ raids, selectedRaidId, onRaidSelect, raidDates }: IntegratedRaidSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedRaid = raids.find((r) => r.id === selectedRaidId);

  // Group raids by expansion
  const groupedRaids: { [expansion: string]: RaidInfo[] } = {};
  const expansionOrder: string[] = [];

  raids.forEach((raid) => {
    if (!groupedRaids[raid.expansion]) {
      groupedRaids[raid.expansion] = [];
      expansionOrder.push(raid.expansion);
    }
    groupedRaids[raid.expansion].push(raid);
  });

  // Format dates (EU by default)
  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const startDate = formatDate(raidDates?.starts?.eu);
  const endDate = formatDate(raidDates?.ends?.eu);

  if (!selectedRaid) return null;

  const iconUrl = getIconUrl(selectedRaid.iconUrl);
  const expansionIconPath = selectedRaid.expansion.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="mb-4 relative" ref={dropdownRef}>
      {/* Clickable Raid Header */}
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer select-none hover:bg-gray-800/30 rounded-lg transition-all duration-200 p-3 -mx-3">
        {/* Expansion name and icon */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-bold text-gray-400">{selectedRaid.expansion}</span>
          <Image src={`/expansions/${expansionIconPath}.png`} alt={`${selectedRaid.expansion} icon`} height={20} width={32} />
        </div>

        {/* Raid name, icon, and dates */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {iconUrl && <Image src={iconUrl} alt="Raid icon" width={40} height={40} className="rounded" />}
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{selectedRaid.name}</h2>
              <svg className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Season dates */}
          <div className="text-right text-sm text-gray-400">
            <div>
              {startDate} - {endDate}
            </div>
          </div>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-2 left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-h-96 overflow-y-auto backdrop-blur-sm">
          {expansionOrder.map((expansion) => (
            <div key={expansion}>
              {/* Expansion Header */}
              <div className="px-4 py-2.5 text-xs font-bold text-gray-300 bg-gray-900 sticky top-0 flex items-center gap-2 border-b border-gray-700">
                <span>{expansion}</span>
                <Image src={getExpansionIconPath(expansion)} alt={`${expansion} icon`} height={20} width={32} />
              </div>

              {/* Raids in this expansion */}
              {groupedRaids[expansion].map((raid) => {
                const raidIconUrl = getIconUrl(raid.iconUrl);
                const isSelected = raid.id === selectedRaidId;

                return (
                  <button
                    key={raid.id}
                    onClick={() => {
                      onRaidSelect(raid.id);
                      setIsOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left transition-all duration-150 flex items-center gap-3 ${
                      isSelected ? "bg-blue-900/40 border-l-4 border-blue-500" : "hover:bg-gray-700/50 border-l-4 border-transparent"
                    }`}
                  >
                    {raidIconUrl && <Image src={raidIconUrl} alt={`${raid.name} icon`} width={32} height={32} className="rounded" />}
                    <span className={`font-medium ${isSelected ? "text-blue-300" : "text-gray-200"}`}>{raid.name}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
