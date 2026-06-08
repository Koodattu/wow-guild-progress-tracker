import Guild from "../models/Guild";
import characterService from "./character.service";

export type SearchResultType = "guild" | "character";

export type SearchResult = {
  name: string;
  realm: string;
  type: SearchResultType;
  href: string;
  classID?: number;
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class SearchService {
  async searchSite(query: string, requestedLimit = 5): Promise<SearchResult[]> {
    const trimmedQuery = query.trim();
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 5, 1), 5);

    if (trimmedQuery.length < 2) {
      return [];
    }

    const namePrefix = new RegExp(`^${escapeRegex(trimmedQuery)}`, "i");
    const perTypeLimit = limit;

    const [guilds, characters] = await Promise.all([
      Guild.find({ name: namePrefix }).sort({ name: 1, realm: 1 }).limit(perTypeLimit).select("name realm -_id").lean(),
      characterService.searchCharacters(trimmedQuery, perTypeLimit),
    ]);

    return [
      ...guilds.map((guild) => ({
        name: guild.name,
        realm: guild.realm,
        type: "guild" as const,
        href: `/guilds/${encodeURIComponent(guild.realm)}/${encodeURIComponent(guild.name)}`,
      })),
      ...characters.map((character) => ({
        name: character.matchedName ?? character.name,
        realm: character.matchedRealm ?? character.realm,
        type: "character" as const,
        href: `/characters/${encodeURIComponent(character.realm)}/${encodeURIComponent(character.name)}`,
        classID: character.classID,
      })),
    ]
      .sort((a, b) => a.name.localeCompare(b.name) || a.realm.localeCompare(b.realm) || a.type.localeCompare(b.type))
      .slice(0, limit);
  }
}

export default new SearchService();
