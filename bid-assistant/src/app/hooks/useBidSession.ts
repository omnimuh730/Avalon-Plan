import { useCallback, useEffect, useState } from 'react';
import {
  completeBidSession,
  getBidSession,
  startBidSession,
  IDLE_BID_SESSION,
  type BidSessionState,
} from '@/lib/bid-session';

export function useBidSession(tabId: number | null) {
  const [session, setSession] = useState<BidSessionState>(IDLE_BID_SESSION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reload the bound tab's session whenever the panel switches tabs, so the
  // status (idle / active / completed) reflects the tab now in view.
  useEffect(() => {
    if (tabId == null) {
      setSession(IDLE_BID_SESSION);
      return;
    }
    let cancelled = false;
    setError(null);
    getBidSession(tabId)
      .then((state) => {
        if (!cancelled) setSession(state);
      })
      .catch(() => {
        // Service worker not ready yet; stay idle.
      });
    return () => {
      cancelled = true;
    };
  }, [tabId]);

  const start = useCallback(async () => {
    if (tabId == null) return;
    setBusy(true);
    setError(null);
    try {
      setSession(await startBidSession(tabId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setBusy(false);
    }
  }, [tabId]);

  const complete = useCallback(async (): Promise<boolean> => {
    if (tabId == null) return false;
    setBusy(true);
    setError(null);
    try {
      setSession(await completeBidSession(tabId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete session');
      return false;
    } finally {
      setBusy(false);
    }
  }, [tabId]);

  return { session, busy, error, start, complete };
}
