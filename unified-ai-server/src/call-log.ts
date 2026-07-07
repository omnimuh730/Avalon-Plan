import { randomUUID } from 'node:crypto';
import {
  buildCallLogEntry,
  createCallLogRecorder,
  parseCorrelationHeaders,
} from '@nextoffer/shared/ai-usage';
import { getCallLogCollection } from './db.js';
import { addRunTokenTotal } from './usage.js';

let recorder: ReturnType<typeof createCallLogRecorder> | null = null;

function getRecorder() {
  if (!recorder) {
    try {
      recorder = createCallLogRecorder(getCallLogCollection());
    } catch {
      recorder = createCallLogRecorder(null);
    }
  }
  return recorder;
}

/**
 * Record one AI call to llm_call_log (does not touch legacy ai_usage).
 */
export async function recordCallLog({
  req,
  requestedModel,
  billedModel,
  provider,
  rawUsage,
  durationMs,
  success = true,
  httpStatus,
  error,
  feature: featureOverride,
  path,
}: {
  req?: { headers?: Record<string, string | string[] | undefined> };
  requestedModel: string;
  billedModel: string;
  provider: 'openai' | 'deepseek' | 'ollama';
  rawUsage: Record<string, unknown>;
  durationMs: number;
  success?: boolean;
  httpStatus?: number;
  error?: string;
  feature?: string;
  path?: string;
}) {
  const headers = req ? parseCorrelationHeaders(req) : {};
  const entry = buildCallLogEntry({
    requestId: headers.requestId || randomUUID(),
    service: 'unified-ai',
    feature: featureOverride || headers.feature || 'chat',
    provider,
    requestedModel,
    billedModel,
    rawUsage,
    durationMs,
    success,
    httpStatus,
    error,
    runId: headers.runId,
    applierName: headers.applierName,
    jobId: headers.jobId,
    path,
  });
  try {
    await getRecorder()(entry);
    if (headers.runId && entry.totalTokens) {
      addRunTokenTotal(headers.runId, entry.totalTokens as number);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[mongo] llm_call_log write failed requestId=${entry.requestId}: ${message}`);
  }
  return entry;
}
