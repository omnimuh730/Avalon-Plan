import { API_BASE } from "@/lib/api-base";

export type JobEmbeddingSession = {
  running: boolean;
  status: "idle" | "running" | "completed" | "cancelled" | "failed";
  sessionId?: string;
  missing?: number;
  total?: number;
  processed?: number;
  embedded?: number;
  skipped?: number;
  failed?: number;
  remaining?: number;
  lastJob?: { id: string; title: string } | null;
  lastSkipReason?: string | null;
  startedAt?: string;
  finishedAt?: string | null;
  error?: string | null;
};

type StatusResponse = { success?: boolean; error?: string } & JobEmbeddingSession;

type StartResponse = {
  success?: boolean;
  error?: string;
  sessionId?: string | null;
  missing?: number;
  started?: boolean;
  message?: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchJobEmbeddingStatus(): Promise<JobEmbeddingSession> {
  const res = await fetch(`${API_BASE}/jobs/embeddings/status`);
  const data = await parseJson<StatusResponse>(res);
  return data;
}

export async function startJobEmbeddings(): Promise<StartResponse> {
  const res = await fetch(`${API_BASE}/jobs/embeddings/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return parseJson<StartResponse>(res);
}

export async function stopJobEmbeddings(): Promise<{ stopped: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/jobs/embeddings/stop`, { method: "POST" });
  return parseJson(res);
}
