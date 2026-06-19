import { useMemo } from "react";
import type { Job, JobStatus } from "../types";
import { JOBS } from "../data/jobs";

export type JobSortKey =
  | "newest"
  | "matchScore"
  | "skill"
  | "salary"
  | "freshness"
  | "title";

export type JobStatusTab = "all" | JobStatus;

export type ScoreRange = { min: number; max: number };

export type JobScoreFilters = {
  overall: ScoreRange;
  skill: ScoreRange;
  salary: ScoreRange;
  bidEst: ScoreRange;
  freshness: ScoreRange;
};

export type JobSearchFilterState = {
  statusTab: JobStatusTab;
  jobQuery: string;
  companyQuery: string;
  source: string;
  location: string;
  workMode: string;
  seniority: string;
  industry: string;
  postedFrom: string;
  postedTo: string;
  scores: JobScoreFilters;
  sort: JobSortKey;
};

export const DEFAULT_SCORE_RANGE: ScoreRange = { min: 0, max: 100 };

export const DEFAULT_JOB_FILTERS: JobSearchFilterState = {
  statusTab: "all",
  jobQuery: "",
  companyQuery: "",
  source: "all",
  location: "all",
  workMode: "all",
  seniority: "all",
  industry: "all",
  postedFrom: "",
  postedTo: "",
  scores: {
    overall: { ...DEFAULT_SCORE_RANGE },
    skill: { ...DEFAULT_SCORE_RANGE },
    salary: { ...DEFAULT_SCORE_RANGE },
    bidEst: { ...DEFAULT_SCORE_RANGE },
    freshness: { ...DEFAULT_SCORE_RANGE },
  },
  sort: "newest",
};

function parseSalary(salary: string): number {
  const m = salary.match(/\$(\d+)k/);
  return m ? Number(m[1]) : 0;
}

function inScoreRange(value: number, range: ScoreRange) {
  return value >= range.min && value <= range.max;
}

function matchesBaseFilters(job: Job, filters: JobSearchFilterState, includeStatus: boolean) {
  if (includeStatus && filters.statusTab !== "all" && job.status !== filters.statusTab) return false;
  if (filters.source !== "all" && job.source !== filters.source) return false;
  if (filters.location !== "all" && job.location !== filters.location) return false;
  if (filters.workMode !== "all" && job.workMode !== filters.workMode) return false;
  if (filters.seniority !== "all" && job.seniority !== filters.seniority) return false;
  if (filters.industry !== "all" && !job.industries.includes(filters.industry)) return false;

  if (filters.jobQuery.trim()) {
    const q = filters.jobQuery.toLowerCase();
    if (!job.title.toLowerCase().includes(q)) return false;
  }

  if (filters.companyQuery.trim()) {
    const q = filters.companyQuery.toLowerCase();
    if (!job.company.toLowerCase().includes(q)) return false;
  }

  if (filters.postedFrom && job.postedAt < filters.postedFrom) return false;
  if (filters.postedTo && job.postedAt > filters.postedTo) return false;

  const { scores } = job;
  if (!inScoreRange(scores.overall, filters.scores.overall)) return false;
  if (!inScoreRange(scores.skill, filters.scores.skill)) return false;
  if (!inScoreRange(scores.salary, filters.scores.salary)) return false;
  if (!inScoreRange(scores.bidEst, filters.scores.bidEst)) return false;
  if (!inScoreRange(scores.freshness, filters.scores.freshness)) return false;

  return true;
}

function sortJobs(jobs: Job[], sort: JobSortKey) {
  return [...jobs].sort((a, b) => {
    switch (sort) {
      case "newest":
        return b.postedAt.localeCompare(a.postedAt);
      case "matchScore":
        return b.scores.overall - a.scores.overall;
      case "skill":
        return b.scores.skill - a.scores.skill;
      case "salary":
        return parseSalary(b.salary) - parseSalary(a.salary);
      case "freshness":
        return b.scores.freshness - a.scores.freshness;
      case "title":
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });
}

export function filterJobs(
  jobs: Job[],
  filters: JobSearchFilterState,
  excludeIds: Set<string> = new Set(),
) {
  const filtered = jobs.filter(
    (job) => !excludeIds.has(job.id) && matchesBaseFilters(job, filters, true),
  );
  return sortJobs(filtered, filters.sort);
}

export function countJobsByStatus(
  jobs: Job[],
  filters: JobSearchFilterState,
  excludeIds: Set<string> = new Set(),
): Record<JobStatusTab, number> {
  const base = jobs.filter(
    (job) => !excludeIds.has(job.id) && matchesBaseFilters(job, filters, false),
  );

  return {
    all: base.length,
    new: base.filter((j) => j.status === "new").length,
    applied: base.filter((j) => j.status === "applied").length,
    scheduled: base.filter((j) => j.status === "scheduled").length,
    declined: base.filter((j) => j.status === "declined").length,
  };
}

export function countActiveFilters(filters: JobSearchFilterState): number {
  let n = 0;
  if (filters.jobQuery.trim()) n++;
  if (filters.companyQuery.trim()) n++;
  if (filters.source !== "all") n++;
  if (filters.location !== "all") n++;
  if (filters.workMode !== "all") n++;
  if (filters.seniority !== "all") n++;
  if (filters.industry !== "all") n++;
  if (filters.postedFrom || filters.postedTo) n++;

  for (const key of Object.keys(filters.scores) as (keyof JobScoreFilters)[]) {
    const r = filters.scores[key];
    if (r.min !== 0 || r.max !== 100) n++;
  }

  return n;
}

export function useJobSearchResults(
  filters: JobSearchFilterState,
  excludeIds: Set<string> = new Set(),
) {
  return useMemo(() => {
    const results = filterJobs(JOBS, filters, excludeIds);
    const statusCounts = countJobsByStatus(JOBS, filters, excludeIds);
    return { results, statusCounts, total: results.length };
  }, [filters, excludeIds]);
}

/** @deprecated use useJobSearchResults */
export function useJobSearchFilters(
  search: string,
  status: string,
  source: string,
  location: string,
  sort: JobSortKey,
) {
  const filters: JobSearchFilterState = {
    ...DEFAULT_JOB_FILTERS,
    jobQuery: search,
    companyQuery: "",
    statusTab: status === "all" ? "all" : (status as JobStatusTab),
    source,
    location,
    sort: sort === "posted" ? "newest" : sort,
  };
  return filterJobs(JOBS, filters);
}

export function jobSearchFilterFn(job: Job, query: string) {
  return (
    job.title.toLowerCase().includes(query) ||
    job.company.toLowerCase().includes(query) ||
    job.location.toLowerCase().includes(query)
  );
}

export function exportJobsCsv(jobs: Job[]): string {
  const header = "Title,Company,Location,Status,Overall,Skill,Salary Score,Bid Est,Freshness,Posted,Salary,Source";
  const rows = jobs.map((j) =>
    [
      j.title,
      j.company,
      j.location,
      j.status,
      j.scores.overall,
      j.scores.skill,
      j.scores.salary,
      j.scores.bidEst,
      j.scores.freshness,
      j.postedAt,
      j.salary,
      j.source,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

export function downloadJobsCsv(jobs: Job[], filename = "jobs-export.csv") {
  const blob = new Blob([exportJobsCsv(jobs)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
