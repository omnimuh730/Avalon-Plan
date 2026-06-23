import { API_BASE } from "@/lib/api-base";
import type {
  ActivityEntry,
  DashboardData,
  DeployOptions,
  HealthData,
  RunSummary,
} from "../types/agent";

const AGENTS_BASE = `${API_BASE.replace(/\/$/, "")}/agents`;

function qs(profileId: string | null | undefined, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  if (profileId) p.set("profileId", profileId);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AGENTS_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok || (data as { error?: string }).error) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data;
}

export function agentStreamUrl(runId: string) {
  return `${AGENTS_BASE}/stream/${encodeURIComponent(runId)}`;
}

export function agentScreenshotUrl(runId: string, fileName: string) {
  return `${AGENTS_BASE}/runs/${encodeURIComponent(runId)}/screenshots/${encodeURIComponent(fileName)}`;
}

export async function fetchAgentHealth(): Promise<HealthData> {
  return json<HealthData>("/health");
}

export async function fetchAgentDashboard(profileId: string | null): Promise<DashboardData> {
  return json<DashboardData>(`/dashboard${qs(profileId)}`);
}

export async function fetchAgentRuns(profileId: string | null, limit = 50): Promise<RunSummary[]> {
  const data = await json<{ runs: RunSummary[] }>(`/runs${qs(profileId, { limit: String(limit) })}`);
  return data.runs || [];
}

export async function fetchAgentActivity(profileId: string | null, limit = 50): Promise<ActivityEntry[]> {
  const data = await json<{ activity: ActivityEntry[] }>(`/activity${qs(profileId, { limit: String(limit) })}`);
  return data.activity || [];
}

export async function fetchAgentModels(profileId: string): Promise<{ id: string }[]> {
  const data = await json<{ models: { id: string }[] }>(`/models${qs(profileId)}`);
  return data.models || [];
}

export async function fetchJobSources(profileId: string): Promise<{ title: string; type: string; posted: number }[]> {
  const data = await json<{ sources: { title: string; type: string; posted: number }[] }>(`/job-sources${qs(profileId)}`);
  return data.sources || [];
}

export interface ChromeProfile {
  dir: string;
  name: string;
  email: string;
}

/** Installed Google Chrome profiles on this machine (for the Deploy picker). */
export async function fetchChromeProfiles(): Promise<ChromeProfile[]> {
  const res = await fetch(`${API_BASE.replace(/\/$/, "")}/personal/chrome-profiles`);
  const data = (await res.json().catch(() => ({}))) as { profiles?: ChromeProfile[] };
  return data.profiles || [];
}

/** URL for a Chrome profile's avatar image (404s if none — caller falls back). */
export function chromeProfileAvatarUrl(dir: string): string {
  return `${API_BASE.replace(/\/$/, "")}/personal/chrome-profiles/avatar?dir=${encodeURIComponent(dir)}`;
}

/** Import a Chrome profile's logged-in session for an applicant (Chrome must be quit). */
export async function importChromeSession(applierName: string, profileDir: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE.replace(/\/$/, "")}/personal/chrome-profiles/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applierName, profileDir }),
  });
  return (await res.json().catch(() => ({ success: false, error: "request failed" }))) as { success: boolean; message?: string; error?: string };
}

export interface JobCandidate {
  id: string;
  title: string;
  company: string;
  url: string;
  source: string;
}

/**
 * Candidate jobs for the transfer list, in Job Search's **Best match** rank order
 * (sort=recommended), posted (not-yet-applied) only — so the list matches what the
 * user sees in Job Search. Hits the same /jobs/list endpoint Job Search uses.
 */
export async function fetchCandidateJobs(applierName: string, source: string, limit = 200): Promise<JobCandidate[]> {
  const res = await fetch(`${API_BASE.replace(/\/$/, "")}/jobs/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sort: "recommended", // Best match
      applied: false, // posted, not yet applied
      applierName,
      jobSources: source,
      page: 1,
      limit,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>[] };
  const docs = Array.isArray(data.data) ? data.data : [];
  return docs
    .map((d) => {
      const company = d.company as { name?: string } | undefined;
      return {
        id: String(d._id ?? d.id ?? ""),
        title: String(d.title ?? ""),
        company: String(company?.name ?? ""),
        url: String(d.applyLink ?? d.url ?? ""),
        source: String(d.source ?? source),
      };
    })
    .filter((j) => j.id && /^https?:\/\//i.test(j.url));
}

export async function fetchRunEvents(runId: string): Promise<Record<string, unknown>[]> {
  const data = await json<{ events: Record<string, unknown>[] }>(`/runs/${encodeURIComponent(runId)}/events`);
  return data.events || [];
}

export async function deployAgent(opts: DeployOptions) {
  return json<{
    runId: string;
    agentName: string;
    source: string;
    jobCount: number;
    profileName: string;
    model: string;
    jobs: { url: string }[];
  }>("/deploy", { method: "POST", body: JSON.stringify(opts) });
}

export async function resumeAgentRun(runId: string, note?: string) {
  return json<{ ok: boolean }>(`/runs/${encodeURIComponent(runId)}/resume`, {
    method: "POST",
    body: JSON.stringify({ note: note || "The human has completed the required step in the browser." }),
  });
}

/** Pause a running agent: aborts the current turn; browser stays open for Resume. */
export async function pauseAgentRun(runId: string) {
  return json<{ ok: boolean }>(`/runs/${encodeURIComponent(runId)}/pause`, { method: "POST" });
}

/** Stop (kill) a run: aborts it and closes its browser session. */
export async function stopAgentRun(runId: string) {
  return json<{ ok: boolean }>(`/runs/${encodeURIComponent(runId)}/stop`, { method: "POST" });
}

/** Close orphaned browser sessions left by a crash (active runs are skipped). */
export async function sweepAgentBrowsers() {
  return json<{ ok: boolean; closed: string[] }>(`/browsers/sweep`, { method: "POST" });
}
