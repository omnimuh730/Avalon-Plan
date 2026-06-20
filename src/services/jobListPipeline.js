import { calculateJobScores, SCORE_WEIGHTS, JOB_SCORE_MODEL_VERSION } from '../../../configs/jobScore.js';
import { inferJobSource, SOURCE_MAP_VERSION } from '../../../configs/pub.js';

/** Map API / filter keys to aggregation field names on each job doc. */
export const SCORE_FIELD_MAP = {
	overallScore: 'scoreOverall',
	skillMatch: 'scoreSkill',
	salaryScore: 'scoreSalary',
	applicantScore: 'scoreApplicant',
	postedDateScore: 'scoreFreshness',
};

export function attachStaticScoreFields(job) {
	const scores = calculateJobScores(job, []);
	return {
		// null marks "salary undetermined" so it can be excluded from the overall average.
		scoreSalary: scores.salaryScore,
		scoreApplicant: scores.applicantScore,
		source: inferJobSource(job.applyLink),
		sourceVersion: SOURCE_MAP_VERSION,
		scoreVersion: JOB_SCORE_MODEL_VERSION,
	};
}

/**
 * Mongo stages: derive score* fields used for filter/sort (freshness from postedAt).
 * Skill uses the stored, precomputed `skillScore` (kept fresh by skillScoreService
 * when personal skills change) — computing it live per request is far too slow.
 */
export function scoreDerivationStages() {
	return [
		{
			$addFields: {
				scoreSkill: { $ifNull: ['$skillScore', 45] },
				scoreSalary: { $cond: [{ $isNumber: '$scoreSalary' }, '$scoreSalary', null] },
				scoreApplicant: { $ifNull: ['$scoreApplicant', 50] },
				scoreFreshness: {
					$let: {
						vars: {
							postedMs: {
								$convert: {
									input: { $ifNull: ['$postedAt', '$_createdAt'] },
									to: 'date',
									onError: new Date(0),
									onNull: new Date(0),
								},
							},
						},
						in: {
							$let: {
								vars: {
									ageDays: {
										$max: [
											0,
											{
												$divide: [{ $subtract: [new Date(), '$$postedMs'] }, 86400000],
											},
										],
									},
								},
								in: {
									$round: {
										$max: [
											0,
											{
												$min: [
													100,
													{
														$subtract: [
															100,
															{ $multiply: [{ $min: ['$$ageDays', 30] }, 3] },
														],
													},
												],
											},
										],
									},
								},
							},
						},
					},
				},
			},
		},
		{
			$addFields: {
				scoreOverall: {
					$round: {
						$max: [
							0,
							{
								$min: [
									100,
									{
										$let: {
											vars: {
												base: {
													$add: [
														{ $multiply: ['$scoreSkill', SCORE_WEIGHTS.skill] },
														{ $multiply: ['$scoreApplicant', SCORE_WEIGHTS.applicant] },
														{ $multiply: ['$scoreFreshness', SCORE_WEIGHTS.freshness] },
													],
												},
											},
											in: {
												// Undetermined salary is excluded; remaining weights re-normalized.
												$cond: [
													{ $isNumber: '$scoreSalary' },
													{ $add: ['$$base', { $multiply: ['$scoreSalary', SCORE_WEIGHTS.salary] }] },
													{ $divide: ['$$base', 1 - SCORE_WEIGHTS.salary] },
												],
											},
										},
									},
								],
							},
						],
					},
				},
			},
		},
		{
			$addFields: {
				_score: '$scoreOverall',
			},
		},
	];
}

export function buildScoreFilterStage(scoreFilters) {
	if (!scoreFilters || !Object.keys(scoreFilters).length) return null;
	const match = {};
	for (const [scoreKey, bounds] of Object.entries(scoreFilters)) {
		const field = SCORE_FIELD_MAP[scoreKey];
		if (!field) continue;
		if (bounds.min !== null) {
			match[field] = { ...(match[field] || {}), $gte: bounds.min };
		}
		if (bounds.max !== null) {
			match[field] = { ...(match[field] || {}), $lte: bounds.max };
		}
	}
	return Object.keys(match).length ? { $match: match } : null;
}

export function sortStageForApiSort(sort) {
	if (sort === 'recommended') return { scoreOverall: -1, postedAt: -1, _id: -1 };
	if (sort === 'score_asc') return { scoreOverall: 1, postedAt: -1, _id: -1 };
	if (sort === 'salary_desc') return { scoreSalary: -1, postedAt: -1, _id: -1 };
	if (sort === 'salary_asc') return { scoreSalary: 1, postedAt: -1, _id: -1 };
	if (sort === 'postedAt_asc') return { postedAt: 1, _id: -1 };
	return { postedAt: -1, _id: -1 };
}

export function needsScorePipeline(sort, hasScoreFilters) {
	return hasScoreFilters || ['recommended', 'score_asc', 'salary_desc', 'salary_asc'].includes(sort);
}

export async function runJobListAggregation(jobsCollection, query, { sort, skip, limit, scoreFilters }) {
	const pipeline = [
		{ $match: query },
		// Keep only the fields needed for score derivation and sorting so the
		// compute + in-memory sort works on ~100B docs instead of full ~4KB docs.
		{ $project: { skillScore: 1, scoreSalary: 1, scoreApplicant: 1, postedAt: 1, _createdAt: 1 } },
		...scoreDerivationStages(),
	];
	const scoreFilterStage = buildScoreFilterStage(scoreFilters);
	if (scoreFilterStage) pipeline.push(scoreFilterStage);

	const sortDoc = sortStageForApiSort(sort);
	const dataPipeline = [
		{ $sort: sortDoc },
		{ $skip: skip },
		{ $limit: limit },
		{ $project: { _id: 1, _score: 1 } },
	];

	pipeline.push({
		$facet: {
			total: [{ $count: 'count' }],
			data: dataPipeline,
		},
	});

	const [result] = await jobsCollection.aggregate(pipeline).toArray();
	const total = result?.total?.[0]?.count ?? 0;
	const pageRows = result?.data ?? [];
	if (!pageRows.length) return { docs: [], total };

	// Hydrate the page of full documents by _id, preserving pipeline order.
	const ids = pageRows.map((row) => row._id);
	const fullDocs = await jobsCollection.find({ _id: { $in: ids } }).toArray();
	const byId = new Map(fullDocs.map((doc) => [String(doc._id), doc]));
	const docs = pageRows
		.map((row) => {
			const doc = byId.get(String(row._id));
			return doc ? { ...doc, _score: row._score } : null;
		})
		.filter(Boolean);
	return { docs, total };
}
