// Format seconds to a readable time string
export function formatTime(seconds: number): string {
  if (seconds === 0) return "0m";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Get the full icon URL from filename
export function getIconUrl(iconFilename: string | undefined): string | undefined {
  if (!iconFilename) return undefined;

  // If it's already a full URL (for backwards compatibility), return as-is
  if (iconFilename.startsWith("http://") || iconFilename.startsWith("https://")) {
    return iconFilename;
  }

  // Otherwise construct URL from API base and filename
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  return `${apiUrl}/icons/${iconFilename}`;
}

// Format percentage
export function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

// Get difficulty color
export function getDifficultyColor(difficulty: "mythic" | "heroic"): string {
  return difficulty === "mythic" ? "text-orange-500" : "text-purple-500";
}

// Format event message
export function formatEventMessage(event: {
  type: string;
  guildName: string;
  bossName: string;
  difficulty: string;
  data: { pullCount?: number; bestPercent?: number; progressDisplay?: string };
}): string {
  const { type, guildName, bossName, difficulty, data } = event;

  if (type === "boss_kill") {
    const pulls = data.pullCount || 0;
    return `${guildName} defeated ${bossName} (${difficulty}) after ${pulls} pull${pulls !== 1 ? "s" : ""}!`;
  }

  if (type === "best_pull") {
    // Use progressDisplay if available (includes phase info), otherwise fall back to simple percent
    if (data.progressDisplay) {
      return `${guildName} reached ${formatPhaseDisplay(data.progressDisplay)} on ${bossName} (${difficulty})!`;
    }
    const percent = data.bestPercent || 0;
    return `${guildName} reached ${percent.toFixed(1)}% on ${bossName} (${difficulty})!`;
  }

  return `${guildName} - ${bossName}`;
}

// Get time ago string
export function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

// Generate WarcraftLogs URL for a kill
export function getKillLogUrl(reportCode: string, fightId: number): string {
  return `https://www.warcraftlogs.com/reports/${reportCode}#fight=${fightId}`;
}

// Format phase display string by shortening phase names
// Examples: "45.2% Stage One: XYZ" -> "45.2% P1", "67.8% Intermission 2: XYZ" -> "67.8% I2"
export function formatPhaseDisplay(displayString: string): string {
  if (!displayString) return displayString;

  // Remove everything after colons (e.g., "Stage One: XYZ" -> "Stage One")
  let formatted = displayString.replace(/:.*$/, "").trim();

  // Apply transformations
  formatted = formatted
    // Stage One -> P1, Stage Two -> P2, etc.
    .replace(/Stage One\b/gi, "P1")
    .replace(/Stage Two\b/gi, "P2")
    .replace(/Stage Three\b/gi, "P3")
    .replace(/Stage Four\b/gi, "P4")
    .replace(/Stage Five\b/gi, "P5")
    // Intermission 1 -> I1, Intermission 2 -> I2, etc.
    .replace(/Intermission (\d+)\b/gi, "I$1")
    .replace(/Intermission One\b/gi, "I1")
    .replace(/Intermission Two\b/gi, "I2")
    // Intermission (without number) -> I
    .replace(/Intermission\b/gi, "I");

  return formatted;
}

// Get Tailwind color class for WarcraftLogs rank colors
export function getWorldRankColor(color: string | undefined): string {
  if (!color) return "text-gray-400";

  switch (color.toLowerCase()) {
    case "legendary": // Orange/legendary
      return "text-orange-500";
    case "epic": // Purple
      return "text-purple-500";
    case "rare": // Blue
      return "text-blue-400";
    case "uncommon": // Green
      return "text-green-500";
    case "common": // White/gray
    default:
      return "text-gray-300";
  }
}

// Get Tailwind color class for leaderboard rank (1-5 orange, 6-20 purple, 21-50 blue, rest green)
export function getLeaderboardRankColor(rank: number): string {
  if (rank <= 5) return "text-orange-500"; // Legendary
  if (rank <= 20) return "text-purple-500"; // Epic
  if (rank <= 50) return "text-blue-400"; // Rare
  return "text-green-500"; // Uncommon
}

// Format guild name with parent guild if applicable
// Format: parent_guild (guild_name) - server_name
// Example: "IHAN SAMA (ST-Raid) - Stormreaver" or "Tuju - Kazzak" (no parent)
export function formatGuildName(guildName: string, realm: string, parentGuild?: string): string {
  if (parentGuild) {
    return `${parentGuild} (${guildName}) - ${realm}`;
  }
  return `${guildName} - ${realm}`;
}

// Generate guild profile URL from realm and name
export function getGuildProfileUrl(realm: string, name: string): string {
  const encodedRealm = encodeURIComponent(realm);
  const encodedName = encodeURIComponent(name);
  return `/guilds/${encodedRealm}/${encodedName}`;
}

// Generate Raider.IO guild URL
export function getRaiderIOGuildUrl(region: string, realm: string, guildName: string): string {
  const encodedRealm = encodeURIComponent(realm.toLowerCase().replace(/\s+/g, "-"));
  const encodedGuildName = encodeURIComponent(guildName);
  return `https://raider.io/guilds/${region.toLowerCase()}/${encodedRealm}/${encodedGuildName}`;
}
