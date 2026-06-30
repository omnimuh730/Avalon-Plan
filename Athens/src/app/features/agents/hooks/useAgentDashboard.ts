import { useCallback, useEffect, useRef, useState } from "react";
import { useApplier } from "@/context/applier-context";
import {
  fetchAgentActivity,
  fetchAgentDashboard,
  fetchAgentHealth,
  fetchAgentRuns,
  fetchAvalonHealth,
} from "../../../services/agentApi";
import type {
  ActivityEntry,
  AvalonHealthData,
  DashboardData,
  HealthData,
  JobRow,
  RunSummary,
} from "../../../types/agent";

export function useAgentDashboard() {
  const { applier, applierReady } = useApplier();
  const profileId = applier?._id != null ? String(applier._id) : null;

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [avalonHealth, setAvalonHealth] = useState<AvalonHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const liveLogRef = useRef<ActivityEntry[]>([]);

  const refresh = useCallback(async () => {
    if (!applierReady) return;
    setError(null);
    try {
      const [healthRes, avalonRes, dashRes, runsRes, actRes] = await Promise.all([
        fetchAgentHealth(),
        fetchAvalonHealth(),
        fetchAgentDashboard(profileId),
        fetchAgentRuns(profileId),
        fetchAgentActivity(profileId),
      ]);
      setHealth(healthRes);
      setAvalonHealth(avalonRes);
      setDashboard(dashRes);
      setRuns(runsRes);
      const serverActivity = actRes;
      const merged = [...liveLogRef.current, ...serverActivity]
        .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
        .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i)
        .slice(0, 50);
      setActivity(merged);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoading(false);
    }
  }, [profileId, applierReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const hasRunning = runs.some((r) => r.status === "running");
    if (!hasRunning) return;
    const id = window.setInterval(() => void refresh(), 10000);
    return () => window.clearInterval(id);
  }, [runs, refresh]);

  const prependActivity = useCallback((entry: Omit<ActivityEntry, "id" | "ts"> & { id?: string; ts?: string }) => {
    const full: ActivityEntry = {
      id: entry.id || `live_${Date.now()}`,
      ts: entry.ts || new Date().toISOString(),
      time: entry.time || new Date().toLocaleTimeString("en-US", { hour12: false }),
      agentName: entry.agentName,
      profile: entry.profile,
      event: entry.event,
      type: entry.type,
      status: entry.status,
    };
    liveLogRef.current = [full, ...liveLogRef.current].slice(0, 20);
    setActivity((prev) => [full, ...prev.filter((e) => e.id !== full.id)].slice(0, 50));
  }, []);

  const dashboardJobs: JobRow[] = dashboard?.jobs || [];

  const successRate = (() => {
    const p = dashboard?.runPipeline;
    if (!p) return 0;
    const total = p.succeeded + p.failed + p.review;
    return total > 0 ? Math.round((p.succeeded / total) * 100) : 0;
  })();

  return {
    profileId,
    dashboard,
    runs,
    activity,
    dashboardJobs,
    health,
    avalonHealth,
    loading,
    error,
    refresh,
    prependActivity,
    successRate,
    applierReady,
  };
}
