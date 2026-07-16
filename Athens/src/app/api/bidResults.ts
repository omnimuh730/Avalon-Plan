import { API_BASE } from "@/lib/api-base";
import type { BidResult, BidResultStatus } from "../features/bid-management/types";

type ApiEnvelope<T> = T & { success?: boolean; error?: string };

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

/** API may still return company as { name, tags, logo } from older task rows. */
function companyLabel(company: unknown): string {
  if (typeof company === "string") {
    const s = company.trim();
    return s || "Unknown";
  }
  if (company && typeof company === "object") {
    const name = (company as { name?: unknown; companyName?: unknown }).name
      ?? (company as { companyName?: unknown }).companyName;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "Unknown";
}

function normalizeBidResult(row: BidResult): BidResult {
  return {
    ...row,
    job: {
      ...row.job,
      company: companyLabel(row.job?.company),
      title: typeof row.job?.title === "string" ? row.job.title : "Untitled role",
      location: typeof row.job?.location === "string" ? row.job.location : "—",
      source: typeof row.job?.source === "string" ? row.job.source : "—",
      applyUrl: typeof row.job?.applyUrl === "string" ? row.job.applyUrl : "#",
    },
  };
}

export async function fetchBidResults(applierName: string): Promise<BidResult[]> {
  const params = new URLSearchParams({ applierName });
  const res = await fetch(`${API_BASE}/bid-results?${params}`);
  const data = await parseJson<{ results?: BidResult[] }>(res);
  const rows = Array.isArray(data.results) ? data.results : [];
  return rows.map(normalizeBidResult);
}

export async function patchBidResultStatus(
  id: string,
  applierName: string,
  status: Extract<BidResultStatus, "submitted" | "reviewed" | "rejected">,
): Promise<BidResult | null> {
  const res = await fetch(`${API_BASE}/bid-results/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applierName, status }),
  });
  const data = await parseJson<{ result?: BidResult }>(res);
  return data.result ? normalizeBidResult(data.result) : null;
}
