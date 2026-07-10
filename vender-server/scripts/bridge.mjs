import http from 'node:http';
import { installTerminalLogger } from '../src/lib/terminal-log.js';

installTerminalLogger('vender');

import { loadEnv, readTextAsset } from '../src/lib/env.js';
import { JOB_ANALYSIS_PROMPT } from '../src/config/jobAnalysisPrompt.js';
import {
  initMongo,
  closeMongo,
  accountInfoCollection,
  personalInfoCollection,
  bidRecordsCollection,
  pingMongo,
  getMongoStatus,
} from '../src/db/mongo.js';
import {
  completeBidSession,
  recordBidAnalysisEvent,
  recordBidProcessEvent,
  recordBidResumeUploadEvent,
  startBidSession,
} from '../src/services/bidSessionService.js';
import {
  getPublicProfile,
  listApplierNames,
  loadProfileBundle,
  verifyApplierProfile,
} from '../src/services/profileService.js';
import { createAnalyzer } from '../src/bridge/analyze.js';
import {
  fetchMessageBody,
  resolveBatchSize,
  resolveBeforeSeq,
  resolveImapCredentials,
  resolveImapLabel,
  scanLabeledBatch,
  verifyImapCredentials,
} from '../src/bridge/imap.js';

loadEnv();

const HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const PORT = Number(process.env.BRIDGE_PORT || 3848);
// Job Bid analysis is hardcoded to gpt-5-nano in analyze.js (cheapest tier).
const DEFAULT_OPENAI_MODEL = 'gpt-5-nano';

// The job-analysis prompt is embedded in the codebase (src/config/jobAnalysisPrompt.js),
// so it always works without a prompt.md asset in dist/. PROMPT_MD_PATH still lets you
// override it from a file at runtime if needed.
let skillPromptTemplate = JOB_ANALYSIS_PROMPT;

if (process.env.PROMPT_MD_PATH) {
  try {
    skillPromptTemplate = readTextAsset('PROMPT_MD_PATH', '../bid-assistant/prompt.md');
    console.log('[vender-server] Loaded job analysis prompt from PROMPT_MD_PATH override');
  } catch (error) {
    console.warn(
      '[vender-server] PROMPT_MD_PATH set but unreadable — using embedded prompt:',
      error instanceof Error ? error.message : error,
    );
  }
} else {
  console.log('[vender-server] Loaded embedded job analysis prompt');
}

const analyzer = createAnalyzer({
  skillPromptTemplate,
  defaultModel: DEFAULT_OPENAI_MODEL,
});

function readJsonBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
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

async function handleProfileRequest(req, res, url) {
  const applierName = url.searchParams.get('applierName') ?? undefined;
  const payload = await getPublicProfile(accountInfoCollection, personalInfoCollection, applierName);
  sendJson(res, 200, { ok: true, ...payload });
}

async function handleAccountsRequest(res) {
  const accounts = await listApplierNames(accountInfoCollection);
  sendJson(res, 200, { ok: true, accounts });
}

async function handleInboxRequest(body) {
  const profileBundle = await loadProfileBundle(
    accountInfoCollection,
    personalInfoCollection,
    body.applierName,
  );
  const credentials = resolveImapCredentials(body, profileBundle);
  const email = credentials.email;
  const password = credentials.password;

  if (!email || !password) {
    return {
      status: 400,
      payload: {
        ok: false,
        error:
          'Email and app password are required. Save them in lancer profile settings or enter them in the extension.',
      },
    };
  }

  const result = await scanLabeledBatch(email, password, {
    beforeSeq: resolveBeforeSeq(body),
    batchSize: resolveBatchSize(body),
    label: resolveImapLabel(body),
  });

  return { status: 200, payload: { ok: true, ...result } };
}

async function handleMessageRequest(body) {
  const profileBundle = await loadProfileBundle(
    accountInfoCollection,
    personalInfoCollection,
    body.applierName,
  );
  const credentials = resolveImapCredentials(body, profileBundle);
  const email = credentials.email;
  const password = credentials.password;
  const uid = String(body.uid ?? '').trim();

  if (!email || !password || !uid) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: 'Email, app password, and message uid are required.',
      },
    };
  }

  const message = await fetchMessageBody(email, password, uid);
  return { status: 200, payload: { ok: true, message } };
}

async function handleProfileVerifyRequest(body) {
  const applierName = String(body.applierName ?? '').trim();
  if (!applierName) {
    return { status: 400, payload: { ok: false, error: 'applierName is required.' } };
  }

  const result = await verifyApplierProfile(
    accountInfoCollection,
    personalInfoCollection,
    verifyImapCredentials,
    applierName,
  );

  return { status: 200, payload: { ok: true, ...result } };
}

async function handleBidSessionRequest(pathname, body) {
  if (pathname === '/bid-session/start') {
    const result = await startBidSession(bidRecordsCollection, body);
    return { status: 200, payload: { ok: true, ...result } };
  }
  if (pathname === '/bid-session/event') {
    const result = await recordBidProcessEvent(bidRecordsCollection, body);
    return { status: 200, payload: { ok: true, ...result } };
  }
  if (pathname === '/bid-session/analysis') {
    const result = await recordBidAnalysisEvent(bidRecordsCollection, body);
    return { status: 200, payload: { ok: true, ...result } };
  }
  if (pathname === '/bid-session/resume-upload') {
    const result = await recordBidResumeUploadEvent(bidRecordsCollection, body);
    return { status: 200, payload: { ok: true, ...result } };
  }
  const result = await completeBidSession(bidRecordsCollection, body);
  return { status: 200, payload: { ok: true, ...result } };
}

async function handleJobAnalyzeRequest(pathname, body) {
  const pageContext = body.pageContext;
  if (!pageContext || typeof pageContext !== 'object') {
    return { status: 400, payload: { ok: false, error: 'pageContext is required.' } };
  }

  const profileBundle = await loadProfileBundle(
    accountInfoCollection,
    personalInfoCollection,
    body.applierName,
  );

  const sessionContext =
    body.sessionContext && typeof body.sessionContext === 'object' ? body.sessionContext : null;

  let result;
  let usage;
  if (pathname === '/job-analyze/page') {
    ({ result, usage } = await analyzer.analyzePage(pageContext, profileBundle, sessionContext));
  } else if (pathname === '/job-analyze/flags') {
    const neededFlags = Array.isArray(body.neededFlags) ? body.neededFlags : ['remote', 'clearance'];
    ({ result, usage } = await analyzer.analyzeFlags(
      pageContext,
      profileBundle,
      sessionContext,
      neededFlags,
    ));
  } else {
    ({ result, usage } = await analyzer.analyzeSkills(pageContext, profileBundle, sessionContext));
  }

  return { status: 200, payload: { ok: true, result, usage } };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      const mongo = await pingMongo();
      sendJson(res, 200, {
        ok: true,
        service: 'vender-server-bridge',
        applierName: process.env.APPLIER_NAME || null,
        mongoConnected: mongo.ok,
        mongoError: mongo.ok ? null : mongo.error,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/profile') {
      await handleProfileRequest(req, res, url);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/accounts') {
      await handleAccountsRequest(res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/inbox') {
      const body = await readJsonBody(req);
      const response = await handleInboxRequest(body);
      sendJson(res, response.status, response.payload);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/message') {
      const body = await readJsonBody(req);
      const response = await handleMessageRequest(body);
      sendJson(res, response.status, response.payload);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/profile/verify') {
      const body = await readJsonBody(req);
      const response = await handleProfileVerifyRequest(body);
      sendJson(res, response.status, response.payload);
      return;
    }

    if (
      req.method === 'POST' &&
      (url.pathname === '/bid-session/start' ||
        url.pathname === '/bid-session/event' ||
        url.pathname === '/bid-session/analysis' ||
        url.pathname === '/bid-session/resume-upload' ||
        url.pathname === '/bid-session/complete')
    ) {
      // Screenshots are base64 data URLs, so allow a much larger body.
      const body = await readJsonBody(req, 15_000_000);
      const response = await handleBidSessionRequest(url.pathname, body);
      sendJson(res, response.status, response.payload);
      return;
    }

    if (
      req.method === 'POST' &&
      (url.pathname === '/job-analyze/page' ||
        url.pathname === '/job-analyze/skills' ||
        url.pathname === '/job-analyze/flags')
    ) {
      const body = await readJsonBody(req);
      const response = await handleJobAnalyzeRequest(url.pathname, body);
      sendJson(res, response.status, response.payload);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    console.error('[vender-server]', message);
    sendJson(res, 500, { ok: false, error: message });
  }
});

async function start() {
  await initMongo();
  server.listen(PORT, HOST, () => {
    const { connected, error } = getMongoStatus();
    console.log(`Vender bridge listening on http://${HOST}:${PORT}`);
    console.log('Keep this running while using the bid-assistant extension.');
    if (!connected) {
      console.warn('[vender-server] MongoDB is not connected — profile/inbox/bid features will fail until fixed.');
      if (error) console.warn('[vender-server]', error);
    }
    if (process.env.APPLIER_NAME) {
      console.log(`Default applier: ${process.env.APPLIER_NAME}`);
    } else {
      console.log('Set APPLIER_NAME in .env or pass applierName in bridge requests.');
    }
  });
}

async function shutdown() {
  server.close();
  await closeMongo();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

start().catch((error) => {
  console.error('[vender-server] Failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
