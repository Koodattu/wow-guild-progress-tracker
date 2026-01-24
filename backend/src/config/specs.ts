export type Role = "dps" | "healer" | "tank";

export const ROLE_BY_CLASS_AND_SPEC: Record<number, Record<string, Role>> = {
  6: { blood: "tank", frost: "dps", unholy: "dps" },
  12: { havoc: "dps", vengeance: "tank" },
  11: { balance: "dps", feral: "dps", guardian: "tank", restoration: "healer" },
  13: { devastation: "dps", augmentation: "dps", preservation: "healer" },
  10: { brewmaster: "tank", windwalker: "dps", mistweaver: "healer" },
  2: { holy: "healer", protection: "tank", retribution: "dps" },
  5: { discipline: "healer", holy: "healer", shadow: "dps" },
  7: { elemental: "dps", enhancement: "dps", restoration: "healer" },
  1: { arms: "dps", fury: "dps", protection: "tank" },
  3: { "beast-mastery": "dps", marksmanship: "dps", survival: "dps" },
  8: { arcane: "dps", fire: "dps", frost: "dps" },
  4: { assassination: "dps", outlaw: "dps", subtlety: "dps" },
  9: { affliction: "dps", demonology: "dps", destruction: "dps" },
};
