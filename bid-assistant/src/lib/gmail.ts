import { INBOX_BATCH_SIZE } from '@/lib/constants';

export interface Email {
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

export interface InboxPage {
  emails: Email[];
  hasMore: boolean;
  nextBeforeSeq: number | null;
  scanned: number;
}

export interface GmailCredentials {
  email: string;
  appPassword: string;
}

type GmailResponse =
  | { ok: true; credentials: { email: string; appPassword: string } | null }
  | { ok: true; page: InboxPage }
  | { ok: true; message: Email }
  | { ok: true; bridgeRunning: boolean; bridgeStatus: { running: boolean; mongoConnected: boolean; mongoError: string | null } }
  | { ok: true }
  | { ok: false; error: string };

function sendMessage<T extends GmailResponse>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

export async function getCredentials() {
  const response = await sendMessage<{ ok: true; credentials: { email: string; appPassword: string } | null }>({
    type: 'GET_CREDENTIALS',
  });
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Failed to load credentials');
  }
  return response.credentials;
}

export async function saveCredentials(credentials: GmailCredentials) {
  const response = await sendMessage<{ ok: true } | { ok: false; error: string }>({
    type: 'SAVE_CREDENTIALS',
    credentials,
  });
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Failed to save credentials');
  }
}

export async function clearCredentials() {
  const response = await sendMessage<{ ok: true } | { ok: false; error: string }>({
    type: 'CLEAR_CREDENTIALS',
  });
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Failed to clear credentials');
  }
}

export type BridgeStatus = {
  running: boolean;
  mongoConnected: boolean;
  mongoError: string | null;
};

export async function getBridgeStatus(): Promise<BridgeStatus> {
  const response = await sendMessage<
    | { ok: true; bridgeStatus: BridgeStatus }
    | { ok: false; error: string }
  >({
    type: 'CHECK_BRIDGE',
  });
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Failed to check bridge');
  }
  return response.bridgeStatus;
}

export async function checkBridge() {
  const status = await getBridgeStatus();
  return status.running && status.mongoConnected;
}

export async function fetchInboxPage(beforeSeq?: number | null) {
  const response = await sendMessage<{ ok: true; page: InboxPage } | { ok: false; error: string }>({
    type: 'FETCH_INBOX_PAGE',
    beforeSeq: beforeSeq ?? null,
    batchSize: INBOX_BATCH_SIZE,
  });
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Failed to fetch emails');
  }
  return response.page;
}

export async function fetchEmailBody(uid: string) {
  const response = await sendMessage<{ ok: true; message: Email } | { ok: false; error: string }>({
    type: 'FETCH_EMAIL_BODY',
    uid,
  });
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Failed to load email');
  }
  return response.message;
}
