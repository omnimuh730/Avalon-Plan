import { GMAIL_LABEL, INBOX_BATCH_SIZE } from '@/lib/constants';
import { extractPageContext, mergePageContexts } from '@/lib/page-context';
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
/** Same Athens API the Vendor Monitor Tasks tab uses — source of truth for Bid ready jobs. */
const ATHENS_API_URL = (import.meta.env.VITE_ATHENS_API_URL ?? 'http://127.0.0.1:8979/api').replace(
  /\/$/,
  '',
);
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
  | { type: 'FETCH_BID_QUEUE'; limit?: number; preview?: number }
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
  | {
      ok: true;
      total: number;
      preview: {
        jobId: string;
        title: string;
        company: string;
        applyUrl: string;
        source: string;
        bidReadyDate: string | null;
      }[];
    }
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

async function getSessionBestResumeName(tabId: number): Promise<string | null> {
  const key = tabKey('bidSessionBestResume', tabId);
  const result = await chrome.storage.local.get(key);
  const value = result[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function saveSessionBestResumeName(tabId: number, name: string | null): Promise<void> {
  await chrome.storage.local.set({
    [tabKey('bidSessionBestResume', tabId)]: name?.trim() || null,
  });
}

async function recordResumeUpload(
  message: LogUploadMessage,
  sender?: chrome.runtime.MessageSender,
): Promise<ResumeUploadEvent> {
  const tabId = sender?.tab?.id;
  const recommendedFromSession =
    tabId != null ? await getSessionBestResumeName(tabId) : null;

  const event: ResumeUploadEvent = {
    id: `${message.ts}-${Math.random().toString(36).slice(2, 9)}`,
    originalName: message.originalName,
    cleanedName: message.cleanedName,
    renamed: message.renamed,
    source: message.source,
    pageUrl: message.pageUrl,
    ts: message.ts,
    profileFileBase: message.profileFileBase,
    recommendedResumeName:
      message.recommendedResumeName?.trim() || recommendedFromSession || null,
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
    recommendedResumeName: event.recommendedResumeName,
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
    recommendedResumeName?: string | null;
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
    recommendedResumeName: event.recommendedResumeName ?? null,
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
    recommendedResumeName: event.recommendedResumeName ?? null,
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
  'bidSessionBestResume',
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

async function captureVisibleViewport(
  windowId?: number,
  { attempts = 3, delayMs = 120 }: { attempts?: number; delayMs?: number } = {},
): Promise<string | null> {
  // Process clicks (Apply/Submit/Next) often navigate within milliseconds.
  // captureVisibleTab throws while the tab is navigating — retry briefly.
  const targetWindow = windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const shot = await chrome.tabs.captureVisibleTab(targetWindow, {
        format: 'jpeg',
        quality: 60,
      });
      if (shot) return shot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[vender-sw] captureVisibleTab attempt ${attempt + 1} failed: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

async function waitForTabComplete(tabId: number, timeoutMs = 4000): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
  } catch {
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, timeoutMs);

    function finish() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }

    function onUpdated(updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') finish();
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

/**
 * Viewport capture tuned for process clicks that may navigate away immediately.
 * Tries immediately, then again after the tab settles.
 */
async function captureProcessClickViewport(
  tabId: number,
  windowId?: number,
): Promise<string | null> {
  const immediate = await captureVisibleViewport(windowId, { attempts: 4, delayMs: 80 });
  if (immediate) return immediate;

  await waitForTabComplete(tabId, 4000);
  // Small settle delay so layout paints before capture.
  await new Promise((resolve) => setTimeout(resolve, 150));
  return captureVisibleViewport(windowId, { attempts: 5, delayMs: 150 });
}

async function captureTabScreenshot(
  tabId?: number,
  windowId?: number,
  { fullPage = true }: { fullPage?: boolean } = {},
): Promise<string | null> {
  // Prefer CDP full-page stitching for session start / analyze. Process clicks
  // pass fullPage:false and use a dedicated viewport helper instead.
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
  flags: BidFlagVerdicts,
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
      flags,
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
          flags,
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
    [tabKey('bidSessionBestResume', tabId)]: null,
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

type BidQueueJobRow = {
  jobId: string;
  title: string;
  company: string;
  applyUrl: string;
  source: string;
  bidReadyDate: string | null;
};

async function fetchBidQueueFromAthens(
  applierName: string,
  limit: number,
  previewCount: number,
): Promise<{ total: number; preview: BidQueueJobRow[] }> {
  const params = new URLSearchParams({ applierName });
  const response = await fetch(`${ATHENS_API_URL}/vendor/tasks?${params}`, {
    signal: AbortSignal.timeout(15000),
  });
  const data = (await response.json()) as {
    success?: boolean;
    error?: string;
    tasks?: Array<{
      jobId?: string | null;
      title?: string;
      company?: string;
      applyUrl?: string | null;
      source?: string;
      addedAt?: string | null;
      progress?: string;
      status?: string;
    }>;
  };
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Athens bid queue failed (${response.status})`);
  }
  const pending = (Array.isArray(data.tasks) ? data.tasks : []).filter(
    (t) => t.progress !== 'completed' && t.status !== 'done' && t.status !== 'skipped',
  );
  const jobs: BidQueueJobRow[] = pending.map((t) => ({
    jobId: String(t.jobId || ''),
    title: String(t.title || 'Untitled role'),
    company: String(t.company || ''),
    applyUrl: String(t.applyUrl || ''),
    source: String(t.source || ''),
    bidReadyDate: t.addedAt ?? null,
  }));
  const take = Math.max(1, Math.min(50, limit));
  const sliced = jobs.slice(0, take);
  const show = Math.max(0, Math.min(previewCount, sliced.length));
  return { total: jobs.length, preview: sliced.slice(0, show) };
}

async function fetchBidQueueFromBridge(
  applierName: string,
  limit: number,
  previewCount: number,
): Promise<{ total: number; preview: BidQueueJobRow[] }> {
  const params = new URLSearchParams({
    applierName,
    limit: String(limit),
    preview: String(previewCount),
  });
  const response = await fetch(`${BRIDGE_URL}/bid-queue?${params}`, {
    signal: AbortSignal.timeout(15000),
  });
  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    total?: number;
    preview?: BidQueueJobRow[];
  };
  if (response.status === 404) {
    throw new Error(
      'Bridge is missing /bid-queue — restart vender-server (`npm run bridge`) or use Athens API.',
    );
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Bid queue failed (${response.status})`);
  }
  return {
    total: data.total ?? 0,
    preview: Array.isArray(data.preview) ? data.preview : [],
  };
}

async function fetchBidQueue(limit = 8, preview = 3): Promise<{
  total: number;
  preview: BidQueueJobRow[];
}> {
  const applierState = await getStoredApplierState();
  if (!applierState.ready || !applierState.applierName) {
    throw new Error('Load a profile at the top before viewing the bid queue.');
  }
  const name = applierState.applierName;

  // Prefer Athens (same source as Vendor Monitor Tasks). Fall back to bridge.
  try {
    return await fetchBidQueueFromAthens(name, limit, preview);
  } catch (athensErr) {
    try {
      return await fetchBidQueueFromBridge(name, limit, preview);
    } catch (bridgeErr) {
      const athensMsg = athensErr instanceof Error ? athensErr.message : String(athensErr);
      const bridgeMsg = bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr);
      throw new Error(
        `Could not load bid queue. Athens: ${athensMsg}. Bridge: ${bridgeMsg}. Is Athens-server on ${ATHENS_API_URL}?`,
      );
    }
  }
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
  const flags = await getSessionFlags(tabId);

  await postBidSessionEvent('/bid-session/complete', {
    sessionId: session.sessionId,
    applierName: applierState.applierName ?? '',
    profileId: applierState.profileId,
    url: tab.url ?? '',
    title: tab.title ?? '',
    screenshot,
    usage: stored[usageKey] ?? null,
    resumeUploads,
    flags,
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
    // Hold-until-screenshot protocol (same as bid-recorder-main.ts hold-v1).
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      func: () => {
        const HOOK_VERSION = 'hold-v1';
        const w = window as unknown as {
          __bidRecorderMainHook?: string;
          __bidReplayAction?: boolean;
        };
        if (w.__bidRecorderMainHook === HOOK_VERSION) return;
        w.__bidRecorderMainHook = HOOK_VERSION;

        const P = /(apply|submit|next|continue|proceed|save)/i;
        const ACTION =
          'a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], label';
        const SOURCE = 'bid-recorder-hook';
        const BRIDGE = 'bid-recorder-bridge';
        const HOLD_TIMEOUT_MS = 8000;

        type Pending =
          | { kind: 'click'; label: string; element: Element }
          | {
              kind: 'submit';
              label: string;
              form: HTMLFormElement;
              submitter: HTMLElement | null;
            };

        let pending: Pending | null = null;
        let holding = false;
        let holdTimer: number | null = null;

        const labelFor = (el: Element | null | undefined): string | null => {
          if (!el?.getAttribute) return null;
          const aria = el.getAttribute('aria-label')?.trim();
          if (aria && aria.length <= 120 && P.test(aria)) {
            return aria.replace(/\s+/g, ' ').trim();
          }
          if (el instanceof HTMLInputElement) {
            const v = (el.value || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
            if (v && v.length <= 120 && P.test(v)) return v;
          }
          let direct = '';
          for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) direct += node.textContent ?? '';
          }
          direct = direct.replace(/\s+/g, ' ').trim();
          if (direct && direct.length <= 120 && P.test(direct)) return direct;
          const full = (el.textContent || el.getAttribute('title') || '')
            .replace(/\s+/g, ' ')
            .trim();
          if (full && full.length <= 120 && P.test(full)) return full;
          if (el instanceof HTMLAnchorElement) {
            const href = el.getAttribute('href') || '';
            if (/apply|application/i.test(href)) {
              return direct || (full.length <= 120 ? full : '') || 'Apply';
            }
          }
          return null;
        };

        const collect = (event: Event) => {
          const out: Element[] = [];
          const seen = new Set<Element>();
          const push = (el: Element | null | undefined) => {
            if (!el || seen.has(el)) return;
            seen.add(el);
            out.push(el);
          };
          if (event.target instanceof Element) {
            let cur: Element | null = event.target;
            for (let i = 0; i < 16 && cur; i += 1) {
              push(cur);
              cur = cur.parentElement;
            }
          }
          if (typeof event.composedPath === 'function') {
            for (const node of event.composedPath()) {
              if (node instanceof Element) push(node);
            }
          }
          return out;
        };

        const findTrigger = (event: Event) => {
          for (const node of collect(event)) {
            const s = labelFor(node);
            if (!s) continue;
            if (node.matches(ACTION) || node.closest(ACTION) || node.closest('form')) {
              return { label: s, element: node };
            }
            const tag = node.tagName.toLowerCase();
            if (tag === 'button' || tag === 'a' || tag === 'label' || tag === 'input') {
              return { label: s, element: node };
            }
          }
          return null;
        };

        const clearHoldTimer = () => {
          if (holdTimer != null) {
            window.clearTimeout(holdTimer);
            holdTimer = null;
          }
        };

        const replay = () => {
          clearHoldTimer();
          const action = pending;
          pending = null;
          holding = false;
          if (!action) return;
          w.__bidReplayAction = true;
          try {
            if (action.kind === 'click') {
              const el = action.element;
              if (el instanceof HTMLAnchorElement && el.href) {
                if (el.target && el.target !== '_self' && el.target !== '') {
                  window.open(el.href, el.target);
                } else {
                  window.location.assign(el.href);
                }
              } else if (el instanceof HTMLElement) {
                el.click();
              } else {
                el.dispatchEvent(
                  new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
                );
              }
            } else if (typeof action.form.requestSubmit === 'function') {
              action.form.requestSubmit(action.submitter ?? undefined);
            } else {
              action.form.submit();
            }
          } finally {
            queueMicrotask(() => {
              w.__bidReplayAction = false;
            });
            window.setTimeout(() => {
              w.__bidReplayAction = false;
            }, 300);
          }
        };

        const beginHold = (action: Pending, event: Event) => {
          if (w.__bidReplayAction || holding) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          holding = true;
          pending = action;
          clearHoldTimer();
          holdTimer = window.setTimeout(() => {
            console.warn('[bid-recorder-main] hold timed out — replaying action');
            replay();
          }, HOLD_TIMEOUT_MS);
          window.postMessage(
            { source: SOURCE, type: 'hold-capture', triggerText: action.label },
            '*',
          );
        };

        document.addEventListener(
          'click',
          (e) => {
            if (w.__bidReplayAction || holding) return;
            if (typeof e.button === 'number' && e.button !== 0) return;
            const hit = findTrigger(e);
            if (!hit) return;
            beginHold({ kind: 'click', label: hit.label, element: hit.element }, e);
          },
          true,
        );

        document.addEventListener(
          'submit',
          (e) => {
            if (w.__bidReplayAction || holding) return;
            const form = e.target;
            if (!(form instanceof HTMLFormElement)) return;
            const submitter =
              (e as SubmitEvent).submitter instanceof HTMLElement
                ? ((e as SubmitEvent).submitter as HTMLElement)
                : null;
            const label = (submitter && labelFor(submitter)) || findTrigger(e)?.label || 'Submit';
            beginHold({ kind: 'submit', label, form, submitter }, e);
          },
          true,
        );

        window.addEventListener('message', (event) => {
          if (event.source !== window) return;
          const data = event.data as { source?: string; type?: string } | null;
          if (data?.source !== BRIDGE || data.type !== 'resume-action') return;
          replay();
        });
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
): Promise<{ persist: Promise<void> } | null> {
  const tabId = sender.tab?.id;
  if (tabId == null) {
    console.warn('[vender-sw] BID_PROCESS_CLICK ignored — no sender tab', { triggerText });
    return null;
  }

  const [session, tabInfo, applierState] = await Promise.all([
    getStoredBidSession(tabId),
    resolveSenderTab(sender),
    getStoredApplierState(),
  ]);

  if (session.status !== 'active' || !session.sessionId) {
    console.warn('[vender-sw] BID_PROCESS_CLICK ignored — no active session', {
      triggerText,
      status: session.status,
    });
    return null;
  }

  const windowId = sender.tab?.windowId;
  // Click is held — full-page CDP captures the filled form before navigation.
  let screenshot = await captureTabScreenshot(tabId, windowId, { fullPage: true });
  if (!screenshot) {
    screenshot = await captureVisibleViewport(windowId, { attempts: 3, delayMs: 80 });
  }

  const { url, title } = tabInfo;
  const at = new Date().toISOString();

  console.log('[vender-sw] process click captured', {
    triggerText,
    fullPage: true,
    hasScreenshot: Boolean(screenshot),
    screenshotKb: screenshot ? Math.round(screenshot.length / 1024) : 0,
    url,
  });

  // Local gallery before resume (fast). Mongo must not extend the click hold.
  await recordShot(tabId, {
    type: 'process',
    triggerText,
    url: url || null,
    title: title || null,
    screenshot,
    at,
  });

  const persist = (async () => {
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
  })();

  return { persist };
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

  let injections;
  try {
    // allFrames: true — iCIMS and similar ATS hosts put the JD / application
    // form inside an iframe. Parent-frame-only scrapes miss that content.
    injections = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: extractPageContext,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Could not read this page (${detail}). Reload the page and try again.`);
  }

  const frames = (injections ?? [])
    .map((entry) => entry?.result)
    .filter((result): result is NonNullable<typeof result> => Boolean(result));

  const pageContext = mergePageContexts(frames, {
    url: tab.url ?? undefined,
    title: tab.title ?? undefined,
  });

  if (!pageContext) {
    throw new Error('Failed to read page content from the active tab.');
  }

  if (pageContext.visibleText.length < 80) {
    throw new Error('Page text is too short. Scroll to load the full job description, then try again.');
  }

  console.log('[vender-sw] page context extracted', {
    frames: frames.length,
    usefulChars: pageContext.sourceMeta.charCount,
    primaryFrame: pageContext.sourceMeta.primaryFrameUrl,
    frameUrls: pageContext.sourceMeta.frameUrls,
  });

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
    send({
      stage: 'page-context',
      pageUrl: pageContext.url,
      pageTitle: pageContext.title,
      visibleText: pageContext.sourceMeta.visibleText,
      frameCount: pageContext.sourceMeta.frameCount,
      frameUrls: pageContext.sourceMeta.frameUrls,
      primaryFrameUrl: pageContext.sourceMeta.primaryFrameUrl,
    });

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
      if (skills.result.bestResume?.name) {
        await saveSessionBestResumeName(tabId, skills.result.bestResume.name);
      }
      send({ stage: 'skills', result: skills.result, usage: skills.usage });
    }

    // Resolve the concurrent flag request (best-effort — a failed flag check
    // never fails the analysis). Roll its tokens into the session total and
    // persist the merged verdicts so they stay resolved for later Analyze runs.
    let sessionFlags = storedFlags;
    if (flagsPromise) {
      try {
        const flags = await flagsPromise;
        if (flags.usage) turnUsage = sumUsage(turnUsage, flags.usage);
        sessionFlags = {
          remote: flags.result.remote ?? storedFlags.remote,
          clearance: flags.result.clearance ?? storedFlags.clearance,
        };
        await saveSessionFlags(tabId, sessionFlags);
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
      sessionFlags,
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

const lastNavProcessCaptureAt = new Map<number, number>();

function processLabelFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.includes('/application') || /\/apply(?:\/|$)/.test(path)) return 'Apply';
    if (path.includes('submit')) return 'Submit';
    return null;
  } catch {
    return /apply|application/i.test(url) ? 'Apply' : null;
  }
}

async function recordNavigationProcessShot(
  tabId: number,
  url: string,
  sessionId: string,
  triggerText: string,
): Promise<void> {
  const now = Date.now();
  const last = lastNavProcessCaptureAt.get(tabId) ?? 0;
  if (now - last < 1500) return;
  lastNavProcessCaptureAt.set(tabId, now);

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }

  // Let Ashby/SPA paint the application step before capturing.
  await new Promise((resolve) => setTimeout(resolve, 250));
  const screenshot = await captureProcessClickViewport(tabId, tab.windowId);
  const applierState = await getStoredApplierState();
  const at = new Date().toISOString();

  console.log('[vender-sw] navigation process capture', {
    triggerText,
    hasScreenshot: Boolean(screenshot),
    url,
  });

  await recordShot(tabId, {
    type: 'process',
    triggerText,
    url: url || tab.url || null,
    title: tab.title ?? null,
    screenshot,
    at,
  });

  try {
    await postBidSessionEvent('/bid-session/event', {
      sessionId,
      applierName: applierState.applierName ?? '',
      profileId: applierState.profileId,
      url: url || tab.url || '',
      title: tab.title ?? '',
      triggerText,
      screenshot,
    });
  } catch (error) {
    console.warn(
      '[vender-sw] failed to persist navigation process click:',
      error instanceof Error ? error.message : error,
    );
  }
}

async function maybeCaptureApplyNavigation(tabId: number, url: string): Promise<void> {
  const session = await getStoredBidSession(tabId);
  if (session.status !== 'active' || !session.sessionId) return;
  const label = processLabelFromUrl(url);
  if (!label) return;
  await recordNavigationProcessShot(tabId, url, session.sessionId, label);
}

// Re-inject hold-capture hooks after SPA navigations while the session is live.
// Post-navigation Apply shots are skipped — form verification uses the pre-click
// full-page capture from BID_PROCESS_CLICK instead.
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
        case 'FETCH_BID_QUEUE': {
          const queue = await fetchBidQueue(message.limit, message.preview);
          sendResponse({ ok: true, ...queue } satisfies Response);
          break;
        }
        case 'GET_BID_SHOTS': {
          const shots = await getSessionShots(message.tabId);
          sendResponse({ ok: true, shots } satisfies Response);
          break;
        }
        case 'BID_PROCESS_CLICK': {
          // Reply once the screenshot exists so MAIN can resume Apply/Next.
          // Mongo write continues afterward and must not extend the click hold.
          const result = await recordBidProcessClick(message.triggerText, sender);
          sendResponse({ ok: true } satisfies Response);
          if (result?.persist) await result.persist;
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
