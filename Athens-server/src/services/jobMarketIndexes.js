import { inferJobSource, SOURCE_MAP_VERSION } from '../config/jobSources.js';

export async function ensureJobMarketIndexes(jobsCollection) {
	if (!jobsCollection) return;
	await Promise.all([
		jobsCollection.createIndex({ postedAt: -1 }),
		jobsCollection.createIndex({ url: 1 }),
		jobsCollection.createIndex({ 'status.applier': 1 }),
		jobsCollection.createIndex({ source: 1, postedAt: -1 }),
	]);
}

/** Backfill denormalized `source` for older jobs missing it. */
export async function backfillMissingJobSourceFields(jobsCollection) {
	if (!jobsCollection) return { updated: 0 };
	const cursor = jobsCollection.find(
		{
			$or: [{ source: { $exists: false } }, { sourceVersion: { $ne: SOURCE_MAP_VERSION } }],
		},
		{ projection: { applyLink: 1 } },
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
		batch.push({
			updateOne: {
				filter: { _id: job._id },
				update: {
					$set: {
						source: inferJobSource(job.applyLink),
						sourceVersion: SOURCE_MAP_VERSION,
					},
				},
			},
		});
		if (batch.length >= 200) await flush();
	}
	await flush();
	if (updated) console.log(`[job_market] backfilled source on ${updated} job(s)`);
	return { updated };
}

/**
 * Remove duplicate jobs sharing the same `applyLink`, keeping only the latest
 * one per link (by postedAt, then _createdAt, then _id). Jobs without a
 * non-empty string `applyLink` are left untouched.
 */
export async function dedupeJobMarketByApplyLink(jobsCollection) {
	if (!jobsCollection) return { removed: 0 };

	const groups = await jobsCollection
		.aggregate(
			[
				{ $match: { applyLink: { $type: 'string', $ne: '' } } },
				// latest first, so $first below is the one we keep
				{ $sort: { postedAt: -1, _createdAt: -1, _id: -1 } },
				{
					$group: {
						_id: '$applyLink',
						keepId: { $first: '$_id' },
						ids: { $push: '$_id' },
					},
				},
				// only groups with more than one document
				{ $match: { 'ids.1': { $exists: true } } },
			],
			{ allowDiskUse: true },
		)
		.toArray();

	const idsToRemove = [];
	for (const g of groups) {
		for (const id of g.ids) {
			if (!id.equals(g.keepId)) idsToRemove.push(id);
		}
	}

	if (!idsToRemove.length) return { removed: 0 };

	const result = await jobsCollection.deleteMany({ _id: { $in: idsToRemove } });
	console.log(`[job_market] removed ${result.deletedCount} duplicate applyLink job(s)`);
	return { removed: result.deletedCount };
}
