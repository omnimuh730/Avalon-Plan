import { useCallback, useRef, useState } from "react";
import {
  fetchMailMessage,
  fetchMailThreads,
  patchMailMessage,
  sendMailMessage,
  syncMailOlder,
} from "@/api/mail";
import type { MailFolderId } from "../../../data/mail";
import type { MailThread } from "../../../types";

type LoadOpts = {
  folder: MailFolderId;
  labelFilter: string | null;
  search: string;
};

export function useMailThreads(applierName: string | undefined) {
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<MailThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<MailFolderId>("inbox");
  const lastLoadOpts = useRef<LoadOpts>({ folder: "inbox", labelFilter: null, search: "" });

  const loadThreads = useCallback(
    async (opts: LoadOpts) => {
      if (!applierName) return;
      lastLoadOpts.current = opts;
      setCurrentFolder(opts.folder);
      setLoading(true);
      setError(null);
      try {
        const data = await fetchMailThreads(applierName, {
          folder: opts.folder,
          label: opts.labelFilter ?? undefined,
          search: opts.search || undefined,
          limit: 100,
        });
        setThreads(data);
        setHasMore(data.length >= 100);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load mail");
      } finally {
        setLoading(false);
      }
    },
    [applierName],
  );

  const loadOlder = useCallback(async () => {
    if (!applierName || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const result = await syncMailOlder(applierName);
      if (result.newCount > 0) {
        await loadThreads(lastLoadOpts.current);
      }
      setHasMore(result.hasMore);
    } catch (e) {
      console.error("load older mail failed", e);
    } finally {
      setLoadingOlder(false);
    }
  }, [applierName, loadingOlder, hasMore, loadThreads]);

  const fetchThreadBody = useCallback(
    async (uid: string) => {
      if (!applierName) return null;
      try {
        const thread = await fetchMailMessage(applierName, uid);
        setThreads((prev) => prev.map((t) => (t.id === uid ? thread : t)));
        return thread;
      } catch (e) {
        console.error("fetch message body failed", e);
        return null;
      }
    },
    [applierName],
  );

  const patchThread = useCallback(
    async (uid: string, patch: { seen?: boolean; flagged?: boolean; folder?: string }) => {
      if (!applierName) return;
      try {
        const updated = await patchMailMessage(applierName, uid, patch);
        setThreads((prev) => {
          if (patch.folder && patch.folder !== currentFolder) {
            return prev.filter((t) => t.id !== uid);
          }
          return prev.map((t) => (t.id === uid ? updated : t));
        });
      } catch (e) {
        console.error("patch message failed", e);
      }
    },
    [applierName, currentFolder],
  );

  const star = useCallback(
    (id: string) => {
      const thread = threads.find((t) => t.id === id);
      const flagged = !thread?.labels.includes("starred");
      setThreads((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                labels: flagged
                  ? [...t.labels.filter((l) => l !== "starred"), "starred"]
                  : t.labels.filter((l) => l !== "starred"),
              }
            : t,
        ),
      );
      void patchThread(id, { flagged });
    },
    [threads, patchThread],
  );

  const archive = useCallback(
    (id: string) => {
      setThreads((prev) => prev.filter((t) => t.id !== id));
      void patchThread(id, { folder: "archive" });
    },
    [patchThread],
  );

  const trash = useCallback(
    (id: string) => {
      setThreads((prev) => prev.filter((t) => t.id !== id));
      void patchThread(id, { folder: "trash" });
    },
    [patchThread],
  );

  const markUnread = useCallback(
    (id: string, unread: boolean) => {
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread } : t)));
      void patchThread(id, { seen: !unread });
    },
    [patchThread],
  );

  const openCompose = useCallback((thread?: MailThread | null) => {
    setReplyTo(thread ?? null);
    setComposeOpen(true);
  }, []);

  const sendCompose = useCallback(
    async (to: string, subject: string, body: string) => {
      if (!applierName) return;
      setSyncing(true);
      try {
        await sendMailMessage(applierName, {
          to,
          subject,
          body,
          replyToUid: replyTo?.id,
        });
        setComposeOpen(false);
        setReplyTo(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to send mail");
        throw e;
      } finally {
        setSyncing(false);
      }
    },
    [applierName, replyTo],
  );

  return {
    threads,
    composeOpen,
    setComposeOpen,
    replyTo,
    openCompose,
    loading,
    syncing,
    loadingOlder,
    hasMore,
    error,
    loadThreads,
    loadOlder,
    fetchThreadBody,
    star,
    archive,
    trash,
    markUnread,
    sendCompose,
  };
}
