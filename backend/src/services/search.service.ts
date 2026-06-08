import Guild from "../models/Guild";
import characterService from "./character.service";

export type SearchResultType = "guild" | "character";

export type SearchResult = {
  name: string;
  realm: string;
  type: SearchResultType;
  href: string;
  classID?: number;
  guild?: {
    name: string;
    realm: string;
  } | null;
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class SearchService {
  async searchSite(query: string, requestedLimit = 5): Promise<SearchResult[]> {
    const trimmedQuery = query.trim();
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 5, 1), 5);

    if (trimmedQuery.length < 2) {
      return [];
    }

    const selectedValueResult = await this.findSelectedValueResult(trimmedQuery);
    if (selectedValueResult) {
      return [selectedValueResult];
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
        guild: character.guild ?? null,
      })),
    ]
      .sort((a, b) => a.name.localeCompare(b.name) || a.realm.localeCompare(b.realm) || a.type.localeCompare(b.type))
      .slice(0, limit);
  }

  private async findSelectedValueResult(query: string): Promise<SearchResult | null> {
    const separatorIndex = query.indexOf("-");
    if (separatorIndex <= 0 || separatorIndex === query.length - 1) {
      return null;
    }

    const name = query.slice(0, separatorIndex).trim();
    const realm = query.slice(separatorIndex + 1).trim();
    if (name.length < 2 || realm.length < 2) {
      return null;
    }

    const [guild, characterProfile] = await Promise.all([
      Guild.findOne({
        name: new RegExp(`^${escapeRegex(name)}$`, "i"),
        realm: new RegExp(`^${escapeRegex(realm)}$`, "i"),
      })
        .select("name realm -_id")
        .lean(),
      characterService.getCharacterProfileByRealmName(realm, name),
    ]);

    if (guild) {
      return {
        name: guild.name,
        realm: guild.realm,
        type: "guild",
        href: `/guilds/${encodeURIComponent(guild.realm)}/${encodeURIComponent(guild.name)}`,
      };
    }

    if (characterProfile?.type === "profile") {
      const latestGuild = [...characterProfile.character.guildHistory].sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())[0];
      return {
        name: characterProfile.character.name,
        realm: characterProfile.character.realm,
        type: "character",
        href: `/characters/${encodeURIComponent(characterProfile.character.realm)}/${encodeURIComponent(characterProfile.character.name)}`,
        classID: characterProfile.character.classID,
        guild: latestGuild ? { name: latestGuild.guildName, realm: latestGuild.guildRealm } : null,
      };
    }

    if (characterProfile?.type === "choices" && characterProfile.choices.length > 0) {
      const choice = characterProfile.choices[0];
      return {
        name: choice.name,
        realm: choice.realm,
        type: "character",
        href: `/characters/${encodeURIComponent(choice.realm)}/${encodeURIComponent(choice.name)}`,
        classID: choice.classID,
        guild: choice.latestGuild ?? null,
      };
    }

    return null;
  }
}

export default new SearchService();
