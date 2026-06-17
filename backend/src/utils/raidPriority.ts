import { CURRENT_RAID_IDS, PRIMARY_RAID_ID, TRACKED_RAIDS } from "../config/guilds";

type RaidLike = {
  id: number;
};

const getTrackedRaidIndex = (raidId: number) => {
  const index = TRACKED_RAIDS.indexOf(raidId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

const getCurrentRaidIndex = (raidId: number) => {
  const index = CURRENT_RAID_IDS.indexOf(raidId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

export const isPrimaryRaid = (raidId: number) => raidId === PRIMARY_RAID_ID;

export const isCurrentRaid = (raidId: number) => CURRENT_RAID_IDS.includes(raidId);

export const compareRaidIdsByPriority = (a: number, b: number) => {
  if (isPrimaryRaid(a) !== isPrimaryRaid(b)) {
    return isPrimaryRaid(a) ? -1 : 1;
  }

  if (isCurrentRaid(a) !== isCurrentRaid(b)) {
    return isCurrentRaid(a) ? -1 : 1;
  }

  if (isCurrentRaid(a) && isCurrentRaid(b)) {
    return getCurrentRaidIndex(a) - getCurrentRaidIndex(b);
  }

  const trackedRaidDiff = getTrackedRaidIndex(a) - getTrackedRaidIndex(b);
  return trackedRaidDiff !== 0 ? trackedRaidDiff : b - a;
};

export const compareRaidsByPriority = <T extends RaidLike>(a: T, b: T) => compareRaidIdsByPriority(a.id, b.id);

export const addRaidPriorityFlags = <T extends RaidLike>(raid: T): T & { isCurrent: boolean; isPrimary: boolean } => ({
  ...raid,
  isCurrent: isCurrentRaid(raid.id),
  isPrimary: isPrimaryRaid(raid.id),
});

export const addRaidPriorityFlagsAndSort = <T extends RaidLike>(raids: readonly T[]) => [...raids].map(addRaidPriorityFlags).sort(compareRaidsByPriority);
