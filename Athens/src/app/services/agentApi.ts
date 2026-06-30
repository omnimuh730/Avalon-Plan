import { API_BASE } from "@/lib/api-base";
import type {
  ActivityEntry,
  AvalonHealthData,
  DashboardData,
  HealthData,
  RunSummary,
} from "../types/agent";
import { DEFAULT_SESSION_ID } from "@avalon/shared";

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

export function avalonRelayUrl() {
  return (import.meta.env.VITE_AVALON_SERVER || "http://localhost:3847").replace(/\/$/, "");
}

/** Probe Avalon relay via HTTP — does not steal the controller socket slot. */
export async function fetchAvalonHealth(sessionId = DEFAULT_SESSION_ID): Promise<AvalonHealthData> {
  try {
    const res = await fetch(`${avalonRelayUrl()}/health`);
    if (!res.ok) return { ok: false, extension: false };
    const data = (await res.json()) as {
      ok?: boolean;
      active?: Array<{ id: string; peers?: { extension?: boolean } }>;
    };
    const session = data.active?.find((s) => s.id === sessionId) ?? data.active?.[0];
    return {
      ok: Boolean(data.ok),
      extension: Boolean(session?.peers?.extension),
      sessionId: session?.id ?? sessionId,
    };
  } catch {
    return { ok: false, extension: false };
  }
}

export async function fetchAgentHealth(): Promise<HealthData | null> {
  try {
    return await json<HealthData>("/health");
  } catch {
    return null;
  }
}

export async function fetchAgentDashboard(profileId: string | null): Promise<DashboardData | null> {
  try {
    return await json<DashboardData>(`/dashboard${qs(profileId)}`);
  } catch {
    return null;
  }
}

export async function fetchAgentRuns(profileId: string | null, limit = 50): Promise<RunSummary[]> {
  try {
    const data = await json<{ runs: RunSummary[] }>(`/runs${qs(profileId, { limit: String(limit) })}`);
    return data.runs || [];
  } catch {
    return [];
  }
}

export async function fetchAgentActivity(profileId: string | null, limit = 50): Promise<ActivityEntry[]> {
  try {
    const data = await json<{ activity: ActivityEntry[] }>(`/activity${qs(profileId, { limit: String(limit) })}`);
    return data.activity || [];
  } catch {
    return [];
  }
}

export async function fetchAgentModels(profileId: string): Promise<{ id: string }[]> {
  const data = await json<{ models: { id: string }[] }>(`/models${qs(profileId)}`);
  return data.models || [];
}

export async function fetchJobSources(profileId: string): Promise<{ title: string; type: string; posted: number }[]> {
  const data = await json<{ sources: { title: string; type: string; posted: number }[] }>(`/job-sources${qs(profileId)}`);
  return data.sources || [];
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
