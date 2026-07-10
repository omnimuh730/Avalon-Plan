import { GMAIL_LABEL, INBOX_BATCH_SIZE } from '@/lib/constants';
import { extractPageContext } from '@/lib/page-context';
import {
  JOB_ANALYSIS_PORT,
  type AnalysisEvent,
  type BidFlag,
  type BidFlagsResult,
  type BidFlagVerdicts,
  type PageAnalysisResult,
  type SkillAnalysisResult,
  type UsageSummary,
} from '@/lib/job-analysis';
import type { ProfileVerification, StoredApplierState } from '@/lib/applier-profile';
import {
  BID_SESSION_RESET,
  IDLE_BID_SESSION,
  type BidSessionContext,
  type BidSessionState,
  type BidShot,
} from '@/lib/bid-session';
import {
  MAX_RESUME_UPLOAD_EVENTS,
  RESUME_UPLOADS_STORAGE_KEY,
  type LogUploadMessage,
  type ResumeUploadEvent,
} from '@/lib/resume-uploads';

const BRIDGE_URL = (import.meta.env.VITE_BRIDGE_URL ?? 'http://127.0.0.1:3848').replace(/\/$/, '');
/** Remote bridges often need more than 2s; keep status checks honest. */
const BRIDGE_HEALTH_TIMEOUT_MS = 8_000;

function bridgeUnreachableMessage(cause?: unknown): string {
  const detail = cause instanceof Error ? cause.message : cause ? String(cause) : 'unreachable';
  return `Cannot reach bridge at ${BRIDGE_URL} (${detail}).`;
}

export interface GmailCredentials {
  email: string;
  appPassword: string;
}

export interface StoredCredentials {
  email: string;
  appPassword: string;
}

export interface BridgeEmail {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  preview: string;
  body: string;
  bodyHtml?: string | null;
  timestamp: string;
  isRead: boolean;
}

export interface InboxPageResult {
  emails: BridgeEmail[];
  hasMore: boolean;
  nextBeforeSeq: number | null;
  scanned: number;
}

type Message =
  | { type: 'GET_CREDENTIALS' }
  | { type: 'SAVE_CREDENTIALS'; credentials: GmailCredentials }
  | { type: 'CLEAR_CREDENTIALS' }
  | { type: 'FETCH_INBOX_PAGE'; beforeSeq: number | null; batchSize: number }
  | { type: 'FETCH_EMAIL_BODY'; uid: string }
  | { type: 'CHECK_BRIDGE' }
  | { type: 'GET_APPLIER_STATE' }
  | { type: 'LOAD_APPLIER_PROFILE'; applierName: string }
  | { type: 'CLEAR_APPLIER_PROFILE' }
  | { type: 'GET_BID_SESSION'; tabId: number }
  | { type: 'START_BID_SESSION'; tabId: number }
  | { type: 'COMPLETE_BID_SESSION'; tabId: number }
  | { type: 'GET_BID_SHOTS'; tabId: number }
  | { type: 'BID_PROCESS_CLICK'; triggerText: string }
  | LogUploadMessage
  | { type: 'GET_RESUME_UPLOADS' }
  | { type: 'CLEAR_RESUME_UPLOADS' }
  | { type: 'INJECT_RESUME_UPLOAD_HOOKS'; profileFileBase: string | null };

type Response =
  | { ok: true; credentials: StoredCredentials | null }
  | { ok: true; page: InboxPageResult }
  | { ok: true; message: BridgeEmail }
  | { ok: true; bridgeRunning: boolean; bridgeStatus: { running: boolean; mongoConnected: boolean; mongoError: string | null } }
  | { ok: true; state: StoredApplierState }
  | { ok: true; verification: ProfileVerification }
  | { ok: true; session: BidSessionState }
  | { ok: true; shots: BidShot[] }
  | { ok: true }
  | { ok: false; error: string };

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

async function getStoredApplierState(): Promise<StoredApplierState> {
  const result = await chrome.storage.local.get([
    'applierName',
    'profileId',
    'profileReady',
    'profileChecks',
    'profileEmail',
  ]);

  return {
    applierName: result.applierName ? String(result.applierName) : null,
    profileId: result.profileId ? String(result.profileId) : null,
    ready: Boolean(result.profileReady),
    checks: (result.profileChecks as StoredApplierState['checks']) ?? null,
    profileEmail: result.profileEmail ? String(result.profileEmail) : null,
  };
}

async function saveApplierState(verification: ProfileVerification): Promise<void> {
  await chrome.storage.local.set({
    applierName: verification.applierName,
    profileId: verification.profileId ?? null,
    profileReady: verification.ready,
    profileChecks: verification.checks,
    profileEmail: verification.profileEmail ?? null,
  });
}

async function clearApplierState(): Promise<void> {
  await chrome.storage.local.remove([
    'applierName',
    'profileId',
    'profileReady',
    'profileChecks',
    'profileEmail',
  ]);
}

async function getStoredResumeUploads(): Promise<ResumeUploadEvent[]> {
  const result = await chrome.storage.local.get(RESUME_UPLOADS_STORAGE_KEY);
  const raw = result[RESUME_UPLOADS_STORAGE_KEY];
  return Array.isArray(raw) ? (raw as ResumeUploadEvent[]) : [];
}

function uploadDedupeKey(event: Pick<ResumeUploadEvent, 'originalName' | 'cleanedName' | 'fileSize' | 'lastModified' | 'pageUrl'>): string {
  return [
    event.originalName,
    event.cleanedName ?? '',
    event.fileSize ?? '',
    event.lastModified ?? '',
    event.pageUrl,
  ].join('|');
}

async function recordResumeUpload(
  message: LogUploadMessage,
  sender?: chrome.runtime.MessageSender,
): Promise<ResumeUploadEvent> {
  const event: ResumeUploadEvent = {
    id: `${message.ts}-${Math.random().toString(36).slice(2, 9)}`,
    originalName: message.originalName,
    cleanedName: message.cleanedName,
    renamed: message.renamed,
    source: message.source,
    pageUrl: message.pageUrl,
    ts: message.ts,
    profileFileBase: message.profileFileBase,
    fileSize: message.fileSize,
    lastModified: message.lastModified,
  };

  const existing = await getStoredResumeUploads();
  const key = uploadDedupeKey(event);
  const recentDuplicate = existing.find(
    (item) => uploadDedupeKey(item) === key && Math.abs(item.ts - event.ts) < 2000,
  );
  if (recentDuplicate) {
    console.log('[resume-upload] deduped', {
      originalName: event.originalName,
      source: event.source,
    });
    return recentDuplicate;
  }

  const next = [event, ...existing].slice(0, MAX_RESUME_UPLOAD_EVENTS);
  await chrome.storage.local.set({ [RESUME_UPLOADS_STORAGE_KEY]: next });

  console.log('[resume-upload]', {
    originalName: event.originalName,
    cleanedName: event.cleanedName,
    renamed: event.renamed,
    source: event.source,
    profileFileBase: event.profileFileBase,
    pageUrl: event.pageUrl,
  });

  // Persist to MongoDB bid_records when a bid session is active on this tab.
  void persistResumeUploadToBidSession(event, sender).catch((error) => {
    console.warn('[resume-upload] failed to persist to bid session', error);
  });

  return event;
}

async function getSessionResumeUploads(tabId: number): Promise<
  Array<{
    originalName: string;
    cleanedName: string | null;
    renamed: boolean;
    source: string;
    pageUrl: string;
    ts: number;
  }>
> {
  const key = tabKey('bidSessionResumeUploads', tabId);
  const result = await chrome.storage.local.get(key);
  const raw = result[key];
  return Array.isArray(raw) ? raw : [];
}

async function appendSessionResumeUpload(
  tabId: number,
  event: ResumeUploadEvent,
): Promise<void> {
  const key = tabKey('bidSessionResumeUploads', tabId);
  const existing = await getSessionResumeUploads(tabId);
  const entry = {
    originalName: event.originalName,
    cleanedName: event.cleanedName,
    renamed: event.renamed,
    source: event.source,
    pageUrl: event.pageUrl,
    ts: event.ts,
  };
  await chrome.storage.local.set({ [key]: [...existing, entry].slice(-50) });
}

async function persistResumeUploadToBidSession(
  event: ResumeUploadEvent,
  sender?: chrome.runtime.MessageSender,
): Promise<void> {
  const tabId = sender?.tab?.id;
  if (tabId == null) return;

  const session = await getStoredBidSession(tabId);
  if (session.status !== 'active' || !session.sessionId) return;

  const applierState = await getStoredApplierState();
  await appendSessionResumeUpload(tabId, event);

  await postBidSessionEvent('/bid-session/resume-upload', {
    sessionId: session.sessionId,
    applierName: applierState.applierName ?? '',
    profileId: applierState.profileId,
    url: event.pageUrl,
    originalName: event.originalName,
    cleanedName: event.cleanedName,
    renamed: event.renamed,
    source: event.source,
    pageUrl: event.pageUrl,
    ts: event.ts,
  });
}

async function clearStoredResumeUploads(): Promise<void> {
  await chrome.storage.local.remove(RESUME_UPLOADS_STORAGE_KEY);
}

// Every bid-session storage key is namespaced by the Chrome tabId so each tab
// keeps an independent session, screenshots, analysis history and remembered JD
// context. Switching tabs in the side panel restores that tab's state; closing
// a tab (chrome.tabs.onRemoved) wipes its keys.
const TAB_SESSION_KEY_PREFIXES = [
  'bidSessionId',
  'bidSessionStatus',
  'bidSessionStartedAt',
  'bidSessionCompletedAt',
  'bidSessionShots',
  'bidSessionJdText',
  'bidSessionJdSummary',
  'bidSessionSkillProfile',
  'bidSessionFlags',
  'bidAnalysisTurns',
  'bidAnalysisUsage',
  'bidSessionResumeUploads',
] as const;

function tabKey(prefix: string, tabId: number): string {
  return `${prefix}:${tabId}`;
}

async function getStoredBidSession(tabId: number): Promise<BidSessionState> {
  const result = await chrome.storage.local.get([
    tabKey('bidSessionId', tabId),
    tabKey('bidSessionStatus', tabId),
    tabKey('bidSessionStartedAt', tabId),
    tabKey('bidSessionCompletedAt', tabId),
  ]);

  const status = result[tabKey('bidSessionStatus', tabId)];
  if (status !== 'active' && status !== 'completed') {
    return IDLE_BID_SESSION;
  }

  const id = result[tabKey('bidSessionId', tabId)];
  const startedAt = result[tabKey('bidSessionStartedAt', tabId)];
  const completedAt = result[tabKey('bidSessionCompletedAt', tabId)];
  return {
    sessionId: id ? String(id) : null,
    status,
    startedAt: startedAt ? String(startedAt) : null,
    completedAt: completedAt ? String(completedAt) : null,
  };
}

// Cap stitched height so pathologically tall pages don't blow the bridge body limit.
const MAX_FULLPAGE_HEIGHT = 20000;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Full-page capture via CDP. A single clip for the entire document height repeats
// the viewport on many sites — instead capture viewport-sized strips and stitch.
async function captureFullPageViaDebugger(tabId: number): Promise<string | null> {
  const target: chrome.debugger.Debuggee = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, '1.3');
    attached = true;

    const metrics = (await chrome.debugger.sendCommand(
      target,
      'Page.getLayoutMetrics',
    )) as {
      cssContentSize?: { width: number; height: number };
      contentSize?: { width: number; height: number };
      cssVisualViewport?: { clientWidth?: number; clientHeight?: number };
      cssLayoutViewport?: { clientWidth?: number; clientHeight?: number };
    };

    const content = metrics.cssContentSize ?? metrics.contentSize;
    if (!content?.width || !content?.height) return null;

    const viewport = metrics.cssVisualViewport ?? metrics.cssLayoutViewport;
    const pageWidth = Math.max(1, Math.ceil(viewport?.clientWidth ?? content.width));
    const pageHeight = Math.min(Math.max(1, Math.ceil(content.height)), MAX_FULLPAGE_HEIGHT);
    const viewportHeight = Math.max(1, Math.ceil(viewport?.clientHeight ?? 800));

    const canvas = new OffscreenCanvas(pageWidth, pageHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    for (let y = 0; y < pageHeight; y += viewportHeight) {
      const clipHeight = Math.min(viewportHeight, pageHeight - y);
      const result = (await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
        format: 'jpeg',
        quality: 55,
        captureBeyondViewport: true,
        clip: { x: 0, y, width: pageWidth, height: clipHeight, scale: 1 },
      })) as { data?: string };

      if (!result?.data) continue;

      const blob = await fetch(`data:image/jpeg;base64,${result.data}`).then((r) => r.blob());
      const bitmap = await createImageBitmap(blob);
      ctx.drawImage(bitmap, 0, y, pageWidth, clipHeight);
      bitmap.close();
    }

    const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.55 });
    return await blobToDataUrl(outBlob);
  } catch {
    return null;
  } finally {
    if (attached) {
      try {
        await chrome.debugger.detach(target);
      } catch {
        // Already detached (e.g. tab navigated away); nothing to do.
      }
    }
  }
}

async function captureVisibleViewport(windowId?: number): Promise<string | null> {
  // Process clicks (Apply/Submit/Next) navigate within milliseconds. The tab is
  // often mid-navigation when capture runs, which makes captureVisibleTab throw
  // ("Cannot capture, tab is navigating"). Retry a couple of times so we still
  // grab the page as it was at click time.
  const targetWindow = windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const shot = await chrome.tabs.captureVisibleTab(targetWindow, {
        format: 'jpeg',
        quality: 60,
      });
      if (shot) return shot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[vender-sw] captureVisibleTab attempt ${attempt + 1} failed: ${message}`);
      // The "navigating" / rate-limit errors clear quickly; wait and retry.
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  return null;
}

async function captureTabScreenshot(
  tabId?: number,
  windowId?: number,
  { fullPage = true }: { fullPage?: boolean } = {},
): Promise<string | null> {
  // Process-click captures must be instant — full-page CDP stitching takes
  // seconds and the tab navigates away before it finishes.
  if (fullPage && typeof tabId === 'number') {
    const stitched = await captureFullPageViaDebugger(tabId);
    if (stitched) return stitched;
  }
  return captureVisibleViewport(windowId);
}

const MAX_SESSION_SHOTS = 40;

async function getSessionShots(tabId: number): Promise<BidShot[]> {
  const key = tabKey('bidSessionShots', tabId);
  const result = await chrome.storage.local.get(key);
  return Array.isArray(result[key]) ? (result[key] as BidShot[]) : [];
}

// Persists a screenshot to the live in-extension gallery and notifies any open
// side panel so the capture shows up immediately, not just in MongoDB. The
// BID_SHOT_ADDED message carries the tabId so a panel only appends it when it is
// currently showing that tab.
async function recordShot(tabId: number, shot: BidShot): Promise<void> {
  // Record even when the screenshot is null so a detected Apply/Submit/Next
  // click still appears (as a "No capture" tile) and the user can tell the
  // difference between "click not detected" and "capture failed".
  const shots = await getSessionShots(tabId);
  shots.push(shot);
  const trimmed = shots.slice(-MAX_SESSION_SHOTS);
  await chrome.storage.local.set({ [tabKey('bidSessionShots', tabId)]: trimmed });
  try {
    await chrome.runtime.sendMessage({ type: 'BID_SHOT_ADDED', tabId, shot });
  } catch {
    // No side panel listening; storage still holds it for the next load.
  }
}

const IDLE_SESSION_CONTEXT: BidSessionContext = {
  jdText: null,
  jdSummary: null,
  skillProfile: null,
};

async function getSessionContext(tabId: number): Promise<BidSessionContext> {
  const result = await chrome.storage.local.get([
    tabKey('bidSessionJdText', tabId),
    tabKey('bidSessionJdSummary', tabId),
    tabKey('bidSessionSkillProfile', tabId),
  ]);
  const jdText = result[tabKey('bidSessionJdText', tabId)];
  const jdSummary = result[tabKey('bidSessionJdSummary', tabId)];
  const skillProfile = result[tabKey('bidSessionSkillProfile', tabId)];
  return {
    jdText: jdText ? String(jdText) : null,
    jdSummary: jdSummary ? String(jdSummary) : null,
    skillProfile: skillProfile ? String(skillProfile) : null,
  };
}

async function saveSessionContext(tabId: number, context: BidSessionContext): Promise<void> {
  await chrome.storage.local.set({
    [tabKey('bidSessionJdText', tabId)]: context.jdText,
    [tabKey('bidSessionJdSummary', tabId)]: context.jdSummary,
    [tabKey('bidSessionSkillProfile', tabId)]: context.skillProfile,
  });
}

const EMPTY_FLAGS: BidFlagVerdicts = { remote: null, clearance: null };

// The service worker is the sole writer of the per-tab traffic-light verdicts:
// it computes which flags are still unanswered, asks the bridge for only those,
// and persists the results. The panel only reads them.
async function getSessionFlags(tabId: number): Promise<BidFlagVerdicts> {
  const key = tabKey('bidSessionFlags', tabId);
  const result = await chrome.storage.local.get(key);
  const stored = result[key];
  if (!stored || typeof stored !== 'object') return { ...EMPTY_FLAGS };
  return {
    remote: (stored as BidFlagVerdicts).remote ?? null,
    clearance: (stored as BidFlagVerdicts).clearance ?? null,
  };
}

async function saveSessionFlags(tabId: number, flags: BidFlagVerdicts): Promise<void> {
  await chrome.storage.local.set({ [tabKey('bidSessionFlags', tabId)]: flags });
}

async function postBidSessionEvent(
  path:
    | '/bid-session/start'
    | '/bid-session/event'
    | '/bid-session/analysis'
    | '/bid-session/resume-upload'
    | '/bid-session/complete',
  payload: Record<string, unknown>,
): Promise<{ sessionId: string }> {
  let response: Response;
  try {
    response = await fetch(`${BRIDGE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    throw new Error(bridgeUnreachableMessage(error));
  }

  const data = (await response.json()) as { ok: boolean; sessionId?: string; error?: string };
  if (!response.ok || !data.ok || !data.sessionId) {
    throw new Error(data.error ?? `Bid session request failed (${response.status})`);
  }
  return { sessionId: data.sessionId };
}

function sumUsage(a: UsageSummary, b: UsageSummary): UsageSummary {
  return {
    model: b.model ?? a.model,
    inputTokens: a.inputTokens + b.inputTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cost: a.cost === null || b.cost === null ? null : a.cost + b.cost,
    savings: a.savings === null || b.savings === null ? null : a.savings + b.savings,
  };
}

// Persists a completed analysis (page + skills result and token/cost usage) to
// the main MongoDB bid_records collection for the Vendor Monitor.
async function persistAnalysisRecord(
  sessionId: string | null,
  applierState: StoredApplierState,
  pageContext: { url: string; title: string; visibleText?: string },
  page: PageAnalysisResult,
  skills: SkillAnalysisResult | null,
  usage: UsageSummary,
): Promise<void> {
  if (!sessionId) return;
  try {
    await postBidSessionEvent('/bid-session/analysis', {
      sessionId,
      applierName: applierState.applierName ?? '',
      profileId: applierState.profileId,
      url: pageContext.url,
      title: pageContext.title,
      analysis: {
        isJobPage: page.isJobPage,
        summary: page.summary,
        notJobPageReason: page.notJobPageReason ?? null,
        formAnswers: page.formAnswers,
        skillProfile: skills?.skillProfile ?? null,
        bestResume: skills?.bestResume ?? null,
        topResumes: skills?.topResumes ?? [],
      },
      usage,
      trace: {
        request: {
          url: pageContext.url,
          title: pageContext.title,
          visibleTextExcerpt: pageContext.visibleText?.slice(0, 8000) ?? null,
        },
        response: {
          page: {
            isJobPage: page.isJobPage,
            summary: page.summary,
            notJobPageReason: page.notJobPageReason ?? null,
            formAnswers: page.formAnswers,
          },
          skills: skills
            ? {
                skillProfile: skills.skillProfile,
                bestResume: skills.bestResume,
                topResumes: skills.topResumes,
              }
            : null,
          usage,
        },
      },
    });
  } catch {
    // Recording is best-effort; never fail the analysis because of it.
  }
}

// Reads the tab the side panel is bound to. Throws a clear error if it has gone
// away (closed/navigated to a restricted page) so the panel can surface it.
async function getBidTab(tabId: number): Promise<chrome.tabs.Tab> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    throw new Error('Could not read the active tab. Focus the job tab and try again.');
  }
}

async function startBidSession(tabId: number): Promise<BidSessionState> {
  const applierState = await getStoredApplierState();
  if (!applierState.ready || !applierState.applierName) {
    throw new Error('Load a profile at the top before starting a session.');
  }

  // Do not preflight /health here — a flaky short health check can fail while the
  // bridge is fine (UI already shows "Bridge online"). Let the real start request
  // be the source of truth and surface its error.
  const tab = await getBidTab(tabId);
  await injectBidRecorder(tabId);
  const screenshot = await captureTabScreenshot(tabId, tab.windowId);

  const { sessionId } = await postBidSessionEvent('/bid-session/start', {
    applierName: applierState.applierName,
    profileId: applierState.profileId,
    url: tab.url ?? '',
    title: tab.title ?? '',
    screenshot,
  });

  const startedAt = new Date().toISOString();
  await chrome.storage.local.set({
    [tabKey('bidSessionId', tabId)]: sessionId,
    [tabKey('bidSessionStatus', tabId)]: 'active',
    [tabKey('bidSessionStartedAt', tabId)]: startedAt,
    [tabKey('bidSessionCompletedAt', tabId)]: null,
    [tabKey('bidSessionShots', tabId)]: [],
    [tabKey('bidSessionResumeUploads', tabId)]: [],
    // Clear the previous session's analyze history + accumulated usage + flags.
    [tabKey('bidAnalysisTurns', tabId)]: [],
    [tabKey('bidAnalysisUsage', tabId)]: null,
    [tabKey('bidSessionFlags', tabId)]: EMPTY_FLAGS,
  });
  await saveSessionContext(tabId, IDLE_SESSION_CONTEXT);

  try {
    await chrome.runtime.sendMessage({ type: BID_SESSION_RESET, tabId });
  } catch {
    // No side panel listening; storage is already cleared for next load.
  }

  await recordShot(tabId, {
    type: 'session-start',
    triggerText: null,
    url: tab.url ?? null,
    title: tab.title ?? null,
    screenshot,
    at: startedAt,
  });

  return { sessionId, status: 'active', startedAt, completedAt: null };
}

async function completeBidSession(tabId: number): Promise<BidSessionState> {
  const session = await getStoredBidSession(tabId);
  if (session.status !== 'active' || !session.sessionId) {
    throw new Error('No active session. Start a new session first.');
  }

  const applierState = await getStoredApplierState();
  const tab = await getBidTab(tabId);
  const screenshot = await captureTabScreenshot(tabId, tab.windowId);
  const usageKey = tabKey('bidAnalysisUsage', tabId);
  const stored = await chrome.storage.local.get(usageKey);
  const resumeUploads = await getSessionResumeUploads(tabId);

  await postBidSessionEvent('/bid-session/complete', {
    sessionId: session.sessionId,
    applierName: applierState.applierName ?? '',
    profileId: applierState.profileId,
    url: tab.url ?? '',
    title: tab.title ?? '',
    screenshot,
    usage: stored[usageKey] ?? null,
    resumeUploads,
  });

  const completedAt = new Date().toISOString();
  await chrome.storage.local.set({
    [tabKey('bidSessionStatus', tabId)]: 'completed',
    [tabKey('bidSessionCompletedAt', tabId)]: completedAt,
  });

  await recordShot(tabId, {
    type: 'session-complete',
    triggerText: null,
    url: tab.url ?? null,
    title: tab.title ?? null,
    screenshot,
    at: completedAt,
  });

  return { ...session, status: 'completed', completedAt };
}

async function resolveSenderTab(sender: chrome.runtime.MessageSender): Promise<{
  tabId?: number;
  windowId?: number;
  url: string;
  title: string;
}> {
  let tabId = sender.tab?.id;
  let windowId = sender.tab?.windowId;
  let url = sender.tab?.url ?? sender.url ?? '';
  let title = sender.tab?.title ?? '';

  if (tabId == null) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    windowId = tab?.windowId;
    url = tab?.url ?? url;
    title = tab?.title ?? title;
  }

  return { tabId, windowId, url, title };
}

async function injectBidRecorder(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      func: () => {
        if ((window as unknown as { __bidRecorderMainHook?: boolean }).__bidRecorderMainHook) return;
        (window as unknown as { __bidRecorderMainHook?: boolean }).__bidRecorderMainHook = true;
        const P = /(apply|submit|next|continue|proceed|save)/i;
        const txt = (el: Element | null | undefined) => {
          if (!el?.getAttribute) return '';
          return (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
        };
        const findTarget = (start: EventTarget | null) => {
          let t = start as Element | null;
          for (let i = 0; i < 16 && t; i += 1) {
            if (t.nodeType !== 1) {
              t = t.parentElement;
              continue;
            }
            const s = txt(t);
            if (s && s.length <= 80 && P.test(s)) return s;
            t = t.parentElement;
          }
          return null;
        };
        const post = (label: string) => {
          window.postMessage({ source: 'bid-recorder-hook', triggerText: label }, '*');
        };
        document.addEventListener(
          'pointerdown',
          (e) => {
            const label = findTarget(e.target);
            if (label) post(label);
          },
          true,
        );
        document.addEventListener(
          'click',
          (e) => {
            const label = findTarget(e.target);
            if (label) post(label);
          },
          true,
        );
        document.addEventListener(
          'submit',
          (e) => {
            const submitter = (e as SubmitEvent).submitter as Element | null;
            const label = submitter ? txt(submitter) : 'Submit';
            if (label && P.test(label)) post(label);
            else post('Submit');
          },
          true,
        );
      },
    });
  } catch {
    // Restricted tab — ignore.
  }
}

/**
 * Inject FormData/fetch/XHR resume rename hooks into the page MAIN world.
 * Uses chrome.scripting.executeScript so page CSP cannot block it (unlike
 * CRX dynamic import() of world:MAIN content scripts on Greenhouse).
 */
async function injectResumeUploadHooks(
  tabId: number,
  profileFileBase: string | null,
  frameId?: number,
): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target:
        frameId != null
          ? { tabId, frameIds: [frameId] }
          : { tabId, allFrames: true },
      world: 'MAIN',
      args: [profileFileBase],
      func: (initialProfileFileBase: string | null) => {
        const w = window as unknown as {
          __resumeUploadHook?: boolean;
          __resumeUploadProfileBase?: string | null;
        };

        w.__resumeUploadProfileBase =
          typeof initialProfileFileBase === 'string' && initialProfileFileBase.length > 0
            ? initialProfileFileBase
            : null;

        const HOOK_SOURCE = 'resume-upload-hook';
        const BRIDGE_SOURCE = 'resume-upload-bridge';
        const TARGET_EXT_RE = /\.(pdf|docx)$/i;

        const getProfileBase = () => w.__resumeUploadProfileBase ?? null;

        const isTarget = (name: string) => TARGET_EXT_RE.test(name.trim());

        const buildCleanName = (originalName: string, base: string | null): string | null => {
          if (!base || !isTarget(originalName)) return null;
          const match = originalName.trim().match(TARGET_EXT_RE);
          if (!match) return null;
          const next = `${base}${match[0]}`;
          return next === originalName ? null : next;
        };

        const cloneFile = (file: File, newName: string, originalName: string) => {
          const next = new File([file], newName, {
            type: file.type,
            lastModified: file.lastModified,
          });
          try {
            Object.defineProperty(next, '__bidOriginalName', {
              value: originalName,
              enumerable: false,
              configurable: true,
            });
          } catch {
            (next as File & { __bidOriginalName?: string }).__bidOriginalName = originalName;
          }
          return next;
        };

        const readOriginalName = (file: File, fallback: string): string => {
          const stamped = (file as File & { __bidOriginalName?: unknown }).__bidOriginalName;
          return typeof stamped === 'string' && stamped.length > 0 ? stamped : fallback;
        };

        const postLog = (partial: {
          originalName: string;
          cleanedName: string | null;
          renamed: boolean;
          uploadSource: string;
          fileSize?: number;
          lastModified?: number;
        }) => {
          // Only record real renames — never "already matched" noise.
          if (!partial.renamed || !partial.cleanedName) return;
          try {
            window.postMessage(
              {
                source: HOOK_SOURCE,
                kind: 'log',
                pageUrl: location.href,
                ts: Date.now(),
                profileFileBase: getProfileBase(),
                ...partial,
              },
              '*',
            );
          } catch {
            // ignore
          }
        };

        const rewriteFile = (file: File, uploadSource: string): File => {
          if (!isTarget(file.name)) return file;
          const bidderOriginal = readOriginalName(file, file.name);
          const cleanedName = buildCleanName(file.name, getProfileBase());
          if (!cleanedName) {
            // Input layer already renamed; still surface original if stamped.
            if (bidderOriginal !== file.name) {
              postLog({
                originalName: bidderOriginal,
                cleanedName: file.name,
                renamed: true,
                uploadSource,
                fileSize: file.size,
                lastModified: file.lastModified,
              });
            }
            return file;
          }
          postLog({
            originalName: bidderOriginal,
            cleanedName,
            renamed: true,
            uploadSource,
            fileSize: file.size,
            lastModified: file.lastModified,
          });
          return cloneFile(file, cleanedName, bidderOriginal);
        };

        const rewriteBlob = (
          value: Blob,
          filename: string | undefined,
          uploadSource: string,
        ): { value: Blob; filename?: string } => {
          const name = filename || (value instanceof File ? value.name : '');
          if (!name || !isTarget(name)) return { value, filename };
          const bidderOriginal =
            value instanceof File ? readOriginalName(value, name) : name;
          const cleanedName = buildCleanName(name, getProfileBase());
          if (!cleanedName) {
            if (bidderOriginal !== name) {
              postLog({
                originalName: bidderOriginal,
                cleanedName: name,
                renamed: true,
                uploadSource,
                fileSize: value.size,
                lastModified: value instanceof File ? value.lastModified : undefined,
              });
            }
            return { value, filename };
          }
          postLog({
            originalName: bidderOriginal,
            cleanedName,
            renamed: true,
            uploadSource,
            fileSize: value.size,
            lastModified: value instanceof File ? value.lastModified : undefined,
          });
          if (value instanceof File) {
            return {
              value: cloneFile(value, cleanedName, bidderOriginal),
              filename: cleanedName,
            };
          }
          const next = new File([value], cleanedName, {
            type: value.type,
            lastModified: Date.now(),
          });
          try {
            Object.defineProperty(next, '__bidOriginalName', {
              value: bidderOriginal,
              enumerable: false,
              configurable: true,
            });
          } catch {
            (next as File & { __bidOriginalName?: string }).__bidOriginalName = bidderOriginal;
          }
          return { value: next, filename: cleanedName };
        };

        // Always refresh profile base from bridge messages (idempotent).
        window.addEventListener('message', (event: MessageEvent) => {
          if (event.source !== window) return;
          const data = event.data as {
            source?: string;
            kind?: string;
            profileFileBase?: string | null;
          } | null;
          if (!data || data.source !== BRIDGE_SOURCE || data.kind !== 'config') return;
          w.__resumeUploadProfileBase =
            typeof data.profileFileBase === 'string' && data.profileFileBase.length > 0
              ? data.profileFileBase
              : null;
        });

        if (w.__resumeUploadHook) {
          try {
            window.postMessage({ source: HOOK_SOURCE, kind: 'ready' }, '*');
          } catch {
            // ignore
          }
          return;
        }
        w.__resumeUploadHook = true;

        // File <input> rewriting is handled in the isolated bridge (CSP-safe).
        // MAIN world only patches network upload APIs.

        const originalAppend = FormData.prototype.append;
        const originalSet = FormData.prototype.set;

        FormData.prototype.append = function append(
          name: string,
          value: string | Blob,
          filename?: string,
        ) {
          if (typeof value === 'string') {
            return originalAppend.call(this, name, value);
          }
          const rewritten = rewriteBlob(value, filename, 'formdata');
          if (rewritten.filename !== undefined) {
            return originalAppend.call(this, name, rewritten.value, rewritten.filename);
          }
          return originalAppend.call(this, name, rewritten.value);
        } as typeof FormData.prototype.append;

        FormData.prototype.set = function set(
          name: string,
          value: string | Blob,
          filename?: string,
        ) {
          if (typeof value === 'string') {
            return originalSet.call(this, name, value);
          }
          const rewritten = rewriteBlob(value, filename, 'formdata');
          if (rewritten.filename !== undefined) {
            return originalSet.call(this, name, rewritten.value, rewritten.filename);
          }
          return originalSet.call(this, name, rewritten.value);
        } as typeof FormData.prototype.set;

        const originalFetch = window.fetch.bind(window);
        window.fetch = function patchedFetch(
          input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> {
          try {
            if (init?.body instanceof File) {
              const next = rewriteFile(init.body, 'fetch');
              if (next !== init.body) {
                return originalFetch(input, { ...init, body: next });
              }
            }
          } catch {
            // fall through
          }
          return originalFetch(input, init);
        };

        const originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function patchedSend(
          body?: Document | XMLHttpRequestBodyInit | null,
        ) {
          try {
            if (body instanceof File) {
              return originalSend.call(this, rewriteFile(body, 'xhr'));
            }
          } catch {
            // fall through
          }
          return originalSend.call(this, body);
        };

        try {
          window.postMessage({ source: HOOK_SOURCE, kind: 'ready' }, '*');
        } catch {
          // ignore
        }
        console.info('[resume-upload] MAIN hooks installed via executeScript');
      },
    });
  } catch (error) {
    console.warn('[resume-upload] executeScript inject failed', error);
  }
}

async function recordBidProcessClick(
  triggerText: string,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  const tabId = sender.tab?.id;
  if (tabId == null) {
    console.warn('[vender-sw] BID_PROCESS_CLICK ignored — no sender tab', { triggerText });
    return;
  }

  // Kick off the capture before anything else — the page is navigating away.
  // Use a viewport-only grab (no CDP): attaching chrome.debugger mid-click
  // interrupts the page's own event handling, so the SPA's submit handler never
  // runs and the browser falls back to a native form submission (full refresh).
  const windowId = sender.tab?.windowId;
  const screenshotPromise = captureTabScreenshot(tabId, windowId, { fullPage: false });

  const session = await getStoredBidSession(tabId);
  if (session.status !== 'active' || !session.sessionId) {
    console.warn('[vender-sw] BID_PROCESS_CLICK ignored — no active session', {
      triggerText,
      status: session.status,
    });
    return;
  }

  const [screenshot, tabInfo, applierState] = await Promise.all([
    screenshotPromise,
    resolveSenderTab(sender),
    getStoredApplierState(),
  ]);
  const { url, title } = tabInfo;

  console.log('[vender-sw] process click captured', {
    triggerText,
    hasScreenshot: Boolean(screenshot),
    screenshotKb: screenshot ? Math.round(screenshot.length / 1024) : 0,
    url,
  });

  // Update the live in-extension gallery FIRST so a screenshot always shows,
  // even if the local bridge / DB write fails.
  await recordShot(tabId, {
    type: 'process',
    triggerText,
    url: url || null,
    title: title || null,
    screenshot,
    at: new Date().toISOString(),
  });

  // Persist to MongoDB via the bridge — best effort, never blocks the gallery.
  try {
    await postBidSessionEvent('/bid-session/event', {
      sessionId: session.sessionId,
      applierName: applierState.applierName ?? '',
      profileId: applierState.profileId,
      url,
      title,
      triggerText,
      screenshot,
    });
  } catch (error) {
    console.warn(
      '[vender-sw] failed to persist process click to bridge:',
      error instanceof Error ? error.message : error,
    );
  }
}

async function getStoredCredentials(): Promise<StoredCredentials | null> {
  const result = await chrome.storage.local.get(['gmailEmail', 'gmailAppPassword']);
  if (!result.gmailEmail || !result.gmailAppPassword) {
    return null;
  }
  return {
    email: result.gmailEmail as string,
    appPassword: result.gmailAppPassword as string,
  };
}

async function saveCredentials(credentials: GmailCredentials): Promise<void> {
  await chrome.storage.local.set({
    gmailEmail: credentials.email.trim(),
    gmailAppPassword: credentials.appPassword.replace(/\s/g, ''),
  });
}

async function clearCredentials(): Promise<void> {
  await chrome.storage.local.remove(['gmailEmail', 'gmailAppPassword']);
}

async function getBridgeStatus(): Promise<{
  running: boolean;
  mongoConnected: boolean;
  mongoError: string | null;
}> {
  try {
    const response = await fetch(`${BRIDGE_URL}/health`, {
      signal: AbortSignal.timeout(BRIDGE_HEALTH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        running: false,
        mongoConnected: false,
        mongoError: bridgeUnreachableMessage(`HTTP ${response.status}`),
      };
    }
    const data = (await response.json()) as {
      mongoConnected?: boolean;
      mongoError?: string | null;
    };
    return {
      running: true,
      mongoConnected: Boolean(data.mongoConnected),
      mongoError: data.mongoConnected ? null : data.mongoError ?? 'Database not connected',
    };
  } catch (error) {
    return {
      running: false,
      mongoConnected: false,
      mongoError: bridgeUnreachableMessage(error),
    };
  }
}

async function bridgePost(path: string, payload: Record<string, unknown>) {
  const applierState = await getStoredApplierState();
  const credentials = await getStoredCredentials();

  const body: Record<string, unknown> = {
    label: GMAIL_LABEL,
    ...payload,
  };

  if (applierState.ready && applierState.applierName) {
    body.applierName = applierState.applierName;
  } else if (credentials?.email && credentials?.appPassword) {
    body.email = credentials.email;
    body.password = credentials.appPassword;
  } else {
    throw new Error('Load a profile at the top, or add Gmail credentials in Inbox settings.');
  }

  let response: Response;
  try {
    response = await fetch(`${BRIDGE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) {
    throw new Error(bridgeUnreachableMessage(error));
  }

  const data = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? `Bridge request failed (${response.status})`);
  }

  return data;
}

async function verifyApplierProfile(applierName: string): Promise<ProfileVerification> {
  let response: Response;
  try {
    response = await fetch(`${BRIDGE_URL}/profile/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applierName: applierName.trim() }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) {
    throw new Error(bridgeUnreachableMessage(error));
  }

  const data = (await response.json()) as ProfileVerification & { ok: boolean; error?: string };
  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? `Profile verification failed (${response.status})`);
  }

  return {
    ready: Boolean(data.ready),
    applierName: data.applierName,
    profileId: data.profileId ?? null,
    accountExists: data.accountExists,
    profileEmail: data.profileEmail ?? null,
    checks: data.checks,
  };
}

async function fetchInboxPageFromBridge(
  beforeSeq: number | null,
  batchSize: number,
): Promise<InboxPageResult> {
  const data = (await bridgePost('/inbox', {
    beforeSeq,
    batchSize,
  })) as InboxPageResult & { ok: boolean };

  return {
    emails: data.emails ?? [],
    hasMore: data.hasMore ?? false,
    nextBeforeSeq: data.nextBeforeSeq ?? null,
    scanned: data.scanned ?? batchSize,
  };
}

async function fetchEmailBodyFromBridge(uid: string): Promise<BridgeEmail> {
  const data = (await bridgePost('/message', { uid })) as { message: BridgeEmail };
  return data.message;
}

function isRestrictedTabUrl(url: string | undefined): boolean {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('devtools://')
  );
}

async function extractActiveTabContext(tabId: number) {
  const tab = await getBidTab(tabId);

  if (isRestrictedTabUrl(tab.url)) {
    throw new Error('Cannot read this page. Open a normal website tab (not chrome:// or extension pages).');
  }

  let injection;
  try {
    [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageContext,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Could not read this page (${detail}). Reload the page and try again.`);
  }

  const pageContext = injection?.result;
  if (!pageContext) {
    throw new Error('Failed to read page content from the active tab.');
  }

  if (pageContext.visibleText.length < 80) {
    throw new Error('Page text is too short. Scroll to load the full job description, then try again.');
  }

  return pageContext;
}

async function bridgeAnalyze<T>(
  path: '/job-analyze/page' | '/job-analyze/skills' | '/job-analyze/flags',
  pageContext: unknown,
  applierName: string,
  sessionContext: BidSessionContext,
  extraBody: Record<string, unknown> = {},
): Promise<{ result: T; usage: UsageSummary }> {
  let response: Response;
  try {
    response = await fetch(`${BRIDGE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageContext, applierName, sessionContext, ...extraBody }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) {
    throw new Error(bridgeUnreachableMessage(error));
  }

  const data = (await response.json()) as {
    ok: boolean;
    result?: T;
    usage?: UsageSummary;
    error?: string;
  };
  if (!response.ok || !data.ok || !data.result || !data.usage) {
    throw new Error(data.error ?? `Job analysis failed (${response.status})`);
  }

  return { result: data.result, usage: data.usage };
}

// MV3 terminates idle service workers (~30s), which kills in-flight port
// streaming during the long bridge fetches. Pinging a trivial chrome API on an
// interval resets the idle timer so the worker survives a full analysis run.
function startKeepAlive(): () => void {
  const interval = setInterval(() => {
    chrome.runtime.getPlatformInfo().catch(() => undefined);
  }, 20_000);
  return () => clearInterval(interval);
}

async function runJobAnalysis(port: chrome.runtime.Port, tabId: number): Promise<void> {
  const send = (event: AnalysisEvent) => {
    try {
      port.postMessage(event);
    } catch {
      // Port closed by the panel; nothing to do.
    }
  };

  const stopKeepAlive = startKeepAlive();

  try {
    const applierState = await getStoredApplierState();
    if (!applierState.ready || !applierState.applierName) {
      throw new Error('Load a profile at the top (type applier name and click Load) before analyzing.');
    }

    const session = await getStoredBidSession(tabId);
    if (session.status !== 'active') {
      throw new Error('Start a new session before analyzing. Click "Start New Session" first.');
    }

    const sessionContext = await getSessionContext(tabId);

    send({ stage: 'status', message: 'Reading the active tab…' });
    const pageContext = await extractActiveTabContext(tabId);
    send({ stage: 'page-context', pageUrl: pageContext.url, pageTitle: pageContext.title });

    // Kick off the traffic-light flag check concurrently with page+skills, but
    // only for verdicts not yet resolved this session (sticky: once decided we
    // stop asking, and when both are decided we skip the request entirely).
    const storedFlags = await getSessionFlags(tabId);
    const neededFlags: BidFlag[] = [];
    if (!storedFlags.remote) neededFlags.push('remote');
    if (!storedFlags.clearance) neededFlags.push('clearance');
    const flagsPromise =
      neededFlags.length > 0
        ? bridgeAnalyze<BidFlagsResult>(
            '/job-analyze/flags',
            pageContext,
            applierState.applierName,
            sessionContext,
            { neededFlags },
          )
        : null;

    send({ stage: 'status', message: 'Detecting job page and drafting answers…' });
    const page = await bridgeAnalyze<PageAnalysisResult>(
      '/job-analyze/page',
      pageContext,
      applierState.applierName,
      sessionContext,
    );
    send({ stage: 'page', result: page.result, usage: page.usage });

    // Remember the richest job description seen this session so later form
    // pages (different URL, no JD on screen) keep their context.
    const updatedContext: BidSessionContext = { ...sessionContext };
    if (page.result.isJobPage) {
      if (
        pageContext.visibleText &&
        pageContext.visibleText.length > (sessionContext.jdText?.length ?? 0)
      ) {
        updatedContext.jdText = pageContext.visibleText;
      }
      if (page.result.summary) {
        updatedContext.jdSummary = page.result.summary;
      }
    } else if (
      pageContext.visibleText &&
      pageContext.visibleText.length > 400 &&
      pageContext.visibleText.length > (sessionContext.jdText?.length ?? 0)
    ) {
      // Some ATS job overview pages are misclassified; still remember the JD text.
      updatedContext.jdText = pageContext.visibleText;
    }

    let skillsResult: SkillAnalysisResult | null = null;
    let turnUsage: UsageSummary = page.usage;
    const hasJdContext = Boolean(
      page.result.isJobPage ||
        updatedContext.jdText ||
        sessionContext.jdText ||
        updatedContext.skillProfile ||
        sessionContext.skillProfile,
    );
    if (hasJdContext) {
      send({ stage: 'status', message: 'Extracting skills and matching resumes…' });
      const skills = await bridgeAnalyze<SkillAnalysisResult>(
        '/job-analyze/skills',
        pageContext,
        applierState.applierName,
        updatedContext,
      );
      updatedContext.skillProfile = skills.result.skillProfile || updatedContext.skillProfile;
      skillsResult = skills.result;
      turnUsage = sumUsage(page.usage, skills.usage);
      send({ stage: 'skills', result: skills.result, usage: skills.usage });
    }

    // Resolve the concurrent flag request (best-effort — a failed flag check
    // never fails the analysis). Roll its tokens into the session total and
    // persist the merged verdicts so they stay resolved for later Analyze runs.
    if (flagsPromise) {
      try {
        const flags = await flagsPromise;
        if (flags.usage) turnUsage = sumUsage(turnUsage, flags.usage);
        await saveSessionFlags(tabId, {
          remote: flags.result.remote ?? storedFlags.remote,
          clearance: flags.result.clearance ?? storedFlags.clearance,
        });
        send({ stage: 'flags', result: flags.result, usage: flags.usage });
      } catch (error) {
        console.warn(
          '[vender-sw] flag analysis failed:',
          error instanceof Error ? error.message : error,
        );
      }
    }

    await saveSessionContext(tabId, updatedContext);
    await persistAnalysisRecord(
      session.sessionId,
      applierState,
      pageContext,
      page.result,
      skillsResult,
      turnUsage,
    );
    send({ stage: 'done' });
  } catch (error) {
    send({
      stage: 'error',
      error: error instanceof Error ? error.message : 'Something went wrong',
    });
  } finally {
    stopKeepAlive();
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== JOB_ANALYSIS_PORT) return;
  port.onMessage.addListener((message: { type?: string; tabId?: number }) => {
    if (message?.type === 'START' && typeof message.tabId === 'number') {
      void runJobAnalysis(port, message.tabId);
    }
  });
});

// Re-inject MAIN-world click hooks after SPA navigations while that tab's
// session is live.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  void (async () => {
    const session = await getStoredBidSession(tabId);
    if (session.status === 'active' && session.sessionId) {
      await injectBidRecorder(tabId);
    }
  })();
});

// Closing a tab discards its per-tab session state (a closed tab can't be
// returned to) and keeps chrome.storage.local from accumulating dead sessions.
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.local.remove(
    TAB_SESSION_KEY_PREFIXES.map((prefix) => tabKey(prefix, tabId)),
  );
});

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  void (async () => {
    try {
      switch (message.type) {
        case 'GET_CREDENTIALS': {
          const credentials = await getStoredCredentials();
          sendResponse({ ok: true, credentials } satisfies Response);
          break;
        }
        case 'SAVE_CREDENTIALS': {
          await saveCredentials(message.credentials);
          sendResponse({ ok: true } satisfies Response);
          break;
        }
        case 'CLEAR_CREDENTIALS': {
          await clearCredentials();
          sendResponse({ ok: true } satisfies Response);
          break;
        }
        case 'CHECK_BRIDGE': {
          const bridgeStatus = await getBridgeStatus();
          sendResponse({
            ok: true,
            bridgeRunning: bridgeStatus.running && bridgeStatus.mongoConnected,
            bridgeStatus,
          } satisfies Response);
          break;
        }
        case 'GET_APPLIER_STATE': {
          const state = await getStoredApplierState();
          sendResponse({ ok: true, state } satisfies Response);
          break;
        }
        case 'LOAD_APPLIER_PROFILE': {
          const verification = await verifyApplierProfile(message.applierName);
          await saveApplierState(verification);
          sendResponse({ ok: true, verification } satisfies Response);
          break;
        }
        case 'CLEAR_APPLIER_PROFILE': {
          await clearApplierState();
          sendResponse({ ok: true } satisfies Response);
          break;
        }
        case 'GET_BID_SESSION': {
          const session = await getStoredBidSession(message.tabId);
          sendResponse({ ok: true, session } satisfies Response);
          break;
        }
        case 'START_BID_SESSION': {
          const session = await startBidSession(message.tabId);
          sendResponse({ ok: true, session } satisfies Response);
          break;
        }
        case 'COMPLETE_BID_SESSION': {
          const session = await completeBidSession(message.tabId);
          sendResponse({ ok: true, session } satisfies Response);
          break;
        }
        case 'GET_BID_SHOTS': {
          const shots = await getSessionShots(message.tabId);
          sendResponse({ ok: true, shots } satisfies Response);
          break;
        }
        case 'BID_PROCESS_CLICK': {
          await recordBidProcessClick(message.triggerText, sender);
          sendResponse({ ok: true } satisfies Response);
          break;
        }
        case 'LOG_UPLOAD': {
          await recordResumeUpload(message, sender);
          sendResponse({ ok: true } satisfies Response);
          break;
        }
        case 'INJECT_RESUME_UPLOAD_HOOKS': {
          const tabId = sender.tab?.id;
          if (tabId != null) {
            await injectResumeUploadHooks(
              tabId,
              message.profileFileBase,
              sender.frameId,
            );
          }
          sendResponse({ ok: true } satisfies Response);
          break;
        }
        case 'GET_RESUME_UPLOADS': {
          const uploads = await getStoredResumeUploads();
          sendResponse({ ok: true, uploads });
          break;
        }
        case 'CLEAR_RESUME_UPLOADS': {
          await clearStoredResumeUploads();
          sendResponse({ ok: true } satisfies Response);
          break;
        }
        case 'FETCH_INBOX_PAGE': {
          const page = await fetchInboxPageFromBridge(
            message.beforeSeq,
            message.batchSize ?? INBOX_BATCH_SIZE,
          );
          sendResponse({ ok: true, page } satisfies Response);
          break;
        }
        case 'FETCH_EMAIL_BODY': {
          const emailMessage = await fetchEmailBodyFromBridge(message.uid);
          sendResponse({ ok: true, message: emailMessage } satisfies Response);
          break;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' } satisfies Response);
      }
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Something went wrong',
      } satisfies Response);
    }
  })();

  return true;
});
