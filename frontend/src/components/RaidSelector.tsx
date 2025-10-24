"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Raid } from "@/types";

interface RaidSelectorProps {
  raids: Raid[];
  selectedRaidId: number | null;
  onRaidSelect: (raidId: number) => void;
}

export default function RaidSelector({ raids, selectedRaidId, onRaidSelect }: RaidSelectorProps) {
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
  const groupedRaids: { [expansion: string]: Raid[] } = {};
  const expansionOrder: string[] = [];

  raids.forEach((raid) => {
    if (!groupedRaids[raid.expansion]) {
      groupedRaids[raid.expansion] = [];
      expansionOrder.push(raid.expansion);
    }
    groupedRaids[raid.expansion].push(raid);
  });

  return (
    <div className="relative" ref={dropdownRef}>
      <label htmlFor="raid-select" className="text-xs text-gray-400 mb-1 block">
        Select Raid
      </label>
      <button
        id="raid-select"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2 min-w-[250px] justify-between hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          {selectedRaid?.iconUrl && <Image src={selectedRaid.iconUrl} alt="Raid icon" width={24} height={24} className="rounded" />}
          <span>{selectedRaid?.name || "Select a raid"}</span>
        </div>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-96 overflow-y-auto">
          {expansionOrder.map((expansion) => (
            <div key={expansion}>
              <div className="px-3 py-2 text-xs font-semibold text-gray-400 bg-gray-900 sticky top-0">{expansion}</div>
              {groupedRaids[expansion].map((raid) => (
                <button
                  key={raid.id}
                  onClick={() => {
                    onRaidSelect(raid.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors flex items-center gap-2 ${raid.id === selectedRaidId ? "bg-gray-700" : ""}`}
                >
                  {raid.iconUrl ? (
                    <Image src={raid.iconUrl} alt={`${raid.name} icon`} width={24} height={24} className="rounded" />
                  ) : (
                    <div className="w-6 h-6 bg-gray-600 rounded" />
                  )}
                  <span>{raid.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
