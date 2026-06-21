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
