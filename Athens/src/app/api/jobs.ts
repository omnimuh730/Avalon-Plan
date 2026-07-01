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

/** Fetch a job's full detail (incl. description) by Mongo id. Returns "" if unavailable. */
export async function fetchJobDescription(jobId: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}`);
    if (!res.ok) return "";
    const data = (await res.json()) as { data?: { description?: string; jobDescription?: string } };
    return String(data.data?.description ?? data.data?.jobDescription ?? "").trim();
  } catch {
    return "";
  }
}

export interface GeneratedResumeUsage {
  promptTokens: number;
  cachedTokens?: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface GeneratedJobResume {
  pdfBase64: string;
  fileName: string;
  mimeType: string;
  reused: boolean;
  generationId: string | null;
  resumePdfPath?: string | null;
  model?: string | null;
  provider?: string | null;
  usage?: GeneratedResumeUsage;
}

/**
 * Generate (or reuse) a per-job résumé tailored to the JD, using the profile's
 * saved Resume Generator config. Only jobDescription varies per job.
 * Throws on failure — callers must abort apply (no bundled fallback).
 */
export async function generateJobResume(params: {
  applierName: string;
  jobId: string;
  jobDescription: string;
  forceRegenerate?: boolean;
}): Promise<GeneratedJobResume> {
  const res = await fetch(`${API_BASE}/personal/resume-generate/for-agent-job`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applierName: params.applierName,
      jobId: params.jobId,
      jobDescription: params.jobDescription,
      ...(params.forceRegenerate ? { forceRegenerate: true } : {}),
    }),
  });
  const data = (await res.json()) as {
    success?: boolean;
    error?: string;
    pdfBase64?: string;
    fileName?: string;
    reused?: boolean;
    generationId?: string | null;
    resumePdfPath?: string | null;
    model?: string | null;
    provider?: string | null;
    usage?: {
      inputTokens?: number;
      cachedTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      costUsd?: number;
      cost?: number;
    };
  };
  if (!res.ok || !data.success) throw new Error(data.error || `Résumé generation failed (${res.status})`);
  if (!data.pdfBase64) throw new Error("Résumé generated but no PDF was returned");
  const fileName = (data.fileName || `${params.applierName}.pdf`)
    .replace(/\.txt\.pdf$/i, '.pdf')
    .replace(/[^\w.\-()+ ]+/g, '_');
  const finalName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  const u = data.usage;
  return {
    pdfBase64: data.pdfBase64,
    fileName: finalName,
    mimeType: "application/pdf",
    reused: Boolean(data.reused),
    generationId: data.generationId ?? null,
    resumePdfPath: data.resumePdfPath ?? null,
    model: data.model ?? null,
    provider: data.provider ?? null,
    usage: u
      ? {
          promptTokens: u.inputTokens ?? 0,
          cachedTokens: u.cachedTokens,
          completionTokens: u.outputTokens ?? 0,
          totalTokens: u.totalTokens ?? 0,
          costUsd: u.costUsd ?? u.cost,
        }
      : undefined,
  };
}
