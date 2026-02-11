// Class and spec mappings with their roles
export interface SpecInfo {
  name: string;
  role: "tank" | "healer" | "dps";
}

export interface ClassInfo {
  id: number;
  name: string;
  iconUrl: string;
  specs: SpecInfo[];
}

export const CLASSES: ClassInfo[] = [
  {
    id: 1,
    name: "Death Knight",
    iconUrl: "classicon_deathknight",
    specs: [
      { name: "blood", role: "tank" },
      { name: "frost", role: "dps" },
      { name: "unholy", role: "dps" },
    ],
  },
  {
    id: 2,
    name: "Druid",
    iconUrl: "classicon_druid",
    specs: [
      { name: "balance", role: "dps" },
      { name: "feral", role: "dps" },
      { name: "guardian", role: "tank" },
      { name: "restoration", role: "healer" },
    ],
  },
  {
    id: 3,
    name: "Hunter",
    iconUrl: "classicon_hunter",
    specs: [
      { name: "beast-mastery", role: "dps" },
      { name: "marksmanship", role: "dps" },
      { name: "survival", role: "dps" },
    ],
  },
  {
    id: 4,
    name: "Mage",
    iconUrl: "classicon_mage",
    specs: [
      { name: "arcane", role: "dps" },
      { name: "fire", role: "dps" },
      { name: "frost", role: "dps" },
    ],
  },
  {
    id: 5,
    name: "Monk",
    iconUrl: "classicon_monk",
    specs: [
      { name: "brewmaster", role: "tank" },
      { name: "mistweaver", role: "healer" },
      { name: "windwalker", role: "dps" },
    ],
  },
  {
    id: 6,
    name: "Paladin",
    iconUrl: "classicon_paladin",
    specs: [
      { name: "holy", role: "healer" },
      { name: "protection", role: "tank" },
      { name: "retribution", role: "dps" },
    ],
  },
  {
    id: 7,
    name: "Priest",
    iconUrl: "classicon_priest",
    specs: [
      { name: "discipline", role: "healer" },
      { name: "holy", role: "healer" },
      { name: "shadow", role: "dps" },
    ],
  },
  {
    id: 8,
    name: "Rogue",
    iconUrl: "classicon_rogue",
    specs: [
      { name: "assassination", role: "dps" },
      { name: "outlaw", role: "dps" },
      { name: "subtlety", role: "dps" },
    ],
  },
  {
    id: 9,
    name: "Shaman",
    iconUrl: "classicon_shaman",
    specs: [
      { name: "elemental", role: "dps" },
      { name: "enhancement", role: "dps" },
      { name: "restoration", role: "healer" },
    ],
  },
  {
    id: 10,
    name: "Warlock",
    iconUrl: "classicon_warlock",
    specs: [
      { name: "affliction", role: "dps" },
      { name: "demonology", role: "dps" },
      { name: "destruction", role: "dps" },
    ],
  },
  {
    id: 11,
    name: "Warrior",
    iconUrl: "classicon_warrior",
    specs: [
      { name: "arms", role: "dps" },
      { name: "fury", role: "dps" },
      { name: "protection", role: "tank" },
    ],
  },
  {
    id: 12,
    name: "Demon Hunter",
    iconUrl: "classicon_demonhunter",
    specs: [
      { name: "havoc", role: "dps" },
      { name: "vengeance", role: "tank" },
    ],
  },
  {
    id: 13,
    name: "Evoker",
    iconUrl: "classicon_evoker",
    specs: [
      { name: "devastation", role: "dps" },
      { name: "preservation", role: "healer" },
      { name: "augmentation", role: "dps" },
    ],
  },
];

/**
 * Get role for a given class and spec.
 */
export function getSpecRole(
  classId: number,
  specName: string,
): "tank" | "healer" | "dps" {
  const classInfo = CLASSES.find((c) => c.id === classId);
  if (!classInfo) return "dps";

  const spec = classInfo.specs.find(
    (s) => s.name.toLowerCase() === specName.toLowerCase(),
  );
  return spec?.role ?? "dps";
}
