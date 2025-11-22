import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import logger from "../utils/logger";

export class IconCacheService {
  private readonly iconsDir: string;

  constructor() {
    // Store icons in a public directory
    this.iconsDir = path.join(__dirname, "../../public/icons");

    // Create icons directory if it doesn't exist
    this.ensureIconsDirectory();
  }

  /**
   * Ensure the icons directory exists
   */
  private ensureIconsDirectory(): void {
    if (!fs.existsSync(this.iconsDir)) {
      fs.mkdirSync(this.iconsDir, { recursive: true });
      logger.info(`📁 Created icons directory: ${this.iconsDir}`);
    }
  }

  /**
   * Generate a filename from the Blizzard icon URL
   */
  private getFilenameFromUrl(blizzardUrl: string): string {
    // Extract the filename from the URL
    // Example: https://render.worldofwarcraft.com/us/icons/56/achievement_boss_blackhand.jpg
    const urlParts = blizzardUrl.split("/");
    const filename = urlParts[urlParts.length - 1];
    return filename;
  }

  /**
   * Check if icon already exists locally
   */
  private iconExists(filename: string): boolean {
    const filePath = path.join(this.iconsDir, filename);
    return fs.existsSync(filePath);
  }

  /**
   * Download an icon from Blizzard and save it locally
   * Returns just the filename (not full URL)
   */
  public async downloadAndCacheIcon(blizzardIconUrl: string): Promise<string> {
    const filename = this.getFilenameFromUrl(blizzardIconUrl);

    // If icon already exists, return just the filename
    if (this.iconExists(filename)) {
      logger.info(`✅ Icon already cached: ${filename}`);
      return filename;
    }

    try {
      logger.info(`📥 Downloading icon: ${filename}`);

      // Download the icon from Blizzard
      const response = await fetch(blizzardIconUrl);

      if (!response.ok) {
        throw new Error(`Failed to download icon: ${response.statusText}`);
      }

      // Get the image buffer
      const buffer = await response.buffer();

      // Save to local filesystem
      const filePath = path.join(this.iconsDir, filename);
      fs.writeFileSync(filePath, buffer);

      logger.info(`✅ Icon downloaded and cached: ${filename}`);
      return filename;
    } catch (error: any) {
      logger.error(`Error downloading icon ${filename}:`, error.message);
      // Return empty string on failure - frontend can handle fallback
      return "";
    }
  }

  /**
   * Batch download multiple icons with delay to avoid overwhelming the server
   * Returns map of Blizzard URL -> filename
   */
  public async downloadAndCacheIcons(blizzardIconUrls: string[], delayMs: number = 50): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (let i = 0; i < blizzardIconUrls.length; i++) {
      const blizzardUrl = blizzardIconUrls[i];
      const filename = await this.downloadAndCacheIcon(blizzardUrl);
      results.set(blizzardUrl, filename);

      // Add a small delay between downloads (except for the last one)
      if (i < blizzardIconUrls.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }
}

export default new IconCacheService();
