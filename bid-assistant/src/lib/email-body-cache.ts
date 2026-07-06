import type { Email } from '@/lib/gmail';
import { fetchEmailBody } from '@/lib/gmail';

const cache = new Map<string, Email>();
const inflight = new Map<string, Promise<Email>>();

export function getCachedEmailBody(id: string): Email | undefined {
  return cache.get(id);
}

export function primeEmailBodyCache(email: Email): void {
  if (email.body.trim() || email.bodyHtml) {
    cache.set(email.id, email);
  }
}

export function prefetchEmailBody(id: string): Promise<Email> {
  const cached = cache.get(id);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(id);
  if (pending) return pending;

  const request = fetchEmailBody(id)
    .then((email) => {
      cache.set(id, email);
      inflight.delete(id);
      return email;
    })
    .catch((error) => {
      inflight.delete(id);
      throw error;
    });

  inflight.set(id, request);
  return request;
}

export function loadEmailBody(id: string): Promise<Email> {
  return prefetchEmailBody(id);
}
