export type Role = "dps" | "healer" | "tank";

export const ROLE_BY_CLASS_AND_SPEC: Record<number, Record<string, Role>> = {
  1: { blood: "tank", frost: "dps", unholy: "dps" },
  2: { balance: "dps", feral: "dps", guardian: "tank", restoration: "healer" },
  3: { "beast-mastery": "dps", marksmanship: "dps", survival: "dps" },
  4: { arcane: "dps", fire: "dps", frost: "dps" },
  5: { brewmaster: "tank", mistweaver: "healer", windwalker: "dps" },
  6: { holy: "healer", protection: "tank", retribution: "dps" },
  7: { discipline: "healer", holy: "healer", shadow: "dps" },
  8: { assassination: "dps", outlaw: "dps", subtlety: "dps" },
  9: { elemental: "dps", enhancement: "dps", restoration: "healer" },
  10: { affliction: "dps", demonology: "dps", destruction: "dps" },
  11: { arms: "dps", fury: "dps", protection: "tank" },
  12: { havoc: "dps", vengeance: "tank" },
  13: { devastation: "dps", augmentation: "dps", preservation: "healer" },
};
