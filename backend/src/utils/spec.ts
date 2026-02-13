import { ROLE_BY_CLASS_AND_SPEC, Role } from "../config/specs";

export function slugifySpecName(specName: string): string {
  return specName
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function resolveRole(classID: number, specName: string): Role {
  const slug = slugifySpecName(specName);
  const classMap = ROLE_BY_CLASS_AND_SPEC[classID];
  if (!classMap) return "dps";
  return classMap[slug] ?? "dps";
}
