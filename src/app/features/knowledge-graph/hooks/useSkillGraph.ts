import { useCallback, useEffect, useMemo, useState } from "react";
import type { SkillGraph, ActivationResult } from "../../../types/knowledgeGraph";
import {
  fetchWorldGraph,
  fetchUserGraphs,
  type UserKnowledgeGraph,
} from "@/app/api/skillGraph";
import { useApplier } from "@/context/applier-context";
import {
  computeActivation,
  DEFAULT_PARAMS,
  type EvidenceItem,
} from "../lib/activation";
import { buildGraphData, type GraphRenderData } from "../lib/graphAdapter";

export interface ProfileOption {
  id: string;
  name: string;
  skillIds: string[];
  graph: UserKnowledgeGraph;
}

function graphProfileId(g: UserKnowledgeGraph): string {
  return `${g.applierName}:${g.resumeId}`;
}

function buildEvidence(
  active: Set<string>,
  profiles: ProfileOption[],
): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  for (const profile of profiles) {
    if (!active.has(profile.id)) continue;
    const counts = new Map<string, number>();
    for (const s of profile.graph.skills) {
      const id = s.canonicalId;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [id, freq] of counts) {
      const skill = profile.graph.skills.find((s) => s.canonicalId === id);
      items.push({
        id,
        proficiency: skill?.proficiency ?? 0.85,
        ageYears: 0.05,
        freq,
        sources: [profile.id],
      });
    }
  }
  return items;
}

export interface UseSkillGraphResult {
  profiles: ProfileOption[];
  activeResumeIds: Set<string>;
  toggleResume: (id: string) => void;
  setAllResumes: (active: boolean) => void;
  alpha: number;
  setAlpha: (a: number) => void;
  graphData: GraphRenderData;
  result: ActivationResult;
  worldGraph: SkillGraph | null;
  loading: boolean;
  error: string | null;
  totalNodes: number;
  truncated: boolean;
  refreshWorldGraph: () => Promise<void>;
  searchNodes: { id: string; label: string; category: import("../../../types/knowledgeGraph").SkillCategory }[];
}

export function useSkillGraph(): UseSkillGraphResult {
  const { applier } = useApplier();
  const [worldGraph, setWorldGraph] = useState<SkillGraph | null>(null);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [activeResumeIds, setActiveResumeIds] = useState<Set<string>>(new Set());
  const [alpha, setAlpha] = useState(DEFAULT_PARAMS.alpha);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalNodes, setTotalNodes] = useState(0);
  const [truncated, setTruncated] = useState(false);

  const refreshWorldGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { graph, totalNodes: total, truncated: trunc } = await fetchWorldGraph();
      setWorldGraph(graph);
      setTotalNodes(total);
      setTruncated(trunc);

      const applierName = applier?.name;
      if (applierName) {
        const graphs = await fetchUserGraphs(applierName);
        const nextProfiles: ProfileOption[] = graphs.map((g) => ({
          id: graphProfileId(g),
          name: g.resumeName || g.resumeId,
          skillIds: g.skills.map((s) => s.canonicalId).filter(Boolean) as string[],
          graph: g,
        }));
        setProfiles(nextProfiles);
        setActiveResumeIds((prev) => {
          if (prev.size > 0) {
            const kept = new Set([...prev].filter((id) => nextProfiles.some((p) => p.id === id)));
            if (kept.size > 0) return kept;
          }
          return nextProfiles.length ? new Set([nextProfiles[0].id]) : new Set();
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, [applier?.name]);

  useEffect(() => {
    void refreshWorldGraph();
  }, [refreshWorldGraph]);

  const toggleResume = (id: string) =>
    setActiveResumeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setAllResumes = (active: boolean) =>
    setActiveResumeIds(active ? new Set(profiles.map((p) => p.id)) : new Set());

  const { graphData, result } = useMemo(() => {
    const empty: ActivationResult = {
      activation: {},
      evidence: {},
      contributors: {},
      edgeWeights: {},
      iterations: 0,
    };
    if (!worldGraph?.nodes.length) {
      return { graphData: { nodes: [], links: [] } as GraphRenderData, result: empty };
    }

    const evidence = buildEvidence(activeResumeIds, profiles);
    const activeProfiles = profiles
      .filter((p) => activeResumeIds.has(p.id))
      .map((p) => p.skillIds);
    const res = computeActivation(worldGraph, evidence, activeProfiles, {
      ...DEFAULT_PARAMS,
      alpha,
    });
    return { graphData: buildGraphData(worldGraph, res), result: res };
  }, [activeResumeIds, alpha, profiles, worldGraph]);

  const searchNodes = useMemo(
    () =>
      (worldGraph?.nodes || []).map((n) => ({
        id: n.id,
        label: n.label,
        category: n.category,
      })),
    [worldGraph],
  );

  return {
    profiles,
    activeResumeIds,
    toggleResume,
    setAllResumes,
    alpha,
    setAlpha,
    graphData,
    result,
    worldGraph,
    loading,
    error,
    totalNodes,
    truncated,
    refreshWorldGraph,
    searchNodes,
  };
}
