import type { ResumeSkillEntry } from "../../../../types/resume";
import type { FullRun } from "./history-types";

export function resolveRunSkillProfile(run: FullRun | null | undefined): ResumeSkillEntry[] {
  if (!run) return [];
  const stored = run.skillProfile;
  if (!Array.isArray(stored) || !stored.length) return [];
  return stored
    .map((s) => ({
      name: String(s?.name ?? "").trim(),
      strength: Math.max(0, Math.min(10, Number(s?.strength) || 0)),
    }))
    .filter((s) => s.name);
}

export function shortenSkillLabel(name: string, max = 14): string {
  const n = name.trim();
  if (n.length <= max) return n;
  return `${n.slice(0, max - 1)}…`;
}

/** Top skills for radar axes — balanced count for readable chart labels. */
export function topSkillsForRadar(skills: ResumeSkillEntry[], limit = 10): ResumeSkillEntry[] {
  return [...skills].sort((a, b) => b.strength - a.strength).slice(0, limit);
}

export function skillRadarData(skills: ResumeSkillEntry[]) {
  const top = topSkillsForRadar(skills);
  return top.map((s) => ({
    dim: shortenSkillLabel(s.name),
    strength: Math.round(s.strength * 10),
  }));
}
