import { randomUUID } from 'node:crypto';

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
  return {
    sessionId,
    profileId: cleanString(body.profileId) || null,
    applierName: applierName || null,
    type,
    url,
    title: cleanString(body.title) || null,
    triggerText: cleanString(body.triggerText) || null,
    screenshot: base64,
    screenshotMime: mimeType,
    screenshotEncoding: base64 ? 'base64' : null,
    analysis: sanitizeAnalysis(body.analysis),
    usage: sanitizeUsage(body.usage),
    trace: sanitizeTrace(body.trace),
    jobSource: body.jobSource ?? detectJobSource(url),
    // Storage target is owned by vender-server (not the extension). Bid records
    // always go to MONGO_URL so distributed bid-assistant builds stay dumb.
    storageTarget: 'local',
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
