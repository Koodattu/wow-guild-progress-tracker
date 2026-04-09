"use client";

import { useState } from "react";
import Cookies from "js-cookie";
import type { EventFilters } from "@/types";

const EVENT_TYPES = ["boss_kill", "best_pull", "hiatus", "regress", "reproge"] as const;
const DIFFICULTIES = ["mythic", "heroic"] as const;

/**
 * Reads event filters from cookies (same cookies used by the /events page).
 * Filters are read once on mount and remain stable for the component lifecycle.
 * When the component remounts (e.g., navigating back), fresh cookie values are read.
 */
export function useEventFiltersFromCookies(): EventFilters {
  const [filters] = useState<EventFilters>(() => {
    const f: EventFilters = {};

    const savedTypes = Cookies.get("event-types-filter");
    if (savedTypes) {
      try {
        const types: string[] = JSON.parse(savedTypes);
        if (types.length > 0 && types.length < EVENT_TYPES.length) {
          f.types = types;
        }
      } catch {
        // Invalid cookie value, ignore and use defaults (all types)
      }
    }

    const savedDifficulties = Cookies.get("event-difficulties-filter");
    if (savedDifficulties) {
      try {
        const difficulties: string[] = JSON.parse(savedDifficulties);
        if (difficulties.length > 0 && difficulties.length < DIFFICULTIES.length) {
          f.difficulties = difficulties;
        }
      } catch {
        // Invalid cookie value, ignore and use defaults (all difficulties)
      }
    }

    const savedGuild = Cookies.get("event-guild-filter");
    if (savedGuild) {
      f.guildName = savedGuild;
    }

    return f;
  });

  return filters;
}
