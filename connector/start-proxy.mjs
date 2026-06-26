// Start unified-ai-server (codex's DeepSeek proxy) on :8790 with the DeepSeek key
// read from Mongo at launch — the key lives only in this process's env, never on disk.
import { MongoClient } from "mongodb";
const c = new MongoClient("mongodb://127.0.0.1:27017");
await c.connect();
const a = await c.db("AthensDB").collection("account_info").findOne({ name: /Tracy/i });
await c.close();
process.env.DEEPSEEK_API_KEY = a.autoBidProfile.deepseekApiKey;
process.env.PORT = "8790";
process.env.MONGO_URL = "mongodb://127.0.0.1:27017";
process.env.MONGO_DB = "AthensDB";
await import("../unified-ai-server/dist/index.js");
