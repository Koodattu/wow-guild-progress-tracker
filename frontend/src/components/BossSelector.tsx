"use client";

import type { Boss } from "@/types";
import IconImage from "./IconImage";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";

interface BossSelectorProps {
  bosses: Boss[];
  selectedBoss: Boss | null;
  onChange: (boss: Boss | null) => void;
}

export function BossSelector({
  bosses,
  selectedBoss,
  onChange,
}: BossSelectorProps) {
  return (
    <Listbox value={selectedBoss} onChange={onChange}>
      <div className="relative w-full max-w-xs">
        <ListboxButton className="relative w-full cursor-default rounded-md bg-gray-800 py-2 pl-3 pr-10 text-left text-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm">
          {selectedBoss ? (
            <div className="flex items-center gap-2">
              <IconImage
                iconFilename={selectedBoss.iconUrl}
                alt={`${selectedBoss.name} icon`}
                width={24}
                height={24}
              />
              {selectedBoss.name}
            </div>
          ) : (
            "All bosses"
          )}
        </ListboxButton>
        <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
          <ListboxOption
            value={null}
            className={({ active }) =>
              `relative cursor-default select-none py-2 pl-10 pr-4 ${
                active ? "bg-blue-600 text-white" : "text-gray-300"
              }`
            }
          >
            {({ selected }) => (
              <div className="flex items-center gap-2">
                All bosses
                {selected && (
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-400">
                    ✓
                  </span>
                )}
              </div>
            )}
          </ListboxOption>
          {bosses.map((boss) => (
            <ListboxOption
              key={boss.id}
              value={boss}
              className={({ active }) =>
                `relative cursor-default select-none py-2 pl-10 pr-4 ${
                  active ? "bg-blue-600 text-white" : "text-gray-300"
                }`
              }
            >
              {({ selected }) => (
                <div className="flex items-center gap-2">
                  <IconImage
                    iconFilename={boss.iconUrl}
                    alt={`${boss.name} icon`}
                    width={24}
                    height={24}
                  />
                  {boss.name}
                  {selected && (
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-400">
                      ✓
                    </span>
                  )}
                </div>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
