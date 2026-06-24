import { MongoClient, type Collection, type Db } from 'mongodb';
import { CONFIG } from './config.js';

let client: MongoClient | null = null;
let db: Db | null = null;
let usageCollection: Collection | null = null;

export async function initDb() {
  client = new MongoClient(CONFIG.mongoUri);
  await client.connect();
  db = client.db(CONFIG.mongoDb);
  usageCollection = db.collection('ai_usage');
  await usageCollection.createIndex({ createdAt: -1 });
  await usageCollection.createIndex({ runId: 1 });
  await usageCollection.createIndex({ feature: 1, createdAt: -1 });
}

export function getUsageCollection() {
  if (!usageCollection) throw new Error('MongoDB not initialized');
  return usageCollection;
}

export async function closeDb() {
  if (client) await client.close();
}
