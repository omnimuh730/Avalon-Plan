import { useCallback, useEffect, useMemo, useState } from "react";
import { listGenerationRuns } from "../../../services/resumeStorage";
import type { GenerationRun } from "../../../types/resume";

export type HistoryFilters = {
  search: string;
  searchTarget: "all" | "jd" | "resume";
  status: "all" | "completed" | "failed";
  model: string;
  provider: string;
  templateId: string;
  dateFrom: string;
  dateTo: string;
  sort: "newest" | "oldest";
};

const DEFAULT_FILTERS: HistoryFilters = {
  search: "",
  searchTarget: "all",
  status: "all",
  model: "all",
  provider: "all",
  templateId: "all",
  dateFrom: "",
  dateTo: "",
  sort: "newest",
};

export function useResumeHistory() {
  const [runs, setRuns] = useState<GenerationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await listGenerationRuns();
    setRuns(data);
    setLoading(false);
    if (data.length && !selectedId) setSelectedId(data[0].id);
  }, [selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    let list = [...runs];

    if (filters.status !== "all") {
      list = list.filter((r) => r.status === filters.status);
    }
    if (filters.model !== "all") {
      list = list.filter((r) => r.model === filters.model);
    }
    if (filters.provider !== "all") {
      list = list.filter((r) => r.provider === filters.provider);
    }
    if (filters.templateId !== "all") {
      list = list.filter((r) => r.templateId === filters.templateId);
    }
    if (filters.dateFrom) {
      list = list.filter((r) => r.createdAt >= filters.dateFrom);
    }
    if (filters.dateTo) {
      list = list.filter((r) => r.createdAt <= filters.dateTo + "T23:59:59");
    }
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      list = list.filter((r) => {
        const inJd = r.jobDescription.toLowerCase().includes(q);
        const inResume =
          r.document.summary.toLowerCase().includes(q) ||
          r.document.identity.fullName.toLowerCase().includes(q) ||
          r.jobTitle?.toLowerCase().includes(q);
        if (filters.searchTarget === "jd") return inJd;
        if (filters.searchTarget === "resume") return inResume;
        return inJd || inResume || inResume;
      });
    }

    list.sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return filters.sort === "newest" ? -cmp : cmp;
    });

    return list;
  }, [runs, filters]);

  const stats = useMemo(() => {
    const completed = runs.filter((r) => r.status === "completed");
    return {
      completed: completed.length,
      totalTokens: completed.reduce((s, r) => s + r.tokens, 0),
      totalSpend: completed.reduce((s, r) => s + r.costUsd, 0),
      inView: filtered.length,
    };
  }, [runs, filtered]);

  const selected = filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? null;

  const models = useMemo(() => [...new Set(runs.map((r) => r.model))], [runs]);
  const providers = useMemo(() => [...new Set(runs.map((r) => r.provider))], [runs]);
  const templates = useMemo(() => [...new Set(runs.map((r) => r.templateId))], [runs]);

  return {
    runs,
    filtered,
    loading,
    filters,
    setFilters,
    selected,
    selectedId,
    setSelectedId,
    stats,
    models,
    providers,
    templates,
    refresh,
  };
}
