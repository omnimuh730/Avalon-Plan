import { calculateJobScores, JOB_SCORE_MODEL_VERSION } from '../../../configs/jobScore.js';
import { inferJobSource, SOURCE_MAP_VERSION } from '../../../configs/pub.js';

export async function ensureJobMarketIndexes(jobsCollection) {
	if (!jobsCollection) return;
	await Promise.all([
		jobsCollection.createIndex({ postedAt: -1 }),
		jobsCollection.createIndex({ skillScore: -1 }),
		jobsCollection.createIndex({ scoreSalary: -1 }),
		jobsCollection.createIndex({ scoreApplicant: -1 }),
		jobsCollection.createIndex({ url: 1 }),
		jobsCollection.createIndex({ 'status.applier': 1 }),
		jobsCollection.createIndex({ source: 1, postedAt: -1 }),
	]);
}

/** One-time / background backfill for jobs missing denormalized score fields or computed with an older formula. */
export async function backfillMissingJobScoreFields(jobsCollection) {
	if (!jobsCollection) return { updated: 0 };
	const cursor = jobsCollection.find(
		{
			$or: [
				{ scoreSalary: { $exists: false } },
				{ scoreApplicant: { $exists: false } },
				{ source: { $exists: false } },
				{ sourceVersion: { $ne: SOURCE_MAP_VERSION } },
				{ scoreVersion: { $ne: JOB_SCORE_MODEL_VERSION } },
			],
		},
		{ projection: { details: 1, salary: 1, applicants: 1, applicantCount: 1, skills: 1, applyLink: 1 } },
	);

	let updated = 0;
	const batch = [];
	const flush = async () => {
		if (!batch.length) return;
		await jobsCollection.bulkWrite(batch, { ordered: false });
		updated += batch.length;
		batch.length = 0;
	};

	for await (const job of cursor) {
		const scores = calculateJobScores(job, []);
		batch.push({
			updateOne: {
				filter: { _id: job._id },
				update: {
					$set: {
						scoreSalary: scores.salaryScore,
						scoreApplicant: scores.applicantScore,
						source: inferJobSource(job.applyLink),
						sourceVersion: SOURCE_MAP_VERSION,
						scoreVersion: JOB_SCORE_MODEL_VERSION,
					},
				},
			},
		});
		if (batch.length >= 200) await flush();
	}
	await flush();
	if (updated) console.log(`[job_market] backfilled scoreSalary/scoreApplicant on ${updated} job(s)`);
	return { updated };
}
