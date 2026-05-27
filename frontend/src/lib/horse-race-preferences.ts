"use client";

import { useCallback, useEffect, useState } from "react";

export const HORSE_RACE_MODES = ["crest", "japanese", "uma", "off"] as const;

export type HorseRaceMode = (typeof HORSE_RACE_MODES)[number];
export interface HorseRacePreferences {
  mode: HorseRaceMode;
  showCharacters: boolean;
}

const MODE_STORAGE_KEY = "horse-race-mode";
const CHARACTERS_STORAGE_KEY = "horse-race-show-characters";
const PREFERENCES_CHANGE_EVENT = "horse-race-preferences-change";
const DEFAULT_MODE: HorseRaceMode = "crest";
const DEFAULT_SHOW_CHARACTERS = true;
const DEFAULT_PREFERENCES: HorseRacePreferences = {
  mode: DEFAULT_MODE,
  showCharacters: DEFAULT_SHOW_CHARACTERS,
};

function isHorseRaceMode(value: string | null): value is HorseRaceMode {
  return HORSE_RACE_MODES.includes(value as HorseRaceMode);
}

function readStoredPreferences(): HorseRacePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;

  const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
  const storedCharacters = window.localStorage.getItem(CHARACTERS_STORAGE_KEY);

  return {
    mode: isHorseRaceMode(storedMode) ? storedMode : DEFAULT_MODE,
    showCharacters: storedCharacters === null ? DEFAULT_SHOW_CHARACTERS : storedCharacters === "true",
  };
}

function writeStoredPreferences(preferences: HorseRacePreferences) {
  window.localStorage.setItem(MODE_STORAGE_KEY, preferences.mode);
  window.localStorage.setItem(CHARACTERS_STORAGE_KEY, String(preferences.showCharacters));
  window.dispatchEvent(new CustomEvent<HorseRacePreferences>(PREFERENCES_CHANGE_EVENT, { detail: preferences }));
}

export function getNextHorseRaceMode(mode: HorseRaceMode): HorseRaceMode {
  const currentIndex = HORSE_RACE_MODES.indexOf(mode);
  return HORSE_RACE_MODES[(currentIndex + 1) % HORSE_RACE_MODES.length];
}

export function useHorseRaceMode() {
  const [preferences, setPreferencesState] = useState<HorseRacePreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPreferencesState(readStoredPreferences());

    const handlePreferencesChange = (event: Event) => {
      setPreferencesState((event as CustomEvent<HorseRacePreferences>).detail);
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === MODE_STORAGE_KEY || event.key === CHARACTERS_STORAGE_KEY) {
        setPreferencesState(readStoredPreferences());
      }
    };

    window.addEventListener(PREFERENCES_CHANGE_EVENT, handlePreferencesChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener(PREFERENCES_CHANGE_EVENT, handlePreferencesChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const setMode = useCallback((nextMode: HorseRaceMode) => {
    const nextPreferences = { ...readStoredPreferences(), mode: nextMode };
    setPreferencesState(nextPreferences);
    writeStoredPreferences(nextPreferences);
  }, []);

  const setShowCharacters = useCallback((showCharacters: boolean) => {
    const nextPreferences = { ...readStoredPreferences(), showCharacters };
    setPreferencesState(nextPreferences);
    writeStoredPreferences(nextPreferences);
  }, []);

  const cycleMode = useCallback(() => {
    const currentPreferences = readStoredPreferences();
    const nextPreferences = { ...currentPreferences, mode: getNextHorseRaceMode(currentPreferences.mode) };
    setPreferencesState(nextPreferences);
    writeStoredPreferences(nextPreferences);
  }, []);

  return { ...preferences, setMode, setShowCharacters, cycleMode };
}
