import { clampScore } from '@nextoffer/shared/score';
import { computeSkillHighlights, jobSkillMatchesProfile, jobSkillMatchWeight, buildProfileCompacts } from '@nextoffer/shared/skill-match';
import { buildProfileTokens } from '@nextoffer/shared/skill-tokens';

export { clampScore };

/**
 * Asymmetric word-token coverage: |jobSkills matched by profile| / |jobSkills|.
 * Profile extras never dilute the score. Job skills are the RAW display strings
 * (not canonicalized) so word tokens such as `AI/ML System` → ai, ml, system
 * survive; matching is via shared token + the ≥5 substring shim.
 *
 * @param {string[]|Set<string>} jobSkills - raw display job skills
 * @param {Set<string>|{ profileTokens?: string[], profileCompacts?: string[], boostCompacts?: string[], exactSet?: Set<string> }} profileSkills
 * @returns {{ matchScore: number, covered: string[], missing: string[], required: number }}
 */
export function computeCoverageScore(jobSkills, profileSkills) {
  const rawSkills = jobSkills instanceof Set
    ? [...jobSkills]
    : (Array.isArray(jobSkills) ? jobSkills : []);
  const ctx = profileSkills instanceof Set
    ? {
        profileTokens: buildProfileTokens([...profileSkills]),
        profileCompacts: buildProfileCompacts([...profileSkills]),
      }
    : profileSkills;

  // Dedupe display skills by normalized text so the same chip isn't double-counted.
  const seen = new Set();
  const uniqueSkills = [];
  for (const raw of rawSkills) {
    const key = String(raw ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueSkills.push(raw);
  }

  const required = uniqueSkills.length;
  if (required === 0) {
    return { matchScore: 0, covered: [], missing: [], required: 0 };
  }

  // Weighted profile (manual user skills carrying category/level weights):
  // each matched job skill contributes its best matching skill's 0..1 weight,
  // so a max-level hard skill counts fully while a soft skill counts partially.
  const weighted = Boolean(ctx?.tokenWeights || ctx?.compactWeights?.length);

  const covered = [];
  const missing = [];
  let weightSum = 0;
  for (const skill of uniqueSkills) {
    if (weighted) {
      const w = jobSkillMatchWeight(skill, ctx);
      if (w > 0) {
        covered.push(skill);
        weightSum += w;
      } else {
        missing.push(skill);
      }
    } else if (jobSkillMatchesProfile(skill, ctx)) {
      covered.push(skill);
    } else {
      missing.push(skill);
    }
  }

  const matchScore = weighted
    ? clampScore((weightSum / required) * 100)
    : clampScore((covered.length / required) * 100);
  return { matchScore, covered, missing, required };
}

/**
 * Compose list-time job scores from coverage + optional vector similarity.
 */
export function composeJobScores(job, coverage, {
  vectorScore = null,
  matchContext = null,
  includeHighlights = false,
} = {}) {
  const skillScore = clampScore(coverage?.matchScore ?? 0);
  const matchScore = vectorScore !== null && vectorScore !== undefined
    ? clampScore(coverage?.finalScore ?? skillScore)
    : skillScore;

  const displaySkills = Array.isArray(job?.skills) ? job.skills.map((s) => String(s).trim()).filter(Boolean) : [];
  const skillHighlights = includeHighlights && matchContext
    ? computeSkillHighlights(displaySkills, matchContext)
    : undefined;

  return {
    matchScore,
    scoreSkill: skillScore,
    scoreVector: vectorScore !== null && vectorScore !== undefined ? clampScore(vectorScore) : null,
    scoreOverall: matchScore,
    skillsCovered: coverage?.covered?.length ?? 0,
    skillsRequired: coverage?.required ?? 0,
    skillsMissing: coverage?.missing ?? [],
    ...(skillHighlights ? { skillHighlights } : {}),
    recommendationRanked: true,
    _score: matchScore,
  };
}

/**
 * Blend skill containment with vector similarity (profile-specific, no role hardcoding).
 */
export function computeHybridScore(skillScore, vectorScore, weights = { skill: 0.55, vector: 0.45 }) {
  const wSkill = Number(weights.skill) || 0;
  const wVector = Number(weights.vector) || 0;
  const total = wSkill + wVector || 1;
  const skill = clampScore(skillScore);
  const vector = clampScore(vectorScore ?? 0);
  return clampScore((wSkill * skill + wVector * vector) / total);
}

export function applyScoreFilters(scoredJobs, scoreFilters) {
  if (!scoreFilters || !Object.keys(scoreFilters).length) return scoredJobs;
  const fieldMap = {
    overallScore: 'scoreOverall',
    skillMatch: 'scoreSkill',
  };
  return scoredJobs.filter((job) => {
    for (const [scoreKey, bounds] of Object.entries(scoreFilters)) {
      const field = fieldMap[scoreKey];
      if (!field) continue;
      const val = job[field];
      if (val === null || val === undefined) continue;
      if (bounds.min !== null && val < bounds.min) return false;
      if (bounds.max !== null && val > bounds.max) return false;
    }
    return true;
  });
}
