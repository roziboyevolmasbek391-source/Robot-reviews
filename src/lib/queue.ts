import Queue from "bull";
import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

/**
 * Redis Client
 */
export const redisClient = createClient({
  url: redisUrl,
});

redisClient.on("error", (err) => {
  console.error("Redis Error:", err);
});

/**
 * Safe connect (prevents "client is closed")
 */
export async function initRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

/**
 * Bull Queues (use same Redis URL)
 */
export const publishQueue = new Queue("publish", redisUrl);
export const validationQueue = new Queue("validation", redisUrl);
export const verificationQueue = new Queue("verification", redisUrl);
export const reconnectQueue = new Queue("reconnect", redisUrl);

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