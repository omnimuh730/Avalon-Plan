import type { ResumeUploadSource } from '@/lib/resume-filename';

export const RESUME_UPLOADS_STORAGE_KEY = 'resumeUploads';
export const MAX_RESUME_UPLOAD_EVENTS = 50;

export type ResumeUploadEvent = {
  id: string;
  originalName: string;
  cleanedName: string | null;
  renamed: boolean;
  source: ResumeUploadSource;
  pageUrl: string;
  ts: number;
  /** Profile file base used at rename time (e.g. TracyNguyen), if any. */
  profileFileBase: string | null;
  fileSize?: number;
  lastModified?: number;
};

export type LogUploadMessage = {
  type: 'LOG_UPLOAD';
  originalName: string;
  cleanedName: string | null;
  renamed: boolean;
  source: ResumeUploadSource;
  pageUrl: string;
  ts: number;
  profileFileBase: string | null;
  fileSize?: number;
  lastModified?: number;
};

function sendMessage<T>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

export async function getResumeUploads(): Promise<ResumeUploadEvent[]> {
  const response = await sendMessage<
    { ok: true; uploads: ResumeUploadEvent[] } | { ok: false; error: string }
  >({ type: 'GET_RESUME_UPLOADS' });
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Failed to load resume uploads');
  }
  return response.uploads;
}

export async function clearResumeUploads(): Promise<void> {
  const response = await sendMessage<{ ok: true } | { ok: false; error: string }>({
    type: 'CLEAR_RESUME_UPLOADS',
  });
  if (!response.ok) {
    throw new Error('error' in response ? response.error : 'Failed to clear resume uploads');
  }
}
