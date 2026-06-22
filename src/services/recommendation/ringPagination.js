import { ObjectId } from 'mongodb';
import { jobsCollection } from '../../db/mongo.js';
import { searchJobVectors } from '../vectorStore/qdrantClient.js';
import { JOB_LIST_PROJECTION } from '../jobListQuery.js';

function toObjectId(id) {
	try {
		return new ObjectId(id);
	} catch {
		return null;
	}
}

function hasMongoOnlyFilters(mongoQuery) {
	const raw = JSON.stringify(mongoQuery || {});
	return raw.includes('status') || raw.includes('title') || raw.includes('company');
}

async function hydrateHitsInOrder(hits, mongoQuery) {
	const idOrder = hits.map((h) => h.jobId).filter(Boolean);
	if (!idOrder.length) return [];

	const objectIds = idOrder.map(toObjectId).filter(Boolean);
	const scoreById = new Map(hits.map((h) => [h.jobId, h.score]));

	const jobs = await jobsCollection
		.find(
			{ $and: [mongoQuery || {}, { _id: { $in: objectIds } }] },
			{ projection: JOB_LIST_PROJECTION },
		)
		.toArray();

	const jobById = new Map(jobs.map((j) => [String(j._id), j]));
	const rows = [];
	for (const jobId of idOrder) {
		const job = jobById.get(jobId);
		if (!job) continue;
		const rawScore = scoreById.get(jobId) ?? 0;
		rows.push({
			job,
			vectorScore: Math.round(Math.max(0, Math.min(1, rawScore)) * 100),
			qdrantScore: rawScore,
		});
	}
	return rows;
}

/**
 * Fetch one page of vector-ranked jobs.
 * Uses Qdrant offset pagination + Mongo hydration on small ID batches.
 * Ring boundaries used when filters are Qdrant-compatible (source/postedAt only).
 */
export async function fetchVectorRankedPage({
	queryVector,
	skip,
	limit,
	mongoQuery,
	qdrantFilter,
}) {
	if (!queryVector?.length || limit <= 0 || !jobsCollection) {
		return [];
	}

	const needsMongoFilterScan = hasMongoOnlyFilters(mongoQuery);
	if (!needsMongoFilterScan) {
		const hits = await searchJobVectors(queryVector, {
			offset: skip,
			limit,
			filter: qdrantFilter,
		});
		return hydrateHitsInOrder(hits, mongoQuery || {});
	}

	const target = skip + limit;
	const maxScan = Math.max(target + Math.max(limit * 12, 400), target * 3);
	let qdrantOffset = 0;
	const collected = [];

	while (collected.length < target && qdrantOffset < maxScan) {
		const batchSize = Math.max(limit * 3, 50);
		const hits = await searchJobVectors(queryVector, {
			offset: qdrantOffset,
			limit: batchSize,
			filter: qdrantFilter,
		});
		if (!hits.length) break;

		collected.push(...await hydrateHitsInOrder(hits, mongoQuery || {}));

		qdrantOffset += hits.length;
		if (hits.length < batchSize) break;
	}

	return collected.slice(skip, target);
}
