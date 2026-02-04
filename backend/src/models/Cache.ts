import mongoose, { Document, Schema } from "mongoose";

/**
 * Cache entry stored in MongoDB.
 *
 * Uses MongoDB TTL index for automatic expiration of entries.
 * The TTL index deletes documents based on the expiresAt field.
 *
 * Cache keys are API endpoint identifiers that uniquely identify
 * the cached response (e.g., "home:data", "progress:raid:44").
 */
export interface ICache extends Document {
  /** Unique cache key (e.g., "home:data", "progress:raid:44") */
  key: string;

  /** Cached response data (stored as BSON) */
  data: any;

  /** When this cache entry was created/updated */
  cachedAt: Date;

  /** When this cache entry should expire (used by MongoDB TTL index) */
  expiresAt: Date;

  /** When the cached data becomes completely unusable (beyond the stale-while-revalidate window) */
  staleExpiresAt?: Date;

  /** TTL in milliseconds (for reference, actual expiration handled by expiresAt) */
  ttlMs: number;

  /** API endpoint pattern this cache belongs to (for grouping/querying) */
  endpoint: string;
}

const CacheSchema = new Schema<ICache>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
    cachedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    // When the cached data becomes completely unusable (beyond the stale-while-revalidate window)
    staleExpiresAt: {
      type: Date,
      required: false,
    },
    ttlMs: {
      type: Number,
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: false, // We manage cachedAt manually
    collection: "api_cache", // Explicit collection name
  },
);

// TTL index - MongoDB will automatically delete documents when expiresAt is reached
// MongoDB checks TTL indexes every 60 seconds
CacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for efficient pattern-based queries
CacheSchema.index({ endpoint: 1, key: 1 });

export default mongoose.model<ICache>("Cache", CacheSchema);
