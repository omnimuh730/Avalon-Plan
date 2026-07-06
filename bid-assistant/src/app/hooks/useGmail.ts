import { useCallback, useEffect, useState } from 'react';
import {
  checkBridge,
  fetchInboxPage,
  getCredentials,
  type Email,
} from '@/lib/gmail';
import { getApplierState } from '@/lib/applier-profile';

function mergeEmails(existing: Email[], incoming: Email[]): Email[] {
  const seen = new Set(existing.map((e) => e.id));
  const merged = [...existing];
  for (const email of incoming) {
    if (seen.has(email.id)) continue;
    seen.add(email.id);
    merged.push(email);
  }
  return merged;
}

export function useGmail() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextBeforeSeq, setNextBeforeSeq] = useState<number | null>(null);
  const [lastScanned, setLastScanned] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [bridgeRunning, setBridgeRunning] = useState(false);

  const loadStatus = useCallback(async () => {
    const [credentials, running, applierState] = await Promise.all([
      getCredentials(),
      checkBridge(),
      getApplierState(),
    ]);
    setHasCredentials(
      Boolean(applierState.ready) || Boolean(credentials?.email && credentials?.appPassword),
    );
    setBridgeRunning(running);
    return { credentials, running, applierState };
  }, []);

  const loadEmails = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const { credentials, running, applierState } = await loadStatus();

      if (!applierState.ready && (!credentials?.email || !credentials?.appPassword)) {
        setEmails([]);
        setHasMore(false);
        setNextBeforeSeq(null);
        return;
      }

      if (!running) {
        setEmails([]);
        setHasMore(false);
        setError('IMAP bridge is not running. Run `npm run bridge` in a terminal.');
        return;
      }

      const page = await fetchInboxPage(null);
      setEmails(page.emails);
      setHasMore(page.hasMore);
      setNextBeforeSeq(page.nextBeforeSeq);
      setLastScanned(page.scanned);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadStatus]);

  const loadMore = useCallback(async () => {
    if (!hasMore || nextBeforeSeq === null || loadingMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      const page = await fetchInboxPage(nextBeforeSeq);
      setEmails((prev) => mergeEmails(prev, page.emails));
      setHasMore(page.hasMore);
      setNextBeforeSeq(page.nextBeforeSeq);
      setLastScanned(page.scanned);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more emails');
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextBeforeSeq]);

  useEffect(() => {
    void loadEmails();
  }, [loadEmails]);

  return {
    emails,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    lastScanned,
    error,
    hasCredentials,
    bridgeRunning,
    refresh: () => loadEmails(true),
    loadMore,
    reloadStatus: loadStatus,
  };
}
