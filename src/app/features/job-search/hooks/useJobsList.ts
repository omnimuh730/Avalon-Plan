import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/api/useApi";
import { useApplier } from "@/context/applier-context";
import { API_BASE } from "@/lib/api-base";
import { JobSourceTitles } from "../../../../../../FoxHire/configs/pub.js";
import { mapDocToJob, SORT_TO_API } from "../../../lib/job-adapters";
import type {
  JobSearchFilterState,
  JobScoreFilters,
  JobStatusTab,
} from "../../../hooks/useJobSearchFilters";
import type { Job } from "../../../types";

type ListResponse = {
  success?: boolean;
  data?: Record<string, unknown>[];
  recommendationFallback?: boolean;
  pagination?: { total: number; page: number; limit: number; totalPages: number };
};

const EMPTY_STATUS_COUNTS: Record<JobStatusTab, number> = {
  all: 0,
  new: 0,
  applied: 0,
  scheduled: 0,
  declined: 0,
};

function statusTabToApi(statusTab: JobStatusTab): { applied?: boolean; status?: string } {
  if (statusTab === "new") return { applied: false };
  if (statusTab === "applied") return { applied: true, status: "Applied" };
  if (statusTab === "scheduled") return { applied: true, status: "Scheduled" };
  if (statusTab === "declined") return { applied: true, status: "Declined" };
  return {};
}

function appendScoreFilters(body: Record<string, unknown>, scores: JobScoreFilters) {
  const keys: { key: keyof JobScoreFilters; api: string }[] = [
    { key: "overall", api: "Overall" },
    { key: "skill", api: "Skill" },
    { key: "salary", api: "Salary" },
    { key: "bidEst", api: "BidEst" },
    { key: "freshness", api: "Freshness" },
  ];
  for (const { key, api } of keys) {
    const r = scores[key];
    if (r.min !== 0) body[`score${api}Min`] = String(r.min);
    if (r.max !== 100) body[`score${api}Max`] = String(r.max);
  }
}

function workModeToRemote(workMode: string): string | undefined {
  if (workMode === "remote") return "Remote";
  if (workMode === "hybrid") return "Hybrid";
  if (workMode === "onsite") return "On-site";
  return undefined;
}

export function buildJobsListBody(
  filters: JobSearchFilterState,
  opts: { page: number; limit: number; applierName?: string; statusTab?: JobStatusTab },
): Record<string, unknown> {
  const statusTab = opts.statusTab ?? filters.statusTab;
  const body: Record<string, unknown> = {
    q: filters.jobQuery.trim(),
    sort: SORT_TO_API[filters.sort] || "postedAt_desc",
    page: opts.page,
    limit: opts.limit,
    jobSources: filters.source === "all" ? JobSourceTitles.join(",") : filters.source,
  };

  if (opts.applierName) body.applierName = opts.applierName;

  if (filters.companyQuery.trim()) body["company.name"] = filters.companyQuery.trim();
  if (filters.location !== "all") body["details.position"] = filters.location;
  const remote = workModeToRemote(filters.workMode);
  if (remote) body["details.remote"] = remote;
  if (filters.seniority !== "all") body["details.seniority"] = filters.seniority;
  if (filters.industry !== "all") body["company.tags"] = filters.industry;
  if (filters.postedFrom) body.postedAtFrom = filters.postedFrom;
  if (filters.postedTo) body.postedAtTo = filters.postedTo;

  Object.assign(body, statusTabToApi(statusTab));
  appendScoreFilters(body, filters.scores);
  return body;
}

export function useJobsList(filters: JobSearchFilterState, excludeIds: Set<string> = new Set()) {
  const { post } = useApi(API_BASE);
  const { applier, applierReady } = useApplier();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rawJobs, setRawJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusCounts, setStatusCounts] = useState(EMPTY_STATUS_COUNTS);
  const [recommendationFallback, setRecommendationFallback] = useState(false);

  const jobs = useMemo(
    () => rawJobs.filter((job) => !excludeIds.has(job.id)),
    [rawJobs, excludeIds],
  );

  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilters(filters), 400);
    return () => clearTimeout(t);
  }, [filters]);

  useEffect(() => {
    setPage(1);
  }, [debouncedFilters, pageSize]);

  const listBody = useMemo(
    () =>
      buildJobsListBody(debouncedFilters, {
        page,
        limit: pageSize,
        applierName: applier?.name,
      }),
    [debouncedFilters, page, pageSize, applier?.name],
  );

  useEffect(() => {
    if (!applierReady) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = (await post("/jobs/list", listBody)) as ListResponse;
        if (cancelled) return;
        if (res?.success && Array.isArray(res.data)) {
          setRawJobs(res.data.map((doc) => mapDocToJob(doc, applier)));
          setTotal(res.pagination?.total ?? res.data.length);
          setRecommendationFallback(Boolean(res.recommendationFallback));
        } else {
          setRawJobs([]);
          setTotal(0);
          setRecommendationFallback(false);
        }
      } catch (e) {
        console.error(e);
        toast.error("Failed to load jobs", {
          description: "Check that Athens-server is running and VITE_API_URL is set.",
        });
        setRawJobs([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listBody, post, applier, applierReady]);

  useEffect(() => {
    if (!applierReady) return;
    let cancelled = false;
    (async () => {
      const tabs: JobStatusTab[] = ["all", "new", "applied", "scheduled", "declined"];
      try {
        const entries = await Promise.all(
          tabs.map(async (tab) => {
            const body = buildJobsListBody(debouncedFilters, {
              page: 1,
              limit: 1,
              applierName: applier?.name,
              statusTab: tab,
            });
            const res = (await post("/jobs/list", body)) as ListResponse;
            return [tab, res.pagination?.total ?? 0] as const;
          }),
        );
        if (!cancelled) setStatusCounts(Object.fromEntries(entries) as Record<JobStatusTab, number>);
      } catch {
        /* counts are optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedFilters, applier?.name, applierReady, post]);

  const setPageSizeAndReset = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  return {
    jobs,
    total,
    loading,
    page,
    pageSize,
    setPage,
    setPageSize: setPageSizeAndReset,
    statusCounts,
    applierReady,
    recommendationFallback,
  };
}
