import { useCallback, useEffect, useRef } from "react";
import { syncMailIncremental, fetchMailThreads } from "@/api/mail";

const POLL_INTERVAL_MS = 60_000;

type UseMailSyncOptions = {
  applierName: string | undefined;
  applierReady: boolean;
  enabled: boolean;
  /** Called with new threads from the sync, so the caller can prepend them
   *  instead of doing a full page reload. */
  onNewThreads?: (threads: import("../../../types").MailThread[]) => void;
};

export function useMailSync({ applierName, applierReady, enabled, onNewThreads }: UseMailSyncOptions) {
  const syncingRef = useRef(false);
  const onNewThreadsRef = useRef(onNewThreads);
  onNewThreadsRef.current = onNewThreads;

  const runSync = useCallback(async () => {
    if (!applierName || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const result = await syncMailIncremental(applierName);
      // If new messages arrived, fetch them from cache and prepend
      if (result.newCount > 0 && onNewThreadsRef.current) {
        const page = await fetchMailThreads(applierName, {
          folder: "inbox",
          page: 1,
          pageSize: Math.min(result.newCount, 25),
          cacheOnly: true,
        });
        const newThreads = page.threads.filter(
          (t) => t.folder === "inbox" || !t.folder,
        );
        if (newThreads.length > 0) {
          onNewThreadsRef.current(newThreads);
        }
      }
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
