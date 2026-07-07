import { MongoClient, type Collection } from 'mongodb';
import {
  LLM_CALL_LOG_COLLECTION,
  createCallLogRecorder,
  ensureCallLogIndexes,
} from '@nextoffer/shared/ai-usage';
import { serverConfig } from './config.js';

let client: MongoClient | null = null;
let callLogCollection: Collection | null = null;
let recordCallLog: ReturnType<typeof createCallLogRecorder> | null = null;

export async function initDb() {
  if (!serverConfig.mongoUri) {
    console.warn('[mongo] MONGO_URL not set — llm_call_log recording disabled');
    recordCallLog = createCallLogRecorder(null);
    return;
  }
  try {
    client = new MongoClient(serverConfig.mongoUri);
    await client.connect();
    const db = client.db(serverConfig.mongoDb);
    callLogCollection = db.collection(LLM_CALL_LOG_COLLECTION);
    await ensureCallLogIndexes(callLogCollection);
    recordCallLog = createCallLogRecorder(callLogCollection);
    console.log(`[mongo] connected — ${serverConfig.mongoDb}.${LLM_CALL_LOG_COLLECTION}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[mongo] connection failed — llm_call_log recording disabled: ${message}`);
    recordCallLog = createCallLogRecorder(null);
  }
}

export function getRecordCallLog() {
  if (!recordCallLog) recordCallLog = createCallLogRecorder(null);
  return recordCallLog;
}

export async function closeDb() {
  if (client) await client.close();
}
