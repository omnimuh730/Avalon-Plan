import { randomUUID } from 'node:crypto';

/** Bumped when bid_records document shape changes. */
export const BID_RECORD_MODEL_VERSION = '2026.7.13';

function cleanString(value) {
  return String(value ?? '').trim();
}

/**
 * Splits a `data:image/...;base64,<data>` URL into its mime type and the raw
 * base64 payload, so the screenshot is stored as base64 in MongoDB rather than
 * as a full data URL string.
 */
function parseScreenshot(value) {
  const match = String(value ?? '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return { mimeType: null, base64: null };
  return { mimeType: match[1], base64: match[2] };
}

function sanitizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  return {
    model: usage.model ? String(usage.model) : null,
    inputTokens: num(usage.inputTokens),
    cachedTokens: num(usage.cachedTokens),
    outputTokens: num(usage.outputTokens),
    totalTokens: num(usage.totalTokens),
    cost: usage.cost == null ? null : num(usage.cost),
    savings: usage.savings == null ? null : num(usage.savings),
  };
}

function sanitizeAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') return null;
  const formAnswers = Array.isArray(analysis.formAnswers)
    ? analysis.formAnswers.slice(0, 50).map((entry) => ({
        question: cleanString(entry?.question),
        suggestedAnswer: cleanString(entry?.suggestedAnswer),
        confidence: cleanString(entry?.confidence) || 'medium',
      }))
    : [];
  const topResumes = Array.isArray(analysis.topResumes)
    ? analysis.topResumes.slice(0, 10).map((entry) => ({
        name: cleanString(entry?.name),
        scorePercent: Number.isFinite(Number(entry?.scorePercent)) ? Number(entry.scorePercent) : null,
      }))
    : [];
  return {
    isJobPage: Boolean(analysis.isJobPage),
    summary: cleanString(analysis.summary),
    notJobPageReason: cleanString(analysis.notJobPageReason) || null,
    skillProfile: cleanString(analysis.skillProfile) || null,
    bestResume: analysis.bestResume
      ? {
          name: cleanString(analysis.bestResume.name),
          scorePercent: Number.isFinite(Number(analysis.bestResume.scorePercent))
            ? Number(analysis.bestResume.scorePercent)
            : null,
        }
      : null,
    topResumes,
    formAnswers,
  };
}

/** Traffic-light screening verdicts (remote / no-clearance). Null = unresolved. */
function sanitizeFlagVerdict(verdict) {
  if (!verdict || typeof verdict !== 'object') return null;
  const status = cleanString(verdict.status).toLowerCase();
  if (status !== 'green' && status !== 'red') return null;
  return {
    status,
    explanation: cleanString(verdict.explanation),
  };
}

function sanitizeFlags(flags) {
  if (!flags || typeof flags !== 'object') return null;
  const remote = sanitizeFlagVerdict(flags.remote);
  const clearance = sanitizeFlagVerdict(flags.clearance);
  if (!remote && !clearance) return null;
  return { remote, clearance };
}

function sanitizeTrace(trace) {
  if (!trace || typeof trace !== 'object') return null;
  const request = trace.request && typeof trace.request === 'object' ? trace.request : null;
  const response = trace.response && typeof trace.response === 'object' ? trace.response : null;
  if (!request && !response) return null;

  const excerpt = cleanString(request?.visibleTextExcerpt);
  return {
    request: request
      ? {
          url: cleanString(request.url) || null,
          title: cleanString(request.title) || null,
          visibleTextExcerpt: excerpt ? excerpt.slice(0, 8000) : null,
        }
      : null,
    response: response ?? null,
  };
}

const RESUME_UPLOAD_SOURCES = new Set(['input', 'formdata', 'fetch', 'xhr']);

/** Single resume rename event (type: resume-upload) or list entries. */
function sanitizeResumeUpload(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const originalName = cleanString(entry.originalName);
  if (!originalName) return null;
  const cleanedName = cleanString(entry.cleanedName) || null;
  const sourceRaw = cleanString(entry.source).toLowerCase();
  const recommendedResumeName = cleanString(entry.recommendedResumeName) || null;
  return {
    originalName,
    cleanedName,
    renamed: Boolean(entry.renamed) && Boolean(cleanedName),
    source: RESUME_UPLOAD_SOURCES.has(sourceRaw) ? sourceRaw : 'input',
    pageUrl: cleanString(entry.pageUrl || entry.url) || null,
    ts: Number.isFinite(Number(entry.ts)) ? Number(entry.ts) : Date.now(),
    recommendedResumeName,
  };
}

function sanitizeResumeUploads(list) {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeResumeUpload).filter(Boolean).slice(0, 50);
}

function detectJobSource(url) {
  const raw = cleanString(url);
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./i, '');
    const rules = [
      [/ashbyhq\.com/i, 'Ashby'],
      [/greenhouse\.io/i, 'Greenhouse'],
      [/lever\.co/i, 'Lever'],
      [/myworkdayjobs\.com|workday\.com/i, 'Workday'],
      [/workable\.com/i, 'Workable'],
      [/smartrecruiters\.com/i, 'SmartRecruiters'],
      [/linkedin\.com/i, 'LinkedIn'],
    ];
    for (const [pattern, label] of rules) {
      if (pattern.test(host)) return { label, host };
    }
    const parts = host.split('.');
    const label = parts.length >= 2 ? parts[parts.length - 2] : host;
    return { label: label.charAt(0).toUpperCase() + label.slice(1), host };
  } catch {
    return null;
  }
}

function buildRecord(sessionId, applierName, type, body) {
  const { mimeType, base64 } = parseScreenshot(body.screenshot);
  const url = cleanString(body.url) || null;
  const resumeUpload = type === 'resume-upload' ? sanitizeResumeUpload(body) : null;
  const resumeUploads =
    type === 'session-complete' ? sanitizeResumeUploads(body.resumeUploads) : [];

  return {
    sessionId,
    profileId: cleanString(body.profileId) || null,
    applierName: applierName || null,
    type,
    modelVersion: BID_RECORD_MODEL_VERSION,
    url,
    title: cleanString(body.title) || null,
    triggerText: cleanString(body.triggerText) || null,
    screenshot: base64,
    screenshotMime: mimeType,
    screenshotEncoding: base64 ? 'base64' : null,
    analysis: sanitizeAnalysis(body.analysis),
    usage: sanitizeUsage(body.usage),
    trace: sanitizeTrace(body.trace),
    // Screening traffic lights (modelVersion 2026.7.13+) — analysis + complete only.
    flags:
      type === 'analysis' || type === 'session-complete' ? sanitizeFlags(body.flags) : null,
    jobSource: body.jobSource ?? detectJobSource(url || resumeUpload?.pageUrl),
    // Resume rename audit (modelVersion 2026.7.10+)
    originalName: resumeUpload?.originalName ?? null,
    cleanedName: resumeUpload?.cleanedName ?? null,
    renamed: resumeUpload?.renamed ?? false,
    uploadSource: resumeUpload?.source ?? null,
    recommendedResumeName: resumeUpload?.recommendedResumeName ?? null,
    resumeUploads,
    createdAt: new Date(),
  };
}

/** Insert a session-start record and return the new sessionId. */
export async function startBidSession(collection, body) {
  const applierName = cleanString(body.applierName);
  const sessionId = randomUUID();
  await collection.insertOne(buildRecord(sessionId, applierName, 'session-start', body));
  return { sessionId };
}

/** Insert a process record (Apply/Submit/Next click screenshot). */
export async function recordBidProcessEvent(collection, body) {
  const sessionId = cleanString(body.sessionId);
  if (!sessionId) {
    throw new Error('sessionId is required.');
  }
  await collection.insertOne(buildRecord(sessionId, cleanString(body.applierName), 'process', body));
  return { sessionId };
}

/** Insert an analysis record (page + skills result and token/cost usage). */
export async function recordBidAnalysisEvent(collection, body) {
  const sessionId = cleanString(body.sessionId);
  if (!sessionId) {
    throw new Error('sessionId is required.');
  }
  await collection.insertOne(buildRecord(sessionId, cleanString(body.applierName), 'analysis', body));
  return { sessionId };
}

/** Insert a resume-upload rename audit record. */
export async function recordBidResumeUploadEvent(collection, body) {
  const sessionId = cleanString(body.sessionId);
  if (!sessionId) {
    throw new Error('sessionId is required.');
  }
  const upload = sanitizeResumeUpload(body);
  if (!upload) {
    throw new Error('originalName is required for resume-upload events.');
  }
  await collection.insertOne(
    buildRecord(sessionId, cleanString(body.applierName), 'resume-upload', {
      ...body,
      url: cleanString(body.url) || upload.pageUrl,
      originalName: upload.originalName,
      cleanedName: upload.cleanedName,
      renamed: upload.renamed,
      source: upload.source,
      pageUrl: upload.pageUrl,
      ts: upload.ts,
    }),
  );
  return { sessionId };
}

/** Insert a session-complete record. */
export async function completeBidSession(collection, body) {
  const sessionId = cleanString(body.sessionId);
  if (!sessionId) {
    throw new Error('sessionId is required.');
  }
  await collection.insertOne(
    buildRecord(sessionId, cleanString(body.applierName), 'session-complete', body),
  );
  return { sessionId };
}
