export type BidSessionStatus = 'idle' | 'active' | 'completed';

export interface BidSessionState {
  sessionId: string | null;
  status: BidSessionStatus;
  startedAt: string | null;
  completedAt: string | null;
}

export type BidShotType = 'session-start' | 'process' | 'session-complete';

export interface BidShot {
  type: BidShotType;
  triggerText: string | null;
  url: string | null;
  title: string | null;
  screenshot: string | null;
  at: string;
}

export interface BidSessionContext {
  jdText: string | null;
  jdSummary: string | null;
  skillProfile: string | null;
}

export const IDLE_BID_SESSION: BidSessionState = {
  sessionId: null,
  status: 'idle',
  startedAt: null,
  completedAt: null,
};

export const BID_SHOT_ADDED = 'BID_SHOT_ADDED';
export const BID_SESSION_RESET = 'BID_SESSION_RESET';

type SessionResponse = { ok: true; session: BidSessionState } | { ok: false; error: string };

async function sendSessionMessage(message: unknown): Promise<BidSessionState> {
  const response = (await chrome.runtime.sendMessage(message)) as SessionResponse;
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Bid session request failed');
  }
  return response.session;
}

export function getBidSession(tabId: number): Promise<BidSessionState> {
  return sendSessionMessage({ type: 'GET_BID_SESSION', tabId });
}

export function startBidSession(tabId: number): Promise<BidSessionState> {
  return sendSessionMessage({ type: 'START_BID_SESSION', tabId });
}

export function completeBidSession(tabId: number): Promise<BidSessionState> {
  return sendSessionMessage({ type: 'COMPLETE_BID_SESSION', tabId });
}

export async function getBidShots(tabId: number): Promise<BidShot[]> {
  const response = (await chrome.runtime.sendMessage({ type: 'GET_BID_SHOTS', tabId })) as
    | { ok: true; shots: BidShot[] }
    | { ok: false; error: string };
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Failed to load screenshots');
  }
  return response.shots;
}
