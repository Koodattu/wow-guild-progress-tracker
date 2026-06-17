import { RaidInfo } from "@/types";

export function buildRaidOrderIndex(raids: RaidInfo[]) {
  return new Map(raids.map((raid, index) => [raid.id, index]));
}

export function compareRaidIdsByListOrder(a: number, b: number, raidOrderIndex: Map<number, number>) {
  const aIndex = raidOrderIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
  const bIndex = raidOrderIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
  return aIndex - bIndex || b - a;
}

export function compareRaidsByListOrder<T extends { id: number }>(a: T, b: T, raidOrderIndex: Map<number, number>) {
  return compareRaidIdsByListOrder(a.id, b.id, raidOrderIndex);
}
