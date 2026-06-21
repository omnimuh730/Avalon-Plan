import { useCallback, useEffect, useRef } from "react";
import { syncMailIncremental } from "@/api/mail";

const POLL_INTERVAL_MS = 60_000;

type UseMailSyncOptions = {
  applierName: string | undefined;
  applierReady: boolean;
  enabled: boolean;
  onSyncComplete: () => void;
};

export function useMailSync({ applierName, applierReady, enabled, onSyncComplete }: UseMailSyncOptions) {
  const syncingRef = useRef(false);
  const onSyncCompleteRef = useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;

  const runSync = useCallback(async () => {
    if (!applierName || syncingRef.current) return;
    syncingRef.current = true;
    try {
      await syncMailIncremental(applierName);
      onSyncCompleteRef.current();
    } catch (e) {
      console.error("mail sync failed", e);
    } finally {
      syncingRef.current = false;
    }
  }, [applierName]);

  useEffect(() => {
    if (!applierReady || !applierName || !enabled) return;

    const poll = () => {
      if (document.visibilityState === "visible") {
        void runSync();
      }
    };

    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", poll);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [applierReady, applierName, enabled, runSync]);

  return { runSync };
}
