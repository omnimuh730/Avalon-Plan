import { useMemo, useState } from "react";
import { SEED_DOCUMENTS } from "../../../data/resumes/seedDocument";
import { resolveSkillId } from "../../../data/knowledge-graph";
import { SKILL_GRAPH } from "../../../data/knowledge-graph/skillUniverse";
import type { ResumeDocument, ResumeSummary } from "../../../types/resume";
import {
  computeActivation,
  DEFAULT_PARAMS,
  type EvidenceItem,
} from "../lib/activation";
import { buildGraphData, type GraphRenderData } from "../lib/graphAdapter";
import type { ActivationResult } from "../../../types/knowledgeGraph";

export interface ProfileOption {
  id: string;
  name: string;
  /** Resolved skill node ids present on this resume. */
  skillIds: string[];
  matchScore: number;
}

/** Rough relative-date -> age in years for recency decay. */
function parseAgeYears(updated: string): number {
  const m = updated.match(/(\d+)\s*(day|week|month|year)/i);
  if (!m) return 0.05;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case "day":
      return n / 365;
    case "week":
      return (n * 7) / 365;
    case "month":
      return n / 12;
    case "year":
      return n;
    default:
      return 0.05;
  }
}

function flattenDocumentSkills(doc: ResumeDocument): string[] {
  return [
    ...doc.skills.languages,
    ...doc.skills.frameworks,
    ...doc.skills.databases,
    ...doc.skills.cloudDevOps,
  ];
}

/** Build the per-resume profile options once from seed data. */
function buildProfileOptions(): ProfileOption[] {
  return SEED_DOCUMENTS.map(({ summary, document }) => {
    const raw = [...summary.skills, ...flattenDocumentSkills(document)];
    const ids = new Set<string>();
    for (const s of raw) {
      const id = resolveSkillId(s);
      if (id) ids.add(id);
    }
    return {
      id: summary.id,
      name: summary.name,
      skillIds: [...ids],
      matchScore: summary.matchScore,
    } satisfies ProfileOption;
  });
}

/** Build evidence items for the active resumes. */
function buildEvidence(
  active: Set<string>,
  records: { summary: ResumeSummary; document: ResumeDocument }[],
): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  for (const { summary, document } of records) {
    if (!active.has(summary.id)) continue;
    const ageYears = parseAgeYears(summary.updated);
    const highlighted = new Set(summary.skills.map((s) => resolveSkillId(s)).filter(Boolean) as string[]);

    // Count occurrences per resolved skill id within this resume.
    const counts = new Map<string, number>();
    const all = [...summary.skills, ...flattenDocumentSkills(document)];
    for (const s of all) {
      const id = resolveSkillId(s);
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    for (const [id, freq] of counts) {
      items.push({
        id,
        proficiency: highlighted.has(id) ? 0.95 : 0.7,
        ageYears,
        freq,
        sources: [summary.id],
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
}

export function useSkillGraph(): UseSkillGraphResult {
  const profiles = useMemo(buildProfileOptions, []);
  const [activeResumeIds, setActiveResumeIds] = useState<Set<string>>(
    () => new Set(SEED_DOCUMENTS.filter((d) => d.summary.isPrimary).map((d) => d.summary.id)),
  );
  const [alpha, setAlpha] = useState(DEFAULT_PARAMS.alpha);

  const toggleResume = (id: string) =>
    setActiveResumeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setAllResumes = (active: boolean) =>
    setActiveResumeIds(active ? new Set(SEED_DOCUMENTS.map((d) => d.summary.id)) : new Set());

  const { graphData, result } = useMemo(() => {
    const evidence = buildEvidence(activeResumeIds, SEED_DOCUMENTS);
    const activeProfiles = profiles
      .filter((p) => activeResumeIds.has(p.id))
      .map((p) => p.skillIds);
    const res = computeActivation(SKILL_GRAPH, evidence, activeProfiles, {
      ...DEFAULT_PARAMS,
      alpha,
    });
    return { graphData: buildGraphData(SKILL_GRAPH, res), result: res };
  }, [activeResumeIds, alpha, profiles]);

  return {
    profiles,
    activeResumeIds,
    toggleResume,
    setAllResumes,
    alpha,
    setAlpha,
    graphData,
    result,
  };
}
