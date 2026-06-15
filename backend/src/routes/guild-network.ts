import { Router, Request, Response } from "express";
import guildNetworkService from "../services/guild-network.service";
import logger from "../utils/logger";

const router = Router();

router.get("/meta", async (_req: Request, res: Response) => {
  try {
    const meta = await guildNetworkService.getActiveMeta();
    if (!meta) {
      return res.status(404).json({ error: "Guild network snapshot has not been built yet" });
    }

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=300");
    res.setHeader("ETag", meta.etag);
    res.json(meta);
  } catch (error) {
    logger.error("Error fetching guild network metadata:", error);
    res.status(500).json({ error: "Failed to fetch guild network metadata" });
  }
});

router.get("/universe", async (req: Request, res: Response) => {
  try {
    const ifNoneMatch = typeof req.headers["if-none-match"] === "string" ? req.headers["if-none-match"] : undefined;
    const streamed = await guildNetworkService.streamActiveUniverse(ifNoneMatch, res);
    if (!streamed && !res.headersSent) {
      res.status(404).json({ error: "Guild network snapshot has not been built yet" });
    }
  } catch (error) {
    logger.error("Error streaming guild network universe:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch guild network universe" });
    } else {
      res.end();
    }
  }
});

export default router;
