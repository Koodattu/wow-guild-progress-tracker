import { Request, Response, NextFunction } from "express";
import cacheService from "../services/cache.service";

/**
 * Cache middleware factory
 * Creates middleware that caches responses based on a cache key generator
 */
export function cacheMiddleware(getKey: (req: Request) => string, getTTL?: (req: Request) => number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Generate cache key for this request
    const cacheKey = getKey(req);

    // Try to get cached data
    const cachedData = cacheService.get(cacheKey);

    if (cachedData) {
      // Cache hit - return cached response
      return res.json(cachedData);
    }

    // Cache miss - store the original res.json function
    const originalJson = res.json.bind(res);

    // Override res.json to cache the response before sending
    res.json = function (body: any): Response {
      // Determine TTL
      const ttl = getTTL ? getTTL(req) : undefined;

      // Cache the response data
      cacheService.set(cacheKey, body, ttl);

      // Send the response using the original function
      return originalJson(body);
    };

    // Continue to the route handler
    next();
  };
}

/**
 * Middleware to skip cache and force fresh data
 * Useful for admin endpoints or when ?nocache=true query param is present
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
