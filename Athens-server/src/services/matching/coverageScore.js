import { normalizeSkillSet, toCanonical } from '@nextoffer/shared/skill-normalize';
import { clampScore } from '@nextoffer/shared/score';

export { clampScore };

/**
 * Asymmetric containment: |job ∩ profile| / |job|.
 * Profile extras never dilute the score.
 *
 * @param {string[]|Set<string>} jobSkills - canonical job skills
 * @param {string[]|Set<string>} profileSkills - canonical profile skills
 * @returns {{ matchScore: number, covered: string[], missing: string[], required: number }}
 */
export function computeCoverageScore(jobSkills, profileSkills) {
  const jobSet = jobSkills instanceof Set ? jobSkills : normalizeSkillSet(jobSkills);
  const profileSet = profileSkills instanceof Set ? profileSkills : normalizeSkillSet(profileSkills);

  const required = jobSet.size;
  if (required === 0) {
    return { matchScore: 0, covered: [], missing: [], required: 0 };
  }

  const covered = [];
  const missing = [];
  for (const skill of jobSet) {
    if (profileSet.has(skill)) covered.push(skill);
    else missing.push(skill);
  }

  const matchScore = clampScore((covered.length / required) * 100);
  return { matchScore, covered, missing, required };
}

/**
 * Compose list-time job scores from coverage + optional vector similarity.
 */
export function composeJobScores(job, coverage, { vectorScore = null } = {}) {
  const skillScore = clampScore(coverage?.matchScore ?? 0);
  const matchScore = vectorScore !== null && vectorScore !== undefined
    ? clampScore(coverage?.finalScore ?? skillScore)
    : skillScore;

  const displaySkills = Array.isArray(job?.skills) ? job.skills.map((s) => String(s).trim()).filter(Boolean) : [];
  const coveredSet = new Set(coverage?.covered ?? []);
  const skillHighlights = displaySkills.map((name) => {
    const key = toCanonical(name);
    return { name, matched: key ? coveredSet.has(key) : false };
  });

  return {
    matchScore,
    scoreSkill: skillScore,
    scoreVector: vectorScore !== null && vectorScore !== undefined ? clampScore(vectorScore) : null,
    scoreOverall: matchScore,
    skillsCovered: coverage?.covered?.length ?? 0,
    skillsRequired: coverage?.required ?? 0,
    skillsMissing: coverage?.missing ?? [],
    skillHighlights,
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
