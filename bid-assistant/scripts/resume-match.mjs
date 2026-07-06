const SCORE_LINE =
  /^(.+?)\s+[█\u2588\u2593\u2592\u2591\s]*\s+(\d+)\s*$/;

function normalizeSkillName(name) {
  return name.trim().toLowerCase();
}

/** Parse radar-format skill profile from prompt.md output. */
export function parseSkillProfile(skillProfileText) {
  const scores = new Map();

  for (const line of String(skillProfileText ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(SCORE_LINE);
    if (match) {
      const skill = match[1].trim();
      const score = Number(match[2]);
      if (skill && Number.isFinite(score)) {
        scores.set(normalizeSkillName(skill), score);
      }
      continue;
    }

    const fallback = trimmed.match(/^(.+?)\s+(\d+)\s*$/);
    if (fallback) {
      const skill = fallback[1].trim();
      const score = Number(fallback[2]);
      if (skill && Number.isFinite(score)) {
        scores.set(normalizeSkillName(skill), score);
      }
    }
  }

  return scores;
}

function buildResumeSkillMap(resumeProfile) {
  const map = new Map();
  for (const [skill, score] of Object.entries(resumeProfile)) {
    map.set(normalizeSkillName(skill), Number(score) || 0);
  }
  return map;
}

function scoreResume(jdScores, resumeProfile) {
  const resumeScores = buildResumeSkillMap(resumeProfile);
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [skill, jdScore] of jdScores) {
    if (jdScore <= 0) continue;
    totalWeight += jdScore;
    const resumeScore = resumeScores.get(skill) ?? 0;
    weightedSum += Math.min(jdScore, resumeScore);
  }

  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}

/** Rank resume variants from resumes.json against a JD skill profile. */
export function rankResumes(jdSkillProfileText, resumesCatalog, topN = 3) {
  const jdScores = parseSkillProfile(jdSkillProfileText);
  if (jdScores.size === 0) {
    return [];
  }

  const ranked = Object.entries(resumesCatalog)
    .map(([name, profile]) => ({
      name,
      score: scoreResume(jdScores, profile),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, topN);
}
