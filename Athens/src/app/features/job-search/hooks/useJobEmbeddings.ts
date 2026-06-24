import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  fetchJobEmbeddingStatus,
  startJobEmbeddings,
  stopJobEmbeddings,
  type JobEmbeddingSession,
} from "@/app/api/jobEmbeddings";

const POLL_MS = 1500;

export function useJobEmbeddings() {
  const [session, setSession] = useState<JobEmbeddingSession>({ running: false, status: "idle" });
  const [missing, setMissing] = useState(0);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await fetchJobEmbeddingStatus();
      setSession(status);
      setMissing(status.missing ?? 0);
      return status;
    } catch {
      return null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(() => {
      void refresh();
    }, POLL_MS);
  }, [refresh, stopPolling]);

  useEffect(() => {
    void refresh();
    return () => stopPolling();
  }, [refresh, stopPolling]);

  useEffect(() => {
    if (session.running) {
      startPolling();
    } else {
      stopPolling();
    }
  }, [session.running, startPolling, stopPolling]);

  const start = useCallback(async () => {
    setLoading(true);
    try {
      const result = await startJobEmbeddings();
      if (result.started) {
        toast.success("Embedding started", {
          description: `${result.missing ?? missing} job(s) queued for indexing.`,
        });
        await refresh();
      } else {
        toast.info(result.message || "All jobs are already embedded.");
        await refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start embedding";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [missing, refresh]);

  const stop = useCallback(async () => {
    setLoading(true);
    try {
      await stopJobEmbeddings();
      toast.info("Stopping embedding session…");
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stop embedding";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  return {
    session,
    missing,
    loading,
    isRunning: session.running,
    start,
    stop,
    refresh,
  };
}
