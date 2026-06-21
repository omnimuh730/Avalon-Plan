import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchEnrichmentStatus,
  fetchPendingSkills,
  startEnrichment,
  stopEnrichment,
  type EnrichmentSession,
  type PendingSkill,
  type QueueStats,
  type SkillAnalysisUsage,
} from "@/app/api/skillGraph";

export function useSkillEnrichment(onProgress?: () => void) {
  const [session, setSession] = useState<EnrichmentSession>({ running: false, status: "idle" });
  const [stats, setStats] = useState<QueueStats>({ pending: 0, processing: 0, done: 0, failed: 0 });
  const [pending, setPending] = useState<PendingSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevProcessed = useRef(0);

  const refreshPending = useCallback(async () => {
    const data = await fetchPendingSkills();
    setPending(data.pending);
    setStats(data.stats);
    return data;
  }, []);

  const refreshStatus = useCallback(async () => {
    const data = await fetchEnrichmentStatus();
    setSession(data.session);
    setStats(data.stats);
    if (data.session.processed != null && data.session.processed > prevProcessed.current) {
      prevProcessed.current = data.session.processed;
      onProgress?.();
    }
    if (!data.session.running && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      await refreshPending();
    }
    return data;
  }, [onProgress, refreshPending]);

  useEffect(() => {
    void refreshPending().catch(() => undefined);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshPending]);

  const startPoll = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      void refreshStatus().catch(() => undefined);
    }, 2000);
  }, [refreshStatus]);

  const analyze = useCallback(
    async (options: { applierName?: string; mode?: "fast" | "smart" } = {}) => {
      setLoading(true);
      setError(null);
      try {
        prevProcessed.current = 0;
        await startEnrichment(options);
        startPoll();
        await refreshStatus();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Analyze failed");
      } finally {
        setLoading(false);
      }
    },
    [refreshStatus, startPoll],
  );

  const stop = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await stopEnrichment();
      await refreshStatus();
      await refreshPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stop failed");
    } finally {
      setLoading(false);
    }
  }, [refreshPending, refreshStatus]);

  const usage = (session.usage ?? null) as SkillAnalysisUsage | null;

  return {
    session,
    stats,
    pending,
    loading,
    error,
    usage,
    analyze,
    stop,
    refreshPending,
    refreshStatus,
    isRunning: session.running || loading,
  };
}
