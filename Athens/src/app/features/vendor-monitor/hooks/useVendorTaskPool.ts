import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/api/useApi";
import { useApplier } from "@/context/applier-context";
import { API_BASE } from "@/lib/api-base";
import type { Job } from "@/app/types";
import { formatVendorMonitorError } from "../api-errors";
import type { VendorTask, VendorTaskStatus, VendorTaskTotals } from "../types";

const EMPTY_TOTALS: VendorTaskTotals = {
  total: 0,
  pending: 0,
  active: 0,
  done: 0,
  skipped: 0,
};

export function useVendorTaskPool() {
  const { get, post, del, request } = useApi(API_BASE);
  const { applier, applierReady } = useApplier();
  const profileName = applier?.name ?? null;

  const [tasks, setTasks] = useState<VendorTask[]>([]);
  const [totals, setTotals] = useState<VendorTaskTotals>(EMPTY_TOTALS);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!applierReady) return;
    if (!profileName) {
      setTasks([]);
      setTotals(EMPTY_TOTALS);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ applierName: profileName });
      const data = (await get(`/vendor/tasks?${params}`)) as {
        success: boolean;
        tasks: VendorTask[];
        totals: VendorTaskTotals;
      };
      setTasks(data.tasks ?? []);
      setTotals(data.totals ?? EMPTY_TOTALS);
    } catch (err) {
      setError(formatVendorMonitorError(err, "Failed to load task pool."));
      setTasks([]);
      setTotals(EMPTY_TOTALS);
    } finally {
      setLoading(false);
    }
  }, [applierReady, get, profileName]);

  useEffect(() => {
    void load();
  }, [load]);

  const addJobs = useCallback(
    async (jobs: Job[]) => {
      if (!profileName || !jobs.length) return { addedCount: 0, skippedCount: 0 };
      setMutating(true);
      setError(null);
      try {
        const data = (await post("/vendor/tasks", {
          applierName: profileName,
          jobs: jobs.map((job) => ({
            jobId: job.backendId || job.id,
            title: job.title,
            company: job.company,
            applyUrl: job.applyUrl,
            source: job.source,
            location: job.location,
            workMode: job.workMode,
            matchScore: job.matchScore,
          })),
        })) as { addedCount: number; skippedCount: number };
        await load();
        return {
          addedCount: data.addedCount ?? 0,
          skippedCount: data.skippedCount ?? 0,
        };
      } catch (err) {
        setError(formatVendorMonitorError(err, "Failed to add jobs to pool."));
        throw err;
      } finally {
        setMutating(false);
      }
    },
    [load, post, profileName],
  );

  const updateStatus = useCallback(
    async (taskId: string, status: VendorTaskStatus) => {
      setMutating(true);
      setError(null);
      try {
        await request(`/vendor/tasks/${taskId}`, { method: "PATCH", body: { status } });
        await load();
      } catch (err) {
        setError(formatVendorMonitorError(err, "Failed to update task."));
        throw err;
      } finally {
        setMutating(false);
      }
    },
    [load, request],
  );

  const removeTask = useCallback(
    async (taskId: string) => {
      setMutating(true);
      setError(null);
      try {
        await del(`/vendor/tasks/${taskId}`);
        await load();
      } catch (err) {
        setError(formatVendorMonitorError(err, "Failed to remove task."));
        throw err;
      } finally {
        setMutating(false);
      }
    },
    [del, load],
  );

  const clearPool = useCallback(async () => {
    if (!profileName) return;
    setMutating(true);
    setError(null);
    try {
      const params = new URLSearchParams({ applierName: profileName });
      await del(`/vendor/tasks?${params}`);
      await load();
    } catch (err) {
      setError(formatVendorMonitorError(err, "Failed to clear task pool."));
      throw err;
    } finally {
      setMutating(false);
    }
  }, [del, load, profileName]);

  const poolJobIds = new Set(
    tasks.map((t) => t.jobId).filter((id): id is string => Boolean(id)),
  );

  return {
    ready: applierReady && Boolean(profileName),
    profileName,
    tasks,
    totals,
    poolJobIds,
    loading,
    mutating,
    error,
    refetch: load,
    addJobs,
    updateStatus,
    removeTask,
    clearPool,
  };
}
