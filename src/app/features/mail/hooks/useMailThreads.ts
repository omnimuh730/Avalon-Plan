import { useCallback, useRef, useState } from "react";
import {
  fetchMailMessage,
  fetchMailThreads,
  patchMailMessage,
  sendMailMessage,
} from "@/api/mail";
import type { MailFolderId } from "../../../data/mail";
import type { MailThread } from "../../../types";

type LoadOpts = {
  folder: MailFolderId;
  labelFilter: string | null;
  search: string;
  page: number;
  pageSize: number;
};

export function useMailThreads(applierName: string | undefined) {
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<MailThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [currentFolder, setCurrentFolder] = useState<MailFolderId>("inbox");
  const lastLoadOpts = useRef<LoadOpts>({
    folder: "inbox",
    labelFilter: null,
    search: "",
    page: 1,
    pageSize: 25,
  });
  const loadGen = useRef(0);

  const loadThreads = useCallback(
    async (opts: Partial<LoadOpts> & { folder: MailFolderId; labelFilter: string | null; search: string }) => {
      if (!applierName) return;
      const merged: LoadOpts = {
        page: opts.page ?? lastLoadOpts.current.page,
        pageSize: opts.pageSize ?? lastLoadOpts.current.pageSize,
        folder: opts.folder,
        labelFilter: opts.labelFilter,
        search: opts.search,
      };
      lastLoadOpts.current = merged;
      setCurrentFolder(merged.folder);
      setPage(merged.page);
      setPageSize(merged.pageSize);

      const gen = ++loadGen.current;
      setError(null);
      setSyncing(true);

      const queryOpts = {
        folder: merged.folder,
        label: merged.labelFilter ?? undefined,
        search: merged.search || undefined,
        page: merged.page,
        pageSize: merged.pageSize,
      };

      let showedCache = false;
      try {
        const cached = await fetchMailThreads(applierName, { ...queryOpts, cacheOnly: true });
        if (gen !== loadGen.current) return;
        if (cached.threads.length > 0) {
          setThreads(cached.threads);
          setTotal(cached.total);
          setLoading(false);
          showedCache = true;
        } else {
          setLoading(true);
        }
      } catch {
        setLoading(true);
      }

      try {
        const fresh = await fetchMailThreads(applierName, queryOpts);
        if (gen !== loadGen.current) return;
        setThreads(fresh.threads);
        setTotal(fresh.total);
      } catch (e) {
        if (gen !== loadGen.current) return;
        if (!showedCache) {
          setError(e instanceof Error ? e.message : "Failed to load mail");
        }
      } finally {
        if (gen === loadGen.current) {
          setLoading(false);
          setSyncing(false);
        }
      }
    },
    [applierName],
  );

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
      const flagged = !(thread?.starred ?? false);
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, starred: flagged } : t)));
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
    error,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    loadThreads,
    fetchThreadBody,
    star,
    archive,
    trash,
    markUnread,
    sendCompose,
  };
}
