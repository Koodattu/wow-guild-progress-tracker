"use client";

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
    <div className="mb-6">
      {/* Compact Raid Grid Selector */}
      <div className="mb-3">
        <div className="flex flex-wrap gap-2">
          {expansionOrder.map((expansion) => (
            <div key={expansion} className="inline-flex items-center gap-2 px-2 py-1.5 border border-gray-700 rounded bg-gray-800/30">
              {/* Expansion Logo and Name */}
              <div className="flex items-center gap-1.5 pr-2 border-r border-gray-600">
                <Image src={getExpansionIconPath(expansion)} alt={`${expansion} icon`} height={14} width={22} className="opacity-60" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{expansion}</span>
              </div>

              {/* Raids for this expansion */}
              <div className="flex items-center gap-2">
                {groupedRaids[expansion].map((raid) => {
                  const raidIconUrl = getIconUrl(raid.iconUrl);
                  const isSelected = raid.id === selectedRaidId;

                  return (
                    <label
                      key={raid.id}
                      className={`inline-flex items-center gap-1.5 px-1.5 py-1 rounded border cursor-pointer transition-all whitespace-nowrap ${
                        isSelected ? "border-blue-500 bg-blue-900/20" : "border-gray-700 hover:border-gray-600 hover:bg-gray-800/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onRaidSelect(raid.id)}
                        className="w-3 h-3 rounded border-gray-600 text-blue-600 focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 bg-gray-700 cursor-pointer shrink-0"
                      />

                      {raidIconUrl && <Image src={raidIconUrl} alt={`${raid.name} icon`} width={18} height={18} className="rounded shrink-0" />}

                      <span className={`text-[10px] font-medium leading-tight ${isSelected ? "text-blue-300" : "text-gray-400"}`}>{raid.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Raid Display - Compact */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-700">
        <Image src={`/expansions/${expansionIconPath}.png`} alt={`${selectedRaid.expansion} icon`} height={32} width={51} />
        {iconUrl && <Image src={iconUrl} alt="Raid icon" width={40} height={40} className="rounded" />}
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">{selectedRaid.name}</h2>
          <div className="text-xs text-gray-400">
            {startDate} - {endDate}
          </div>
        </div>
      </div>
    </div>
  );
}
