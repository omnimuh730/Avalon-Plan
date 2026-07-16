import { useCallback, useEffect, useState } from "react";
import { useApplier } from "@/context/applier-context";
import { fetchBidResults, patchBidResultStatus } from "../../../api/bidResults";
import type { BidResult, BidResultStatus } from "../types";
import { isEditableStatus } from "../types";

export function useBidResults() {
  const { applier, applierReady } = useApplier();
  const [results, setResults] = useState<BidResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const name = applier?.name?.trim();
    if (!name) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchBidResults(name);
      setResults(rows);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Failed to load bid results");
    } finally {
      setLoading(false);
    }
  }, [applier?.name]);

  useEffect(() => {
    if (!applierReady) return;
    void reload();
  }, [applierReady, reload]);

  useEffect(() => {
    const onFocus = () => void reload();
    const onVis = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reload]);

  const setStatus = useCallback(
    async (id: string, next: BidResultStatus) => {
      if (!isEditableStatus(next)) return;
      const name = applier?.name?.trim();
      if (!name) return;

      const prev = results;
      setResults((list) => list.map((r) => (r.id === id ? { ...r, status: next } : r)));
      try {
        const updated = await patchBidResultStatus(id, name, next);
        if (updated) {
          setResults((list) => list.map((r) => (r.id === id ? updated : r)));
        }
      } catch (err) {
        setResults(prev);
        setError(err instanceof Error ? err.message : "Failed to update status");
      }
    },
    [applier?.name, results],
  );

  return {
    results,
    loading,
    error,
    reload,
    setStatus,
    applierName: applier?.name ?? null,
  };
}
