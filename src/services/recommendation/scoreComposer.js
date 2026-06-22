function clampScore(value) {
	const n = Number(value);
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Compose list-time scores from vector similarity only.
 */
export function composeJobScores(_job, { vectorScore = 0 } = {}) {
	const matchScore = clampScore(vectorScore);
	return {
		matchScore,
		scoreSkill: matchScore,
		scoreOverall: matchScore,
		vectorScore: matchScore,
		_score: matchScore,
	};
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
