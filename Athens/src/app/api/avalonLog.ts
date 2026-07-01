import { API_BASE } from "@/lib/api-base";

const AGENTS_BASE = `${API_BASE.replace(/\/$/, "")}/agents`;

export interface ApplyLogEvent {
  at: string;
  level: "info" | "success" | "warn" | "error";
  phase?: string;
  message: string;
  /** Structured payload for debugging (tree summary, plan, page snapshot, script, verdict…). */
  data?: unknown;
}

export interface ApplyLogPayload {
  runId: string;
  applierName?: string;
  job?: { id: string; title: string; company?: string; url: string; source?: string };
  meta?: Record<string, unknown>;
  events?: ApplyLogEvent[];
  status?: string;
  finished?: boolean;
}

/**
 * Persist a batch of apply-run events to the backend (local JSONL file + MongoDB).
 * Fire-and-forget: logging must never break the apply flow, so this never throws.
 */
export async function postApplyLog(payload: ApplyLogPayload): Promise<void> {
  try {
    await fetch(`${AGENTS_BASE}/apply-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* logging is best-effort */
  }
}
