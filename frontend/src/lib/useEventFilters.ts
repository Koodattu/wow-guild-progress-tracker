"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventFilters } from "@/types";

export const EVENT_TYPES = ["boss_kill", "best_pull", "hiatus", "regress", "reproge"] as const;
export const DIFFICULTIES = ["mythic", "heroic"] as const;

export type EventTypeFilter = (typeof EVENT_TYPES)[number];
export type DifficultyFilter = (typeof DIFFICULTIES)[number];

export interface EventFilterPreferences {
  selectedEventTypes: string[];
  selectedDifficulties: string[];
  selectedGuild: string;
}

const EVENT_TYPES_STORAGE_KEY = "event-types-filter";
const DIFFICULTIES_STORAGE_KEY = "event-difficulties-filter";
const GUILD_STORAGE_KEY = "event-guild-filter";
const EVENT_FILTERS_CHANGE_EVENT = "event-filters-change";

const DEFAULT_EVENT_FILTER_PREFERENCES: EventFilterPreferences = {
  selectedEventTypes: [...EVENT_TYPES],
  selectedDifficulties: [...DIFFICULTIES],
  selectedGuild: "",
};

function readStoredArray(key: string, allowedValues: readonly string[]) {
  const storedValue = window.localStorage.getItem(key);
  if (!storedValue) return [...allowedValues];

  try {
    const parsedValue = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) return [...allowedValues];

    const allowedSet = new Set(allowedValues);
    const filteredValues = parsedValue.filter((value): value is string => typeof value === "string" && allowedSet.has(value));
    return filteredValues.length > 0 ? filteredValues : [...allowedValues];
  } catch {
    return [...allowedValues];
  }
}

export function readEventFilterPreferences(): EventFilterPreferences {
  if (typeof window === "undefined") return DEFAULT_EVENT_FILTER_PREFERENCES;

  return {
    selectedEventTypes: readStoredArray(EVENT_TYPES_STORAGE_KEY, EVENT_TYPES),
    selectedDifficulties: readStoredArray(DIFFICULTIES_STORAGE_KEY, DIFFICULTIES),
    selectedGuild: window.localStorage.getItem(GUILD_STORAGE_KEY) ?? "",
  };
}

export function buildEventFilters(preferences: EventFilterPreferences): EventFilters {
  const filters: EventFilters = {};

  if (preferences.selectedEventTypes.length > 0 && preferences.selectedEventTypes.length < EVENT_TYPES.length) {
    filters.types = preferences.selectedEventTypes;
  }

  if (preferences.selectedDifficulties.length > 0 && preferences.selectedDifficulties.length < DIFFICULTIES.length) {
    filters.difficulties = preferences.selectedDifficulties;
  }

  if (preferences.selectedGuild) {
    filters.guildName = preferences.selectedGuild;
  }

  return filters;
}

function writeEventFilterPreferences(preferences: EventFilterPreferences) {
  window.localStorage.setItem(EVENT_TYPES_STORAGE_KEY, JSON.stringify(preferences.selectedEventTypes));
  window.localStorage.setItem(DIFFICULTIES_STORAGE_KEY, JSON.stringify(preferences.selectedDifficulties));

  if (preferences.selectedGuild) {
    window.localStorage.setItem(GUILD_STORAGE_KEY, preferences.selectedGuild);
  } else {
    window.localStorage.removeItem(GUILD_STORAGE_KEY);
  }

  window.dispatchEvent(new CustomEvent<EventFilterPreferences>(EVENT_FILTERS_CHANGE_EVENT, { detail: preferences }));
}

export function useEventFilterPreferences() {
  const [preferences, setPreferencesState] = useState<EventFilterPreferences>(DEFAULT_EVENT_FILTER_PREFERENCES);

  useEffect(() => {
    setPreferencesState(readEventFilterPreferences());

    const handlePreferencesChange = (event: Event) => {
      setPreferencesState((event as CustomEvent<EventFilterPreferences>).detail);
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === EVENT_TYPES_STORAGE_KEY || event.key === DIFFICULTIES_STORAGE_KEY || event.key === GUILD_STORAGE_KEY) {
        setPreferencesState(readEventFilterPreferences());
      }
    };

    window.addEventListener(EVENT_FILTERS_CHANGE_EVENT, handlePreferencesChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener(EVENT_FILTERS_CHANGE_EVENT, handlePreferencesChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const setEventTypes = useCallback((selectedEventTypes: string[]) => {
    const nextPreferences = { ...readEventFilterPreferences(), selectedEventTypes };
    setPreferencesState(nextPreferences);
    writeEventFilterPreferences(nextPreferences);
  }, []);

  const setDifficulties = useCallback((selectedDifficulties: string[]) => {
    const nextPreferences = { ...readEventFilterPreferences(), selectedDifficulties };
    setPreferencesState(nextPreferences);
    writeEventFilterPreferences(nextPreferences);
  }, []);

  const setSelectedGuild = useCallback((selectedGuild: string) => {
    const nextPreferences = { ...readEventFilterPreferences(), selectedGuild };
    setPreferencesState(nextPreferences);
    writeEventFilterPreferences(nextPreferences);
  }, []);

  const filters = useMemo(() => buildEventFilters(preferences), [preferences]);

  return { ...preferences, filters, setEventTypes, setDifficulties, setSelectedGuild };
}

export function useEventFiltersFromLocalStorage(): EventFilters {
  return useEventFilterPreferences().filters;
}
