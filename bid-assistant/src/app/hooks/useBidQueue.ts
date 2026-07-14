import { useCallback, useEffect, useState } from 'react';

export type BidQueueJob = {
  jobId: string;
  title: string;
  company: string;
  applyUrl: string;
  source: string;
  bidReadyDate: string | null;
};

type BidQueueState = {
  total: number;
  preview: BidQueueJob[];
  loading: boolean;
  error: string | null;
};

const EMPTY: BidQueueState = {
  total: 0,
  preview: [],
  loading: false,
  error: null,
};

export function useBidQueue(enabled = true) {
  const [state, setState] = useState<BidQueueState>(EMPTY);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'FETCH_BID_QUEUE',
        limit: 8,
        preview: 3,
      })) as
        | { ok: true; total: number; preview: BidQueueJob[] }
        | { ok: false; error: string };

      if (!response || !('ok' in response) || !response.ok) {
        throw new Error(
          response && 'error' in response ? response.error : 'Failed to load bid queue',
        );
      }
      setState({
        total: response.total ?? 0,
        preview: Array.isArray(response.preview) ? response.preview : [],
        loading: false,
        error: null,
      });
    } catch (err) {
      setState({
        total: 0,
        preview: [],
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load bid queue',
      });
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onStorage = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== 'local') return;
      if (changes.applierName || changes.profileReady) void reload();
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, [reload]);

  const openJob = useCallback(async (job: BidQueueJob) => {
    if (!job.applyUrl) throw new Error('Job has no apply URL');
    await chrome.tabs.create({ url: job.applyUrl, active: true });
  }, []);

  return {
    ...state,
    reload,
    openJob,
  };
}
