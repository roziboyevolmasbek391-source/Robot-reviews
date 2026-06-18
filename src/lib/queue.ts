import Queue from "bull";
import { createClient } from "redis";

const isBuild = process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";
const redisUrl = isBuild ? "" : process.env.REDIS_URL || (process.env.NODE_ENV === "development" ? "redis://127.0.0.1:6379" : "");

function createQueue(name: string) {
  if (redisUrl) {
    return new Queue(name, redisUrl);
  }

  return {
    add: async () => {
      throw new Error("REDIS_URL is not configured");
    },
    process: () => undefined,
    on: () => undefined,
    close: async () => undefined,
  } as unknown as Queue.Queue;
}

/**
 * Redis Client
 */
export const redisClient = createClient({
  url: redisUrl || "redis://127.0.0.1:6379",
});

redisClient.on("error", (err) => {
  console.error("Redis Error:", err);
});

/**
 * Safe connect (prevents "client is closed")
 */
export async function initRedis() {
  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured");
  }

  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

/**
 * Bull Queues (use same Redis URL)
 */
export const publishQueue = createQueue("publish");
export const validationQueue = createQueue("validation");
export const verificationQueue = createQueue("verification");
export const reconnectQueue = createQueue("reconnect");

/**
 * Queue error handlers
 */
publishQueue.on("error", (err) => {
  console.error("Publish Queue Error:", err);
});

validationQueue.on("error", (err) => {
  console.error("Validation Queue Error:", err);
});

verificationQueue.on("error", (err) => {
  console.error("Verification Queue Error:", err);
});

reconnectQueue.on("error", (err) => {
  console.error("Reconnect Queue Error:", err);
});

/**
 * Default queue config
 */
export const queueConfig = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  removeOnComplete: true,
  removeOnFail: false,
};
