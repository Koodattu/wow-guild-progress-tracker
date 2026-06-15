import mongoose from "mongoose";
import logger from "../utils/logger";

const parseMongoOption = (name: string, fallback: number, allowZero = false): number => {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) ? value : fallback;
};

const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/wow_guild_tracker";

    await mongoose.connect(mongoUri, {
      maxPoolSize: parseMongoOption("MONGODB_MAX_POOL_SIZE", 20),
      minPoolSize: parseMongoOption("MONGODB_MIN_POOL_SIZE", 2),
      serverSelectionTimeoutMS: parseMongoOption("MONGODB_SERVER_SELECTION_TIMEOUT_MS", 10000),
      socketTimeoutMS: parseMongoOption("MONGODB_SOCKET_TIMEOUT_MS", 0, true),
    });

    logger.info("MongoDB connected successfully");
  } catch (error) {
    logger.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

export default connectDB;
