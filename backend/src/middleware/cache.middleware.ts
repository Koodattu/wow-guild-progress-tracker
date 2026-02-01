import { Request, Response, NextFunction } from "express";
import cacheService from "../services/cache.service";

/**
 * Cache middleware factory for MongoDB-backed caching.
 *
 * Creates middleware that checks MongoDB cache before running the route handler.
 * On cache miss, intercepts the response and caches it to MongoDB.
 *
 * Note: All cache operations are async since they hit MongoDB.
 */
export function cacheMiddleware(getKey: (req: Request) => string, getTTL?: (req: Request) => number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Generate cache key for this request
      const cacheKey = getKey(req);

      // Try to get cached data from MongoDB (async operation)
      const cachedData = await cacheService.get(cacheKey);

      if (cachedData) {
        // Cache hit - return cached response immediately
        return res.json(cachedData);
      }

      // Cache miss - store the original res.json function
      const originalJson = res.json.bind(res);

      // Override res.json to cache the response before sending
      res.json = function (body: any): Response {
        // Determine TTL
        const ttl = getTTL ? getTTL(req) : undefined;

        // Cache the response data (async, but we don't wait for it)
        // This is fire-and-forget to avoid blocking the response
        cacheService.set(cacheKey, body, ttl).catch((error) => {
          // Log error but don't fail the response
          console.error(`Failed to cache response for ${cacheKey}:`, error);
        });

        // Send the response using the original function
        return originalJson(body);
      };

      // Continue to the route handler
      next();
    } catch (error) {
      // On cache error, continue to route handler without caching
      console.error("Cache middleware error:", error);
      next();
    }
  };
}

/**
 * Middleware to skip cache and force fresh data.
 * Useful for admin endpoints or when ?nocache=true query param is present.
 */
export function skipCacheMiddleware(req: Request, res: Response, next: NextFunction) {
  // Check if nocache query param is present
  if (req.query.nocache === "true") {
    // Override res.json to not cache
    const originalJson = res.json.bind(res);
    res.json = function (body: any): Response {
      return originalJson(body);
    };
  }
  next();
}
