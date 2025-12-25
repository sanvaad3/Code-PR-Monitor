#!/usr/bin/env node
/**
 * Review Worker Startup Script
 *
 * This script starts the background worker that processes PR review jobs.
 * Run this in a separate process from your Next.js app.
 *
 * Usage:
 *   npm run worker
 *   # or
 *   node scripts/start-worker.js
 */

require("dotenv").config();
const {
  startReviewWorker,
  shutdownWorker,
} = require("../src/workers/review-worker");

// Validate environment variables
const requiredEnvVars = [
  "DATABASE_URL",
  "REDIS_URL",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
];

const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error("❌ Missing required environment variables:");
  missing.forEach((key) => console.error(`   - ${key}`));
  process.exit(1);
}

console.log("🔧 Environment validated");
console.log(`📅 Started at: ${new Date().toISOString()}\n`);

// Start the worker
const worker = startReviewWorker();

// Health check endpoint (optional - could be exposed via HTTP)
setInterval(() => {
  const stats = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    pid: process.pid,
  };

  console.log(`\n📊 Worker Stats (${new Date().toISOString()})`);
  console.log(
    `   Uptime: ${Math.floor(stats.uptime / 60)}m ${Math.floor(
      stats.uptime % 60
    )}s`
  );
  console.log(
    `   Memory: ${Math.round(
      stats.memory.heapUsed / 1024 / 1024
    )}MB / ${Math.round(stats.memory.heapTotal / 1024 / 1024)}MB`
  );
  console.log(`   PID: ${stats.pid}\n`);
}, 5 * 60 * 1000); // Every 5 minutes

// Graceful shutdown
async function shutdown(signal) {
  console.log(`\n\n${signal} received, shutting down gracefully...`);
  await shutdownWorker(worker);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Error handlers
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

console.log("✅ Worker is running. Press Ctrl+C to stop.\n");
