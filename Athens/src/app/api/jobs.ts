import { API_BASE } from "@/lib/api-base";
import type { JobStatus } from "../types/job";

export type JobApiStatus = "Applied" | "Scheduled" | "Declined";

export const JOB_STATUS_TO_API: Record<Exclude<JobStatus, "posted">, JobApiStatus> = {
  applied: "Applied",
  scheduled: "Scheduled",
  declined: "Declined",
};

type JobMutationResponse = {
  success?: boolean;
  error?: string;
  data?: Record<string, unknown>;
  message?: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function applyToJob(jobId: string, applierName: string): Promise<JobMutationResponse> {
  const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applierName }),
  });
  return parseJson(res);
}

export async function updateJobStatus(
  jobId: string,
  applierName: string,
  status: JobApiStatus,
): Promise<JobMutationResponse> {
  const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applierName, status }),
  });
  return parseJson(res);
}

export async function unapplyFromJob(jobId: string, applierName: string): Promise<JobMutationResponse> {
  const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}/unapply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applierName }),
  });
  return parseJson(res);
}

/** Permanently delete jobs from the database. */
export async function removeJobs(ids: string[]): Promise<{ success?: boolean; deletedCount?: number; error?: string }> {
  const res = await fetch(`${API_BASE}/jobs/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return parseJson(res);
}
