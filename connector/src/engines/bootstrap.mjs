import { CONFIG } from "./config.mjs";
import { getAthensServerUrl } from "./athens-server.mjs";

// Align core-backend library with BFF Mongo settings before any db import.
if (!process.env.MONGODB_URI) process.env.MONGODB_URI = CONFIG.mongoUri;
if (!process.env.MONGODB_DB) process.env.MONGODB_DB = CONFIG.mongoDb;

// Warm-probe Athens-server so the first AI résumé job doesn't pay discovery latency.
getAthensServerUrl().catch(() => {});
