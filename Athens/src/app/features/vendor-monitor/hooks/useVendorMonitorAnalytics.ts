import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/api/useApi";
import { useApplier } from "@/context/applier-context";
import { API_BASE } from "@/lib/api-base";
import { formatVendorMonitorError } from "../api-errors";
import type { ResolvedAnalyticsPeriod } from "../lib/analyticsPeriod";
import type {
  VendorAnalyticsBucket,
  VendorAnalyticsByJobSource,
  VendorAnalyticsResponse,
  VendorAnalyticsTotals,
} from "../types";

const EMPTY_TOTALS: VendorAnalyticsTotals = {
  sessions: 0,
  completed: 0,
  active: 0,
  totalCost: 0,
  totalTokens: 0,
  processCount: 0,
  analysisCount: 0,
  resumeUploadCount: 0,
  avgDurationMs: 0,
  completionRate: 0,
};

function clientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function useVendorMonitorAnalytics(resolved: ResolvedAnalyticsPeriod | null) {
  const { get } = useApi(API_BASE);
  const { applier, applierReady } = useApplier();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState(clientTimezone);
  const [granularity, setGranularity] = useState<"day" | "hour">("day");
  const [totals, setTotals] = useState<VendorAnalyticsTotals>(EMPTY_TOTALS);
  const [byBucket, setByBucket] = useState<VendorAnalyticsBucket[]>([]);
  const [byJobSource, setByJobSource] = useState<VendorAnalyticsByJobSource[]>([]);

  const load = useCallback(async () => {
    if (!applierReady) return;
    const profileName = applier?.name;
    if (!profileName || !resolved) {
      setTotals(EMPTY_TOTALS);
      setByBucket([]);
      setByJobSource([]);
      setLoading(false);
      if (!resolved) setError("Choose a valid date and time range.");
      return;
    }

    setLoading(true);
    setError(null);
    const tz = clientTimezone();
    setTimezone(tz);

    try {
      const params = new URLSearchParams({
        applierName: profileName,
        since: resolved.sinceIso,
        until: resolved.untilIso,
        timezone: tz,
        granularity: resolved.preferHourly ? "hour" : "day",
      });
      const data = (await get(`/vendor/bid-sessions/analytics?${params}`)) as VendorAnalyticsResponse;
      setTotals(data.totals ?? EMPTY_TOTALS);
      setByBucket(data.byBucket ?? []);
      setByJobSource(data.byJobSource ?? []);
      setGranularity(data.granularity === "hour" ? "hour" : "day");
      if (data.timezone) setTimezone(data.timezone);
    } catch (err) {
      setError(formatVendorMonitorError(err, "Failed to load vendor analytics."));
      setTotals(EMPTY_TOTALS);
      setByBucket([]);
      setByJobSource([]);
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
    timezone,
    granularity,
    totals,
    byBucket,
    byJobSource,
    refetch: load,
  };
}
