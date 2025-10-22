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
    // Intermission (without number) -> I
    .replace(/Intermission\b/gi, "I");

  return formatted;
}
