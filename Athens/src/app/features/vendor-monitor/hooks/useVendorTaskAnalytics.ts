import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/api/useApi";
import { useApplier } from "@/context/applier-context";
import { API_BASE } from "@/lib/api-base";
import { formatVendorMonitorError } from "../api-errors";
import type { ResolvedAnalyticsPeriod } from "../lib/analyticsPeriod";
import type {
  VendorTaskAnalyticsByDay,
  VendorTaskAnalyticsBySource,
  VendorTaskAnalyticsResponse,
  VendorTaskAnalyticsTotals,
} from "../types";

const EMPTY_TOTALS: VendorTaskAnalyticsTotals = {
  total: 0,
  pending: 0,
  active: 0,
  done: 0,
  skipped: 0,
  completionRate: 0,
  stillPosted: null,
};

export function useVendorTaskAnalytics(resolved: ResolvedAnalyticsPeriod | null) {
  const { get } = useApi(API_BASE);
  const { applier, applierReady } = useApplier();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<VendorTaskAnalyticsTotals>(EMPTY_TOTALS);
  const [byDay, setByDay] = useState<VendorTaskAnalyticsByDay[]>([]);
  const [bySource, setBySource] = useState<VendorTaskAnalyticsBySource[]>([]);

  const load = useCallback(async () => {
    if (!applierReady) return;
    const profileName = applier?.name;
    if (!profileName || !resolved) {
      setTotals(EMPTY_TOTALS);
      setByDay([]);
      setBySource([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        applierName: profileName,
        since: resolved.sinceIso,
        until: resolved.untilIso,
      });
      const data = (await get(`/vendor/tasks/analytics?${params}`)) as VendorTaskAnalyticsResponse;
      setTotals(data.totals ?? EMPTY_TOTALS);
      setByDay(data.byDay ?? []);
      setBySource(data.bySource ?? []);
    } catch (err) {
      setError(formatVendorMonitorError(err, "Failed to load task pool analytics."));
      setTotals(EMPTY_TOTALS);
      setByDay([]);
      setBySource([]);
    } finally {
      setLoading(false);
    }
  }, [applier?.name, applierReady, get, resolved]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    loading,
    error,
    ready: applierReady && Boolean(applier?.name),
    totals,
    byDay,
    bySource,
    refetch: load,
  };
}
