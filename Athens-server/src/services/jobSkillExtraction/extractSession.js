/**
 * Manual, concurrency-limited AI skill-extraction session with immediate Stop.
 * Triggered from the Job Search "Extract skills" button. Processes both
 * job_market and external_scraped_jobs catalogs.
 */
import { randomUUID } from 'crypto';
import { jobsCollection, externalScrapedJobsCollection } from '../../db/mongo.js';
import { formatCostUsd } from '../llm/llmService.js';
import {
  resolveExtractionAuth,
  extractAndPersistJobByCatalog,
  recordExtractionFailure,
} from './aiExtractService.js';

const CONCURRENCY = Math.max(1, Number(process.env.JOB_SKILL_EXTRACT_CONCURRENCY || 100));
const PENDING_QUERY = { aiSkillStatus: 'pending' };

const MARKET_CLAIM_PROJECTION = { title: 1, description: 1, jobDescription: 1, aiSkillAttempts: 1 };
const EXTERNAL_CLAIM_PROJECTION = {
  jobTitle: 1,
  jobDescription: 1,
  companyName: 1,
  companyIcon: 1,
  aiSkillAttempts: 1,
};

let activeSession = null;
let cancelRequested = false;
const inflight = new Set();

function jobSortDate(job) {
  const raw = job._sortDate;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'string') return new Date(raw).getTime() || 0;
  return 0;
}

async function countPendingInCollection(collection) {
  if (!collection) return 0;
  return collection.countDocuments(PENDING_QUERY);
}

export async function countPendingExtraction() {
  const [pendingMarket, pendingExternal] = await Promise.all([
    countPendingInCollection(jobsCollection),
    countPendingInCollection(externalScrapedJobsCollection),
  ]);
  return pendingMarket + pendingExternal;
}

export async function countPendingExtractionBreakdown() {
  const [pendingMarket, pendingExternal] = await Promise.all([
    countPendingInCollection(jobsCollection),
    countPendingInCollection(externalScrapedJobsCollection),
  ]);
  return { pending: pendingMarket + pendingExternal, pendingMarket, pendingExternal };
}

async function claimFromCollection(collection, catalog, projection, sortField, n) {
  if (!collection || n <= 0) return [];
  const jobs = await collection
    .find(PENDING_QUERY)
    .project(projection)
    .sort({ [sortField]: -1 })
    .limit(n)
    .toArray();
  if (!jobs.length) return [];

  await collection.updateMany(
    { _id: { $in: jobs.map((j) => j._id) }, aiSkillStatus: 'pending' },
    { $set: { aiSkillStatus: 'extracting' } },
  );

  return jobs.map((job) => ({
    ...job,
    catalog,
    _sortDate: job[sortField],
    title: catalog === 'external' ? job.jobTitle : job.title,
  }));
}

/** Claim a batch from both catalogs, interleaved by date (newest first). */
async function claimBatch(n) {
  const [marketJobs, externalJobs] = await Promise.all([
    claimFromCollection(jobsCollection, 'market', MARKET_CLAIM_PROJECTION, 'postedAt', n),
    claimFromCollection(
      externalScrapedJobsCollection,
      'external',
      EXTERNAL_CLAIM_PROJECTION,
      'createdAt',
      n,
    ),
  ]);

  const merged = [...marketJobs, ...externalJobs].sort((a, b) => jobSortDate(b) - jobSortDate(a));
  return merged.slice(0, n);
}

async function requeue(job, catalog) {
  const collection = catalog === 'external' ? externalScrapedJobsCollection : jobsCollection;
  if (!collection) return;
  await collection
    .updateOne({ _id: job._id }, { $set: { aiSkillStatus: 'pending' } })
    .catch(() => {});
}

async function processOne(session, auth, job) {
  const catalog = job.catalog || 'market';
  const controller = new AbortController();
  inflight.add(controller);
  try {
    const result = await extractAndPersistJobByCatalog(job, auth, {
      signal: controller.signal,
      catalog,
    });
    session.extracted += 1;
    session.lastJob = {
      id: result.jobId,
      title: job.title || job.jobTitle || '',
      skills: result.skillCount,
      catalog,
    };
    if (result.usage) {
      session.inputTokens += result.usage.inputTokens || 0;
      session.outputTokens += result.usage.outputTokens || 0;
      if (typeof result.usage.cost === 'number') session.costUsd += result.usage.cost;
    }
  } catch (err) {
    if (cancelRequested || controller.signal.aborted) {
      await requeue(job, catalog);
      return;
    }
    const r = await recordExtractionFailure(job, err, { catalog });
    if (r?.terminal) session.failed += 1;
    else session.retried = (session.retried || 0) + 1;
    console.error(`[job-skill-extract] failed ${catalog}:${job._id}: ${err.message}`);
  } finally {
    inflight.delete(controller);
    session.processed += 1;
    session.remaining = Math.max(0, session.total - session.processed);
  }
}

async function recoverStuckExtracting() {
  await Promise.all([
    jobsCollection
      ?.updateMany({ aiSkillStatus: 'extracting' }, { $set: { aiSkillStatus: 'pending' } })
      .catch(() => {}) ?? Promise.resolve(),
    externalScrapedJobsCollection
      ?.updateMany({ aiSkillStatus: 'extracting' }, { $set: { aiSkillStatus: 'pending' } })
      .catch(() => {}) ?? Promise.resolve(),
  ]);
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
    const breakdown = await countPendingExtractionBreakdown();
    session.remaining = breakdown.pending;
    session.pendingMarket = breakdown.pendingMarket;
    session.pendingExternal = breakdown.pendingExternal;
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
    pendingMarket: activeSession.pendingMarket ?? null,
    pendingExternal: activeSession.pendingExternal ?? null,
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
  const breakdown = await countPendingExtractionBreakdown();
  return { ...breakdown, ...getExtractionStatus() };
}

export async function startSkillExtractionSession({ applierName, limit = null } = {}) {
  if (!jobsCollection && !externalScrapedJobsCollection) {
    throw new Error('Database not ready');
  }
  if (activeSession?.running) throw new Error('Skill extraction session already running');

  await resolveExtractionAuth(applierName);
  await recoverStuckExtracting();

  const breakdown = await countPendingExtractionBreakdown();
  const pending = breakdown.pending;
  if (pending === 0) {
    return {
      sessionId: null,
      pending: 0,
      pendingMarket: 0,
      pendingExternal: 0,
      started: false,
      message: 'No jobs pending extraction',
    };
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
    pendingMarket: breakdown.pendingMarket,
    pendingExternal: breakdown.pendingExternal,
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

  return {
    sessionId: activeSession.id,
    pending,
    pendingMarket: breakdown.pendingMarket,
    pendingExternal: breakdown.pendingExternal,
    started: true,
  };
}

export function stopSkillExtractionSession() {
  if (!activeSession?.running) return { stopped: false, message: 'No active session' };
  cancelRequested = true;
  for (const controller of inflight) controller.abort();
  return { stopped: true, sessionId: activeSession.id };
}
