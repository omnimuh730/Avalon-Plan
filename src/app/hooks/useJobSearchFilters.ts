import { useMemo } from "react";
import type { Job } from "../types";
import { JOBS } from "../data/jobs";

export type JobSortKey = "matchScore" | "posted" | "salary" | "title";

function parsePostedDays(posted: string): number {
  const m = posted.match(/(\d+)/);
  return m ? Number(m[1]) : 999;
}

function parseSalary(salary: string): number {
  const m = salary.match(/\$(\d+)k/);
  return m ? Number(m[1]) : 0;
}

export function useJobSearchFilters(
  search: string,
  status: string,
  source: string,
  location: string,
  sort: JobSortKey,
) {
  return useMemo(() => {
    let result = JOBS.filter((j) => {
      if (status !== "all" && j.status !== status) return false;
      if (source !== "all" && j.source !== source) return false;
      if (location !== "all" && j.location !== location) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          j.location.toLowerCase().includes(q)
        );
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "matchScore":
          return b.matchScore - a.matchScore;
        case "posted":
          return parsePostedDays(a.posted) - parsePostedDays(b.posted);
        case "salary":
          return parseSalary(b.salary) - parseSalary(a.salary);
        case "title":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return result;
  }, [search, status, source, location, sort]);
}

export function jobSearchFilterFn(job: Job, query: string) {
  return (
    job.title.toLowerCase().includes(query) ||
    job.company.toLowerCase().includes(query) ||
    job.location.toLowerCase().includes(query)
  );
}

export const JOB_SOURCES = ["all", ...Array.from(new Set(JOBS.map((j) => j.source)))];
export const JOB_LOCATIONS = ["all", ...Array.from(new Set(JOBS.map((j) => j.location)))];
