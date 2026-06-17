#!/usr/bin/env node

import { publishQueue, validationQueue, reconnectQueue, verificationQueue } from "@/lib/queue";
import "@/lib/jobs/publish";

async function startWorker() {
  console.log("Starting queue worker...");

  // Set concurrency for each queue
  (publishQueue as any).process(5);
  (validationQueue as any).process(3);
  (reconnectQueue as any).process(2);
  (verificationQueue as any).process(2);

  // Event handlers
  publishQueue.on("completed", (job) => {
    console.log(`✓ Publish job ${job.id} completed`);
  });

  publishQueue.on("failed", (job, err) => {
    console.error(`✗ Publish job ${job.id} failed:`, err.message);
  });

  validationQueue.on("completed", (job) => {
    console.log(`✓ Validation job ${job.id} completed`);
  });

  reconnectQueue.on("completed", (job) => {
    console.log(`✓ Reconnect job ${job.id} completed`);
  });

  verificationQueue.on("completed", (job) => {
    console.log(`✓ Verification job ${job.id} completed`);
  });

  // Handle shutdown
  process.on("SIGTERM", async () => {
    console.log("SIGTERM received, shutting down gracefully...");
    await publishQueue.close();
    await validationQueue.close();
    await reconnectQueue.close();
    await verificationQueue.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("SIGINT received, shutting down gracefully...");
    await publishQueue.close();
    await validationQueue.close();
    await reconnectQueue.close();
    await verificationQueue.close();
    process.exit(0);
  });

  console.log("Queue worker started and listening for jobs...");
}

startWorker().catch((error) => {
  console.error("Failed to start worker:", error);
  process.exit(1);
});
