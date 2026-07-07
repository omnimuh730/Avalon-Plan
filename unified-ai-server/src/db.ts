import { MongoClient, type Collection, type Db } from 'mongodb';
import { LLM_CALL_LOG_COLLECTION, ensureCallLogIndexes } from '@nextoffer/shared/ai-usage';
import { CONFIG } from './config.js';

let client: MongoClient | null = null;
let db: Db | null = null;
let usageCollection: Collection | null = null;
let callLogCollection: Collection | null = null;

export async function initDb() {
  client = new MongoClient(CONFIG.mongoUri);
  await client.connect();
  db = client.db(CONFIG.mongoDb);
  usageCollection = db.collection('ai_usage');
  await usageCollection.createIndex({ createdAt: -1 });
  await usageCollection.createIndex({ runId: 1 });
  await usageCollection.createIndex({ feature: 1, createdAt: -1 });

  callLogCollection = db.collection(LLM_CALL_LOG_COLLECTION);
  await ensureCallLogIndexes(callLogCollection);
}

export function getUsageCollection() {
  if (!usageCollection) throw new Error('MongoDB not initialized');
  return usageCollection;
}

export function getCallLogCollection() {
  if (!callLogCollection) throw new Error('MongoDB not initialized');
  return callLogCollection;
}

export async function closeDb() {
  if (client) await client.close();
}
