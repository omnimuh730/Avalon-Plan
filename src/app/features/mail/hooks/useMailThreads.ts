import { useCallback, useState } from "react";
import { MAIL_THREADS, type MailFolderId } from "../../../data/mail";
import type { MailThread } from "../../../types";

export function useMailThreads() {
  const [threads, setThreads] = useState<MailThread[]>(MAIL_THREADS);
  const [composeOpen, setComposeOpen] = useState(false);

  const updateThread = useCallback((id: string, patch: Partial<MailThread>) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const star = useCallback((id: string) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, labels: t.labels.includes("starred") ? t.labels.filter((l) => l !== "starred") : [...t.labels, "starred"] }
          : t,
      ),
    );
  }, []);

  const archive = useCallback((id: string) => {
    updateThread(id, { folder: "archive" as MailFolderId });
  }, [updateThread]);

  const trash = useCallback((id: string) => {
    updateThread(id, { folder: "trash" as MailFolderId });
  }, [updateThread]);

  const markUnread = useCallback((id: string, unread: boolean) => {
    updateThread(id, { unread });
  }, [updateThread]);

  const sendCompose = useCallback((to: string, subject: string, body: string) => {
    const thread: MailThread = {
      id: `sent-${Date.now()}`,
      from: "Jordan Doe",
      subj: subject,
      prev: body.slice(0, 80),
      body,
      time: "Just now",
      folder: "sent",
      labels: [],
      unread: false,
      tag: "",
    };
    setThreads((prev) => [thread, ...prev]);
    setComposeOpen(false);
  }, []);

  return {
    threads,
    composeOpen,
    setComposeOpen,
    star,
    archive,
    trash,
    markUnread,
    sendCompose,
  };
}
