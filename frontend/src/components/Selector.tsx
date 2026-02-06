"use client";

import type { ReactNode } from "react";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";

interface SelectorProps<T> {
  items: T[];
  selectedItem: T | null;
  onChange: (item: T | null) => void;
  renderButton: (item: T | null) => ReactNode;
  renderOption: (item: T, selected: boolean) => ReactNode;
  placeholder?: string;
}

export function Selector<T>({
  items,
  selectedItem,
  onChange,
  renderButton,
  renderOption,
  placeholder = "Select...",
}: SelectorProps<T>) {
  return (
    <Listbox value={selectedItem} onChange={onChange}>
      <div className="relative w-full max-w-xs">
        <ListboxButton className="relative w-full min-h-[40px] cursor-default rounded-md bg-gray-800 py-2 pl-3 pr-10 text-left text-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm font-bold">
          {selectedItem ? renderButton(selectedItem) : placeholder}
        </ListboxButton>
        <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm font-bold">
          <ListboxOption
            value={null}
            className={({ active }) =>
              `relative cursor-default select-none py-2 pl-10 pr-4 font-bold ${
                active ? "bg-blue-600 text-white" : "text-gray-300"
              }`
            }
          >
            {({ selected }) => (
              <div className="flex items-center gap-2">
                {placeholder}
                {selected && (
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-400">
                    ✓
                  </span>
                )}
              </div>
            )}
          </ListboxOption>
          {items.map((item, idx) => (
            <ListboxOption
              key={idx}
              value={item}
              className={({ active }) =>
                `relative cursor-default select-none py-2 pl-10 pr-4 font-bold ${
                  active ? "bg-blue-600 text-white" : "text-gray-300"
                }`
              }
            >
              {({ selected }) => (
                <div className="flex items-center gap-2">
                  {renderOption(item, selected)}
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
