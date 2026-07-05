import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const GMAIL_LABEL = 'Notify/Unnecessary';
const DEFAULT_BATCH_SIZE = 100;
const ALL_MAIL_PATH = '[Gmail]/All Mail';

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

export async function verifyImapCredentials(email, password) {
  const normalizedEmail = String(email ?? '').trim();
  const normalizedPassword = String(password ?? '').replace(/\s/g, '');
  if (!normalizedEmail || !normalizedPassword) {
    return { ok: false, error: 'Email and Gmail app password are required in profile.' };
  }

  let client;
  try {
    client = await createClient(normalizedEmail, normalizedPassword);
    await client.logout();
    return { ok: true, email: normalizedEmail };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IMAP connection failed';
    return { ok: false, error: message, email: normalizedEmail };
  }
}

async function openAllMail(client) {
  return client.getMailboxLock(ALL_MAIL_PATH);
}

export async function scanLabeledBatch(email, password, { beforeSeq, batchSize, label }) {
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

export async function fetchMessageBody(email, password, uid) {
  const client = await createClient(email, password);
  const lock = await openAllMail(client);

  try {
    const message = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true });

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

export function resolveImapCredentials(body, profileBundle) {
  const requestEmail = String(body.email ?? '').trim();
  const requestPassword = String(body.password ?? '').replace(/\s/g, '');

  if (requestEmail && requestPassword) {
    return { email: requestEmail, password: requestPassword };
  }

  if (profileBundle?.imapCredentials?.email && profileBundle.imapCredentials.password) {
    return profileBundle.imapCredentials;
  }

  return { email: requestEmail, password: requestPassword };
}

export function resolveImapLabel(body) {
  return String(body.label ?? GMAIL_LABEL).trim() || GMAIL_LABEL;
}

export function resolveBatchSize(body) {
  return Math.min(Math.max(Number(body.batchSize) || DEFAULT_BATCH_SIZE, 1), 100);
}

export function resolveBeforeSeq(body) {
  const beforeSeq =
    body.beforeSeq === undefined || body.beforeSeq === null ? undefined : Number(body.beforeSeq);
  return Number.isFinite(beforeSeq) ? beforeSeq : undefined;
}
