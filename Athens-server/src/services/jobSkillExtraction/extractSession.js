/**
 * Manual, concurrency-limited AI skill-extraction session with immediate Stop.
 * Triggered from the Job Search "Extract skills" button. Mirrors the embedding
 * session pattern but runs several jobs at once and aborts in-flight LLM calls
 * on Stop so it halts within a second.
 */
import { randomUUID } from 'crypto';
import { jobsCollection } from '../../db/mongo.js';
import { formatCostUsd } from '../llm/llmService.js';
import { resolveExtractionAuth, extractAndPersistJob, recordExtractionFailure } from './aiExtractService.js';

// How many jobs to extract concurrently. Each is one LLM request, so this is
// the number of simultaneous in-flight DeepSeek calls (gateway/rate-limit
// permitting — chatCompletion backs off on 429/5xx).
const CONCURRENCY = Math.max(1, Number(process.env.JOB_SKILL_EXTRACT_CONCURRENCY || 100));
const PENDING_QUERY = { aiSkillStatus: 'pending' };
const CLAIM_PROJECTION = { title: 1, description: 1, jobDescription: 1, aiSkillAttempts: 1 };

let activeSession = null;
let cancelRequested = false;
const inflight = new Set(); // live AbortControllers

export async function countPendingExtraction() {
  if (!jobsCollection) return 0;
  return jobsCollection.countDocuments(PENDING_QUERY);
}

/** Claim a batch of pending jobs → 'extracting' in one round-trip. Single
 * session runs at a time, so a find+updateMany is race-free here. */
async function claimBatch(n) {
  const jobs = await jobsCollection
    .find(PENDING_QUERY)
    .project(CLAIM_PROJECTION)
    .sort({ postedAt: -1 })
    .limit(n)
    .toArray();
  if (!jobs.length) return [];
  await jobsCollection.updateMany(
    { _id: { $in: jobs.map((j) => j._id) }, aiSkillStatus: 'pending' },
    { $set: { aiSkillStatus: 'extracting' } },
  );
  return jobs;
}

async function requeue(jobId) {
  await jobsCollection.updateOne({ _id: jobId }, { $set: { aiSkillStatus: 'pending' } }).catch(() => {});
}

async function processOne(session, auth, job) {
  const controller = new AbortController();
  inflight.add(controller);
  try {
    const result = await extractAndPersistJob(job, auth, { signal: controller.signal });
    session.extracted += 1;
    session.lastJob = { id: result.jobId, title: job.title || '', skills: result.skillCount };
    if (result.usage) {
      session.inputTokens += result.usage.inputTokens || 0;
      session.outputTokens += result.usage.outputTokens || 0;
      if (typeof result.usage.cost === 'number') session.costUsd += result.usage.cost;
    }
  } catch (err) {
    if (cancelRequested || controller.signal.aborted) {
      await requeue(job._id); // Stop mid-flight — leave it pending, not stuck 'extracting'
      return;
    }
    const r = await recordExtractionFailure(job, err);
    if (r?.terminal) session.failed += 1;
    else session.retried = (session.retried || 0) + 1;
    console.error(`[job-skill-extract] failed ${job._id}: ${err.message}`);
  } finally {
    inflight.delete(controller);
    session.processed += 1;
    session.remaining = Math.max(0, session.total - session.processed);
  }
}

async function runSession(session) {
  let auth;
  try {
    auth = await resolveExtractionAuth(session.applierName);
  } catch (err) {
    session.running = false;
    session.status = 'failed';
    session.error = err.message;
    return;
  }

  session.provider = auth.providerId;
  session.model = auth.model;
  console.log(
    `[job-skill-extract] starting — ${auth.providerId}/${auth.model}, up to ${CONCURRENCY} concurrent, ${session.total} job(s)`,
  );

  try {
    // Claim CONCURRENCY jobs and fire them all at once; repeat until drained.
    while (!cancelRequested) {
      let take = CONCURRENCY;
      if (session.limit != null) {
        take = Math.min(take, session.limit - session.processed);
        if (take <= 0) break;
      }
      const batch = await claimBatch(take);
      if (!batch.length) break;
      await Promise.all(batch.map((job) => processOne(session, auth, job)));
    }
  } finally {
    session.running = false;
    session.finishedAt = new Date().toISOString();
    session.status = cancelRequested ? 'cancelled' : 'completed';
    session.remaining = await countPendingExtraction();
    console.log(
      `[job-skill-extract] ${session.status} — ${session.extracted} extracted, ${session.failed} failed · ` +
        `${session.inputTokens + session.outputTokens} tokens · ${formatCostUsd(session.costUsd)}`,
    );
  }
}

export function getExtractionStatus() {
  if (!activeSession) return { running: false, status: 'idle' };
  return {
    running: activeSession.running,
    status: activeSession.status,
    sessionId: activeSession.id,
    total: activeSession.total,
    processed: activeSession.processed,
    extracted: activeSession.extracted,
    failed: activeSession.failed,
    retried: activeSession.retried || 0,
    remaining: activeSession.remaining,
    lastJob: activeSession.lastJob ?? null,
    startedAt: activeSession.startedAt,
    finishedAt: activeSession.finishedAt ?? null,
    error: activeSession.error ?? null,
    concurrency: CONCURRENCY,
    provider: activeSession.provider ?? null,
    model: activeSession.model ?? null,
    inputTokens: activeSession.inputTokens,
    outputTokens: activeSession.outputTokens,
    costUsd: activeSession.costUsd,
  };
}

export async function getSkillExtractionStatus() {
  const pending = await countPendingExtraction();
  return { pending, ...getExtractionStatus() };
}

export async function startSkillExtractionSession({ applierName, limit = null } = {}) {
  if (!jobsCollection) throw new Error('Database not ready');
  if (activeSession?.running) throw new Error('Skill extraction session already running');

  // Verify an API key exists before claiming anything.
  await resolveExtractionAuth(applierName);

  // Recover any jobs left 'extracting' by a previous crash/stop.
  await jobsCollection.updateMany({ aiSkillStatus: 'extracting' }, { $set: { aiSkillStatus: 'pending' } });

  const pending = await countPendingExtraction();
  if (pending === 0) {
    return { sessionId: null, pending: 0, started: false, message: 'No jobs pending extraction' };
  }

  cancelRequested = false;
  activeSession = {
    id: randomUUID(),
    applierName: String(applierName || '').trim(),
    running: true,
    status: 'running',
    total: limit != null ? Math.min(pending, Number(limit)) : pending,
    limit: limit != null ? Number(limit) : null,
    processed: 0,
    extracted: 0,
    failed: 0,
    retried: 0,
    remaining: pending,
    lastJob: null,
    provider: null,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  void runSession(activeSession).catch((err) => {
    console.error('[job-skill-extract] session error', err);
    if (activeSession) {
      activeSession.running = false;
      activeSession.status = 'failed';
      activeSession.error = err.message;
    }
  });

  return { sessionId: activeSession.id, pending, started: true };
}

export function stopSkillExtractionSession() {
  if (!activeSession?.running) return { stopped: false, message: 'No active session' };
  cancelRequested = true;
  for (const controller of inflight) controller.abort(); // immediate halt of in-flight LLM calls
  return { stopped: true, sessionId: activeSession.id };
}
