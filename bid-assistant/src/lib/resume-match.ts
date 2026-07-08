const SCORE_LINE = /^(.+?)\s+[█#\-*=.\u2588\u2593\u2592\u2591\s]+\s*(\d{1,2})\s*$/;
const SIMPLE_LINE = /^(.+?)\s+(\d{1,2})\s*$/;
const COLON_LINE = /^(.+?):\s*(\d{1,2})\s*$/;

export interface ResumeMatch {
  name: string;
  score: number;
}

export type ResumeCatalog = Record<string, Record<string, number>>;
export type ResumeAnalysisCatalog = Record<
  string,
  { name: string; category?: string; level: number }[]
>;

function normalizeSkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[./]/g, '');
}

function parseSkillLine(rawLine: string): { skill: string; score: number } | null {
  let line = String(rawLine ?? '')
    .trim()
    .replace(/^[-*•]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s*/, '');
  if (!line || line.startsWith('---')) return null;

  for (const pattern of [SCORE_LINE, COLON_LINE, SIMPLE_LINE]) {
    const match = line.match(pattern);
    if (!match) continue;

    const score = Number(match[2]);
    if (!Number.isFinite(score) || score < 0 || score > 10) continue;

    let skill = match[1]
      .trim()
      .replace(/[█#\-*=.\u2588\u2593\u2592\u2591]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!skill || /^(output format|skill name|examples?)$/i.test(skill)) continue;

    return { skill, score };
  }

  const trailing = line.match(/^(.+?)\s+(\d{1,2})\s*$/);
  if (trailing) {
    const score = Number(trailing[2]);
    if (Number.isFinite(score) && score >= 0 && score <= 10) {
      const skill = trailing[1]
        .replace(/[█#\-*=.\u2588\u2593\u2592\u2591]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (skill) return { skill, score };
    }
  }

  return null;
}

/** Parse radar-format skill profile from prompt.md output. */
export function parseSkillProfile(skillProfileText: string): Map<string, number> {
  const scores = new Map<string, number>();

  for (const line of String(skillProfileText ?? '').split('\n')) {
    const parsed = parseSkillLine(line);
    if (parsed) {
      scores.set(normalizeSkillName(parsed.skill), parsed.score);
    }
  }

  return scores;
}

function buildResumeSkillMap(resumeProfile: Record<string, number> | { name: string; level: number }[]) {
  const map = new Map<string, number>();
  if (Array.isArray(resumeProfile)) {
    for (const s of resumeProfile || []) {
      const name = String(s?.name ?? '').trim();
      const level = Number(s?.level);
      if (!name || !Number.isFinite(level)) continue;
      const clamped = Math.max(1, Math.min(5, Math.round(level)));
      const score = Math.max(0, Math.min(10, Math.round(clamped * 2)));
      map.set(normalizeSkillName(name), score);
    }
    return map;
  }

  for (const [skill, score] of Object.entries(resumeProfile || {})) {
    map.set(normalizeSkillName(skill), Number(score) || 0);
  }
  return map;
}

function lookupResumeScore(resumeScores: Map<string, number>, jdSkill: string): number {
  const direct = resumeScores.get(jdSkill);
  if (direct !== undefined) return direct;

  for (const [skill, score] of resumeScores) {
    if (skill.includes(jdSkill) || jdSkill.includes(skill)) {
      return score;
    }
  }

  return 0;
}

// The JD skill profile (produced by the AI per prompt.md) already encodes which
// skills matter: only a few essential skills score high, everything else low.
// So resume selection is a straight weighted-coverage match against those
// scores — no extra hardcoded weighting.
function scoreResume(
  jdScores: Map<string, number>,
  resumeProfile: Record<string, number> | { name: string; level: number }[],
): number {
  const resumeScores = buildResumeSkillMap(resumeProfile);
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [skill, jdScore] of jdScores) {
    if (jdScore <= 0) continue;
    // Square the JD score so the role's few essential skills dominate the match
    // far more than the long tail of low-scored, incidental mentions.
    const weight = jdScore * jdScore;
    totalWeight += weight;
    const resumeScore = lookupResumeScore(resumeScores, skill);
    weightedSum += weight * (Math.min(jdScore, resumeScore) / jdScore);
  }

  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}

/** Rank resume variants from account_info.resumeCatalog against a JD skill profile. */
export function rankResumes(
  jdSkillProfileText: string,
  resumesCatalog: ResumeCatalog | ResumeAnalysisCatalog,
  topN = 3,
): ResumeMatch[] {
  const jdScores = parseSkillProfile(jdSkillProfileText);
  if (jdScores.size === 0) {
    return [];
  }

  const ranked = Object.entries(resumesCatalog)
    .map(([name, profile]) => ({
      name,
      score: scoreResume(jdScores, profile),
    }))
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, topN);
}
