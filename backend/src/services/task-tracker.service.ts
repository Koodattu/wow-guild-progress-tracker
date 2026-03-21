import TaskLog, { ITaskLog, TaskStatus } from "../models/TaskLog";
import logger from "../utils/logger";

/**
 * Simple service to track scheduled/background task execution.
 * Records start, completion, and failure of tasks in MongoDB.
 */
class TaskTracker {
  /**
   * Record the start of a task. Returns the created document ID
   * so the caller can later mark it completed or failed.
   */
  async start(taskName: string, metadata?: Record<string, unknown>): Promise<string> {
    try {
      const doc = await TaskLog.create({
        taskName,
        status: "running" as TaskStatus,
        startedAt: new Date(),
        metadata,
      });
      return doc._id.toString();
    } catch (err) {
      logger.error(`[TaskTracker] Failed to record start for "${taskName}":`, err);
      return "";
    }
  }

  /**
   * Mark a task as completed.
   */
  async complete(taskId: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!taskId) return;
    try {
      const doc = await TaskLog.findById(taskId);
      if (!doc) return;

      const now = new Date();
      doc.status = "completed";
      doc.completedAt = now;
      doc.durationMs = now.getTime() - doc.startedAt.getTime();
      if (metadata) {
        doc.metadata = { ...doc.metadata, ...metadata };
      }
      await doc.save();
    } catch (err) {
      logger.error(`[TaskTracker] Failed to record completion for task ${taskId}:`, err);
    }
  }

  /**
   * Mark a task as failed.
   */
  async fail(taskId: string, error: string): Promise<void> {
    if (!taskId) return;
    try {
      const doc = await TaskLog.findById(taskId);
      if (!doc) return;

      const now = new Date();
      doc.status = "failed";
      doc.completedAt = now;
      doc.durationMs = now.getTime() - doc.startedAt.getTime();
      doc.error = error;
      await doc.save();
    } catch (err) {
      logger.error(`[TaskTracker] Failed to record failure for task ${taskId}:`, err);
    }
  }

  /**
   * Get recent task logs.
   */
  async getRecentLogs(limit: number = 50): Promise<ITaskLog[]> {
    return TaskLog.find().sort({ startedAt: -1 }).limit(limit).lean();
  }

  /**
   * Get the most recent execution of each unique task name.
   */
  async getLatestByTask(): Promise<ITaskLog[]> {
    return TaskLog.aggregate([
      { $sort: { startedAt: -1 } },
      {
        $group: {
          _id: "$taskName",
          doc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: { startedAt: -1 } },
    ]);
  }

  /**
   * Get summary stats.
   */
  async getStats(): Promise<{ running: number; completed: number; failed: number }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const counts = await TaskLog.aggregate([{ $match: { startedAt: { $gte: oneDayAgo } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]);

    const stats = { running: 0, completed: 0, failed: 0 };
    for (const c of counts) {
      if (c._id in stats) {
        stats[c._id as keyof typeof stats] = c.count;
      }
    }
    return stats;
  }
}

const taskTracker = new TaskTracker();
export default taskTracker;
