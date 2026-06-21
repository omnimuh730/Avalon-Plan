import { API_BASE } from "@/lib/api-base";
import type { SkillCategory, SkillGraph, SkillRelationType } from "../types/knowledgeGraph";

export interface SkillAnalysisUsage {
  model?: string | null;
  inputTokens: number;
  cachedTokens?: number;
  outputTokens: number;
  totalTokens: number;
  cost: number | null;
  savings?: number | null;
}

export interface PendingSkill {
  normalizedKey: string;
  surfaceForm: string;
  status: string;
  createdAt?: string;
  attempts?: number;
  error?: string;
}

export interface QueueStats {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  total?: number;
}

export interface EnrichmentSession {
  running: boolean;
  status: string;
  sessionId?: string;
  mode?: string;
  processed?: number;
  failed?: number;
  remaining?: number;
  usage?: SkillAnalysisUsage | null;
  lastSkill?: { normalizedKey: string; surfaceForm: string; skillId?: string; path?: string } | null;
  startedAt?: string;
  finishedAt?: string | null;
  cancelled?: boolean;
}

export interface WorldGraphNode {
  id: string;
  label: string;
  category: SkillCategory;
  skillType?: string;
  rawCategory?: string;
}

export interface WorldGraphEdge {
  from: string;
  to: string;
  type: SkillRelationType | string;
  weight: number;
}

export interface UserGraphSkill {
  surfaceForm: string;
  normalizedKey: string;
  canonicalId: string | null;
  proficiency?: number;
  sources?: string[];
}

export interface UserKnowledgeGraph {
  applierName: string;
  resumeId: string;
  resumeName: string;
  skills: UserGraphSkill[];
  edges?: { fromId: string; toId: string; type: string; weight: number }[];
  updatedAt?: string;
}

export function toSkillGraph(nodes: WorldGraphNode[], edges: WorldGraphEdge[]): SkillGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label,
      category: n.category,
    })),
    edges: edges.map((e) => ({
      from: e.from,
      to: e.to,
      type: e.type as SkillRelationType,
      weight: e.weight,
    })),
  };
}

export async function fetchWorldGraph(): Promise<{
  graph: SkillGraph;
  totalNodes: number;
  truncated: boolean;
  queueStats: QueueStats;
}> {
  const res = await fetch(`${API_BASE}/skills/graph/world`);
  const data = (await res.json()) as {
    success?: boolean;
    graph?: { nodes: WorldGraphNode[]; edges: WorldGraphEdge[]; totalNodes: number; truncated: boolean };
    queueStats?: QueueStats;
    error?: string;
  };
  if (!res.ok || !data.success || !data.graph) {
    throw new Error(data.error || "Failed to load world graph");
  }
  return {
    graph: toSkillGraph(data.graph.nodes, data.graph.edges),
    totalNodes: data.graph.totalNodes,
    truncated: data.graph.truncated,
    queueStats: data.queueStats || { pending: 0, processing: 0, done: 0, failed: 0 },
  };
}

export async function fetchPendingSkills(limit = 200): Promise<{ pending: PendingSkill[]; stats: QueueStats }> {
  const res = await fetch(`${API_BASE}/skills/enrichment/pending?limit=${limit}`);
  const data = (await res.json()) as {
    success?: boolean;
    pending?: PendingSkill[];
    stats?: QueueStats;
    error?: string;
  };
  if (!res.ok || !data.success) throw new Error(data.error || "Failed to load pending skills");
  return { pending: data.pending || [], stats: data.stats || { pending: 0, processing: 0, done: 0, failed: 0 } };
}

export async function fetchEnrichmentStatus(): Promise<{ session: EnrichmentSession; stats: QueueStats }> {
  const res = await fetch(`${API_BASE}/skills/enrichment/status`);
  const data = (await res.json()) as {
    success?: boolean;
    session?: EnrichmentSession;
    stats?: QueueStats;
    error?: string;
  };
  if (!res.ok || !data.success) throw new Error(data.error || "Failed to load enrichment status");
  return {
    session: data.session || { running: false, status: "idle" },
    stats: data.stats || { pending: 0, processing: 0, done: 0, failed: 0 },
  };
}

export async function startEnrichment(options: {
  applierName?: string;
  mode?: "fast" | "smart";
  limit?: number;
}): Promise<{ sessionId: string; mode: string; pending: number }> {
  const res = await fetch(`${API_BASE}/skills/enrichment/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  const data = (await res.json()) as {
    success?: boolean;
    sessionId?: string;
    mode?: string;
    pending?: number;
    error?: string;
  };
  if (!res.ok || !data.success) throw new Error(data.error || "Failed to start enrichment");
  return { sessionId: data.sessionId || "", mode: data.mode || "fast", pending: data.pending ?? 0 };
}

export async function stopEnrichment(): Promise<void> {
  const res = await fetch(`${API_BASE}/skills/enrichment/stop`, { method: "POST" });
  const data = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !data.success) throw new Error(data.error || "Failed to stop enrichment");
}

export async function fetchUserGraphs(applierName: string): Promise<UserKnowledgeGraph[]> {
  const res = await fetch(
    `${API_BASE}/user-graph?applierName=${encodeURIComponent(applierName)}`,
  );
  const data = (await res.json()) as {
    success?: boolean;
    graphs?: UserKnowledgeGraph[];
    error?: string;
  };
  if (!res.ok || !data.success) throw new Error(data.error || "Failed to load user graphs");
  return data.graphs || [];
}

export function formatEnrichmentCost(usage?: SkillAnalysisUsage | null): string | null {
  if (!usage || usage.cost == null || !Number.isFinite(usage.cost)) return null;
  const inTok = usage.inputTokens ?? 0;
  const outTok = usage.outputTokens ?? 0;
  if (inTok + outTok === 0) {
    return usage.cost === 0 ? "$0.0000 · graph only" : `$${usage.cost.toFixed(4)}`;
  }
  return `$${usage.cost.toFixed(4)} · ${inTok.toLocaleString()} in · ${outTok.toLocaleString()} out`;
}
