/**
 * Cooperative yielding utility for CPU-intensive loops.
 *
 * Calling `await yieldToEventLoop()` inside a tight loop gives the Node.js
 * event loop a chance to process pending I/O (including incoming HTTP requests)
 * before resuming the computation. This prevents long-running synchronous work
 * from starving the Express server.
 *
 * Usage:
 *   for (const item of largeArray) {
 *     doExpensiveWork(item);
 *     await yieldToEventLoop();
 *   }
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
