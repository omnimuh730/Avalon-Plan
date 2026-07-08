import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { rankResumes } from './resume-match.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PORT = 3848;
const HOST = '127.0.0.1';
const GMAIL_LABEL = 'Notify/Unnecessary';
const DEFAULT_BATCH_SIZE = 100;
const ALL_MAIL_PATH = '[Gmail]/All Mail';

function loadEnvFile() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5-nano';

// USD per 1,000,000 tokens. cached = discounted rate for cached input tokens.
const PRICING_PER_MILLION = {
  'gpt-5-nano': { input: 0.05, cached: 0.005, output: 0.4 },
  'gpt-5-mini': { input: 0.25, cached: 0.025, output: 2.0 },
  'gpt-5': { input: 1.25, cached: 0.125, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, cached: 0.075, output: 0.6 },
  'gpt-4o': { input: 2.5, cached: 1.25, output: 10.0 },
};

function getPricing(model) {
  if (PRICING_PER_MILLION[model]) return PRICING_PER_MILLION[model];
  const key = Object.keys(PRICING_PER_MILLION)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => model.startsWith(candidate));
  return key ? PRICING_PER_MILLION[key] : null;
}

function summarizeUsage(usage) {
  const inputTokens = usage?.prompt_tokens ?? 0;
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
  const uncachedInput = Math.max(0, inputTokens - cachedTokens);

  const pricing = getPricing(OPENAI_MODEL);
  const cost = pricing
    ? (uncachedInput / 1_000_000) * pricing.input +
      (cachedTokens / 1_000_000) * pricing.cached +
      (outputTokens / 1_000_000) * pricing.output
    : null;

  return {
    model: OPENAI_MODEL,
    inputTokens,
    cachedTokens,
    outputTokens,
    totalTokens,
    cost,
  };
}

let skillPromptTemplate = '';
let resumesCatalog = {};

try {
  skillPromptTemplate = fs.readFileSync(path.join(PROJECT_ROOT, 'prompt.md'), 'utf8');
  resumesCatalog = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'resumes.json'), 'utf8'));
} catch (error) {
  console.warn('[imap-bridge] Job analysis assets not loaded:', error instanceof Error ? error.message : error);
}

function buildAnalysisPrompt(pageContext) {
  const formsText =
    pageContext.forms?.length > 0
      ? pageContext.forms
          .map((field, index) => {
            const parts = [
              `#${index + 1}`,
              field.label ? `label: ${field.label}` : null,
              field.name ? `name: ${field.name}` : null,
              field.type ? `type: ${field.type}` : null,
              field.placeholder ? `placeholder: ${field.placeholder}` : null,
              field.required ? 'required: yes' : null,
              field.options?.length ? `options: ${field.options.join(', ')}` : null,
            ].filter(Boolean);
            return parts.join(' | ');
          })
          .join('\n')
      : '(no form fields detected)';

  return `Analyze the following web page for job-application assistance.

URL: ${pageContext.url}
Title: ${pageContext.title}
Meta description: ${pageContext.metaDescription || '(none)'}

Page text:
${pageContext.visibleText}

Form fields on page:
${formsText}

Return JSON with this exact shape:
{
  "isJobPage": boolean,
  "summary": string,
  "formAnswers": [{ "question": string, "suggestedAnswer": string, "confidence": "high"|"medium"|"low" }],
  "notJobPageReason": string | null
}

Rules:
- Set isJobPage true only if this looks like a job posting or job application page.
- summary: 2-4 sentence JD summary when isJobPage is true; otherwise brief explanation.
- formAnswers: suggest concise answers for detected application questions when isJobPage is true; otherwise return [].
- notJobPageReason: required when isJobPage is false.
- Do NOT include skill analysis in this response — skills are extracted separately.`;
}

function formatRadarLine(skillName, score) {
  const value = Math.max(0, Math.min(10, Math.round(Number(score) || 0)));
  const bar = '█'.repeat(value).padEnd(10, ' ');
  return `${skillName.padEnd(24)} ${bar} ${String(value).padStart(2)}`;
}

function normalizeSkillProfileOutput(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const radarLines = [];
  for (const line of lines) {
    const barMatch = line.match(/^(.+?)\s+[█\u2588\u2593\u2592\u2591\s]+\s+(\d+)\s*$/);
    if (barMatch) {
      radarLines.push(formatRadarLine(barMatch[1].trim(), barMatch[2]));
      continue;
    }

    const simpleMatch = line.match(/^(.+?)\s+(\d+)\s*$/);
    if (simpleMatch) {
      radarLines.push(formatRadarLine(simpleMatch[1].trim(), simpleMatch[2]));
    }
  }

  return radarLines.length > 0 ? radarLines.join('\n') : String(text ?? '').trim();
}

async function callOpenAi(messages, { jsonMode = false, cacheKey } = {}) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env in the project root.');
  }

  const body = {
    model: OPENAI_MODEL,
    messages,
  };

  if (OPENAI_MODEL.startsWith('gpt-5')) {
    // gpt-5* are reasoning models; the API defaults to "medium" effort, which
    // adds seconds of hidden reasoning. "none" keeps nano fast (~sub-second).
    body.reasoning_effort = 'none';
  } else {
    body.temperature = 0.2;
  }

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  // Stable cache key lets OpenAI route repeated requests to the same cache,
  // so identical prompt prefixes are billed at the discounted cached rate.
  if (cacheKey) {
    body.prompt_cache_key = cacheKey;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? `OpenAI request failed (${response.status})`;
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response.');
  }

  return { content, usage: data?.usage ?? null };
}

async function analyzePage(pageContext) {
  const { content, usage } = await callOpenAi(
    [
      {
        role: 'system',
        content:
          'You analyze web pages for job applications. Respond with JSON only. Do not extract skills.',
      },
      { role: 'user', content: buildAnalysisPrompt(pageContext) },
    ],
    { jsonMode: true, cacheKey: 'job-bid-page' },
  );

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI returned invalid JSON.');
  }

  const result = {
    isJobPage: Boolean(parsed.isJobPage),
    summary: String(parsed.summary ?? '').trim(),
    formAnswers: Array.isArray(parsed.formAnswers)
      ? parsed.formAnswers
          .map((entry) => ({
            question: String(entry?.question ?? '').trim(),
            suggestedAnswer: String(entry?.suggestedAnswer ?? '').trim(),
            confidence: ['high', 'medium', 'low'].includes(entry?.confidence)
              ? entry.confidence
              : 'medium',
          }))
          .filter((entry) => entry.question && entry.suggestedAnswer)
      : [],
    notJobPageReason: parsed.notJobPageReason ? String(parsed.notJobPageReason).trim() : undefined,
    pageUrl: pageContext.url,
    pageTitle: pageContext.title,
  };

  return { result, usage: summarizeUsage(usage) };
}

async function analyzeSkills(pageContext) {
  const jdText = [
    `URL: ${pageContext.url}`,
    `Title: ${pageContext.title}`,
    '',
    pageContext.visibleText,
  ].join('\n');

  const { content, usage } = await callOpenAi(
    [
      { role: 'system', content: skillPromptTemplate },
      {
        role: 'user',
        content: `Analyze this job description and output ONLY the radar profile.\n\n${jdText}`,
      },
    ],
    { cacheKey: 'job-bid-skill' },
  );

  const skillProfile = normalizeSkillProfileOutput(content);

  let topResumes = [];
  let bestResume = null;
  if (skillProfile) {
    topResumes = rankResumes(skillProfile, resumesCatalog, 3).map((entry) => ({
      name: entry.name,
      score: entry.score,
      scorePercent: Math.round(entry.score * 100),
    }));
    bestResume = topResumes[0] ?? null;
  }

  return {
    result: { skillProfile, bestResume, topResumes },
    usage: summarizeUsage(usage),
  };
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function hasGmailLabel(labels, targetLabel) {
  if (!labels || labels.size === 0) return false;

  const normalized = [...labels].map((raw) => String(raw).toLowerCase().replace(/^\\+/, ''));
  const target = targetLabel.toLowerCase().replace(/^\\+/, '');

  if (normalized.some((label) => label === target || label.endsWith(`/${target}`))) {
    return true;
  }

  const parts = target.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return parts.every((part) => normalized.some((label) => label === part || label.endsWith(`/${part}`)));
  }

  return false;
}

function envelopeFrom(message) {
  const from = message.envelope?.from?.[0];
  return {
    sender: from?.name || from?.address || 'Unknown',
    senderEmail: from?.address || '',
    subject: message.envelope?.subject || '(No subject)',
    timestamp: (message.envelope?.date ?? new Date()).toISOString(),
  };
}

function listItemFromMessage(message) {
  const { sender, senderEmail, subject, timestamp } = envelopeFrom(message);
  return {
    id: String(message.uid),
    sender,
    senderEmail,
    subject,
    preview: subject,
    body: '',
    bodyHtml: null,
    timestamp,
    isRead: message.flags?.has('\\Seen') ?? false,
  };
}

function extractHtmlBody(parsed) {
  if (parsed.html?.trim()) return parsed.html.trim();
  if (typeof parsed.textAsHtml === 'string' && parsed.textAsHtml.trim()) {
    return parsed.textAsHtml.trim();
  }
  if (Array.isArray(parsed.alternatives)) {
    const htmlAlt = parsed.alternatives.find((part) =>
      String(part.contentType ?? '').toLowerCase().includes('text/html'),
    );
    if (htmlAlt?.content) {
      const content = htmlAlt.content;
      return typeof content === 'string' ? content.trim() : content.toString().trim();
    }
  }
  return null;
}

async function createClient(email, password) {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });
  await client.connect();
  return client;
}

async function openAllMail(client) {
  const lock = await client.getMailboxLock(ALL_MAIL_PATH);
  return lock;
}

async function scanLabeledBatch(email, password, { beforeSeq, batchSize, label }) {
  const client = await createClient(email, password);
  const lock = await openAllMail(client);

  try {
    const total = client.mailbox.exists ?? 0;
    if (total === 0) {
      return { emails: [], hasMore: false, nextBeforeSeq: null, scanned: 0 };
    }

    const end = beforeSeq === undefined || beforeSeq === null ? total : beforeSeq - 1;
    if (end < 1) {
      return { emails: [], hasMore: false, nextBeforeSeq: null, scanned: 0 };
    }

    const start = Math.max(1, end - batchSize + 1);
    const range = `${start}:${end}`;
    const matched = [];

    for await (const message of client.fetch(range, {
      envelope: true,
      flags: true,
      uid: true,
      labels: true,
    })) {
      if (!hasGmailLabel(message.labels, label)) continue;
      matched.push(listItemFromMessage(message));
    }

    matched.reverse();

    return {
      emails: matched,
      hasMore: start > 1,
      nextBeforeSeq: start > 1 ? start : null,
      scanned: end - start + 1,
    };
  } finally {
    lock.release();
    await client.logout();
  }
}

async function fetchMessageBody(email, password, uid) {
  const client = await createClient(email, password);
  const lock = await openAllMail(client);

  try {
    const message = await client.fetchOne(
      String(uid),
      { source: true, uid: true },
      { uid: true },
    );

    if (!message?.source) {
      throw new Error('Message not found');
    }

    const parsed = await simpleParser(message.source);
    const from = parsed.from?.value?.[0];
    const htmlBody = extractHtmlBody(parsed);
    const textBody = parsed.text?.trim() || stripHtml(parsed.html ?? '');
    const previewSource = textBody || stripHtml(parsed.html ?? '') || parsed.subject || '';

    return {
      id: String(uid),
      sender: from?.name || from?.address || parsed.from?.text || 'Unknown',
      senderEmail: from?.address || '',
      subject: parsed.subject || '(No subject)',
      preview: previewSource.slice(0, 120).replace(/\s+/g, ' '),
      body: textBody || '(No text content)',
      bodyHtml: htmlBody,
      timestamp: (parsed.date ?? new Date()).toISOString(),
      isRead: message.flags?.has('\\Seen') ?? false,
    };
  } finally {
    lock.release();
    await client.logout();
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, service: 'gmail-imap-bridge' });
    return;
  }

  if (req.method === 'POST' && req.url === '/inbox') {
    try {
      const body = await readJsonBody(req);
      const email = String(body.email ?? '').trim();
      const password = String(body.password ?? '').replace(/\s/g, '');
      const label = String(body.label ?? GMAIL_LABEL).trim() || GMAIL_LABEL;
      const batchSize = Math.min(Math.max(Number(body.batchSize) || DEFAULT_BATCH_SIZE, 1), 100);
      const beforeSeq =
        body.beforeSeq === undefined || body.beforeSeq === null
          ? undefined
          : Number(body.beforeSeq);

      if (!email || !password) {
        sendJson(res, 400, { ok: false, error: 'Email and app password are required.' });
        return;
      }

      const result = await scanLabeledBatch(email, password, {
        beforeSeq: Number.isFinite(beforeSeq) ? beforeSeq : undefined,
        batchSize,
        label,
      });

      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch inbox';
      console.error('[imap-bridge]', message);
      sendJson(res, 500, { ok: false, error: message });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/message') {
    try {
      const body = await readJsonBody(req);
      const email = String(body.email ?? '').trim();
      const password = String(body.password ?? '').replace(/\s/g, '');
      const uid = String(body.uid ?? '').trim();

      if (!email || !password || !uid) {
        sendJson(res, 400, { ok: false, error: 'Email, app password, and message uid are required.' });
        return;
      }

      const message = await fetchMessageBody(email, password, uid);
      sendJson(res, 200, { ok: true, message });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch message';
      console.error('[imap-bridge]', message);
      sendJson(res, 500, { ok: false, error: message });
    }
    return;
  }

  if (req.method === 'POST' && (req.url === '/job-analyze/page' || req.url === '/job-analyze/skills')) {
    try {
      const body = await readJsonBody(req);
      const pageContext = body.pageContext;

      if (!pageContext || typeof pageContext !== 'object') {
        sendJson(res, 400, { ok: false, error: 'pageContext is required.' });
        return;
      }

      const { result, usage } =
        req.url === '/job-analyze/page'
          ? await analyzePage(pageContext)
          : await analyzeSkills(pageContext);

      sendJson(res, 200, { ok: true, result, usage });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to analyze job page';
      console.error('[imap-bridge]', message);
      sendJson(res, 500, { ok: false, error: message });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`Gmail IMAP bridge listening on http://${HOST}:${PORT}`);
  console.log('Keep this running while using the Gmail Assistant extension.');
});
