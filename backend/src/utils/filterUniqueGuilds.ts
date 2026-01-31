// Removes duplicate guilds by name, realm, and region
import { TrackedGuild } from "../config/guilds";

export function filterUniqueGuilds(guilds: TrackedGuild[]): TrackedGuild[] {
  const seen = new Set<string>();
  return guilds.filter((guild) => {
    const key = `${guild.name.toLowerCase()}|${guild.realm.toLowerCase()}|${guild.region.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
