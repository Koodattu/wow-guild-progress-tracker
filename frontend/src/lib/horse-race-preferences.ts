"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const HORSE_RACE_MODES = ["crest", "japanese", "uma", "off"] as const;

export type HorseRaceMode = (typeof HORSE_RACE_MODES)[number];

const STORAGE_KEY = "horse-race-mode";
const MODE_CHANGE_EVENT = "horse-race-mode-change";
const DEFAULT_MODE: HorseRaceMode = "crest";

function isHorseRaceMode(value: string | null): value is HorseRaceMode {
  return HORSE_RACE_MODES.includes(value as HorseRaceMode);
}

function readStoredMode(): HorseRaceMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isHorseRaceMode(stored) ? stored : DEFAULT_MODE;
}

function writeStoredMode(mode: HorseRaceMode) {
  window.localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent<HorseRaceMode>(MODE_CHANGE_EVENT, { detail: mode }));
}

export function getNextHorseRaceMode(mode: HorseRaceMode): HorseRaceMode {
  const currentIndex = HORSE_RACE_MODES.indexOf(mode);
  return HORSE_RACE_MODES[(currentIndex + 1) % HORSE_RACE_MODES.length];
}

export function useHorseRaceMode() {
  const [mode, setModeState] = useState<HorseRaceMode>(DEFAULT_MODE);
  const modeRef = useRef<HorseRaceMode>(DEFAULT_MODE);

  useEffect(() => {
    const storedMode = readStoredMode();
    modeRef.current = storedMode;
    setModeState(storedMode);

    const handleModeChange = (event: Event) => {
      const nextMode = (event as CustomEvent<HorseRaceMode>).detail;
      modeRef.current = nextMode;
      setModeState(nextMode);
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && isHorseRaceMode(event.newValue)) {
        modeRef.current = event.newValue;
        setModeState(event.newValue);
      }
    };

    window.addEventListener(MODE_CHANGE_EVENT, handleModeChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener(MODE_CHANGE_EVENT, handleModeChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const setMode = useCallback((nextMode: HorseRaceMode) => {
    modeRef.current = nextMode;
    setModeState(nextMode);
    writeStoredMode(nextMode);
  }, []);

  const cycleMode = useCallback(() => {
    const nextMode = getNextHorseRaceMode(modeRef.current);
    modeRef.current = nextMode;
    setModeState(nextMode);
    writeStoredMode(nextMode);
  }, []);

  return { mode, setMode, cycleMode };
}
