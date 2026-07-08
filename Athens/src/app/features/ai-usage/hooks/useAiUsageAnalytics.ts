import { useCallback, useEffect, useState } from "react";
import { useApplier } from "@/context/applier-context";
import {
  fetchAiUsageRows,
  fetchAiUsageSummary,
  type AiUsageByDayRow,
  type AiUsageByFeatureRow,
  type AiUsageByProviderRow,
  type AiUsageCallRow,
  type AiUsageTotals,
} from "../../../api/aiUsage";
import type { DateRange } from "../../../hooks/useAnalyticsFilters";
import { rangeToIsoDates } from "../../analytics/lib/dateRange";

const EMPTY_TOTALS: AiUsageTotals = {
  calls: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  costUsd: 0,
};

export function useAiUsageAnalytics(range: DateRange) {
  const { applier, applierReady } = useApplier();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<AiUsageTotals>(EMPTY_TOTALS);
  const [byDay, setByDay] = useState<AiUsageByDayRow[]>([]);
  const [byFeature, setByFeature] = useState<AiUsageByFeatureRow[]>([]);
  const [byProvider, setByProvider] = useState<AiUsageByProviderRow[]>([]);
  const [recentRows, setRecentRows] = useState<AiUsageCallRow[]>([]);

  const load = useCallback(async () => {
    if (!applierReady) return;
    setLoading(true);
    setError(null);
    const { startDate, endDate } = rangeToIsoDates(range);
    const applierName = applier?.name;

    try {
      const [summary, rowsRes] = await Promise.all([
        fetchAiUsageSummary({ since: startDate, until: endDate, applierName }),
        fetchAiUsageRows({ since: startDate, until: endDate, applierName, limit: 100 }),
      ]);
      setTotals(summary.totals ?? EMPTY_TOTALS);
      setByDay(summary.byDay ?? []);
      setByFeature(summary.byFeature ?? []);
      setByProvider(summary.byProvider ?? []);
      setRecentRows(rowsRes.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load AI usage");
      setTotals(EMPTY_TOTALS);
      setByDay([]);
      setByFeature([]);
      setByProvider([]);
      setRecentRows([]);
    } finally {
      setLoading(false);
    }
  }, [applier?.name, applierReady, range]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    loading,
    error,
    ready: applierReady && Boolean(applier?.name),
    totals,
    byDay,
    byFeature,
    byProvider,
    recentRows,
    refetch: load,
  };
}
