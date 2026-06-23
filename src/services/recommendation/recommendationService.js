import {
	jobsCollection,
	userResumesCollection,
} from '../../db/mongo.js';
import { isQdrantReady } from '../vectorStore/qdrantClient.js';
import {
	upsertProfileEmbedding,
	getProfileVector,
} from '../embeddings/embeddingIngest.js';
import { applyScoreFilters, composeJobScores } from './scoreComposer.js';
import { buildQdrantFilterFromBody } from './qdrantFilter.js';
import { fetchVectorRankedPage } from './ringPagination.js';
import { JOB_LIST_PROJECTION } from '../jobListQuery.js';

const PROFILE_VECTOR_CACHE_TTL_MS = 3 * 60 * 1000;
const profileVectorCache = new Map();

function profileCacheKey(applierName) {
	return String(applierName || '').trim();
}

async function loadAnalyzedResumes(applierName) {
	if (!userResumesCollection) return [];
	const name = String(applierName || '').trim();
	if (!name) return [];

	return userResumesCollection
		.find({ ownerName: name, analyzed: true })
		.project({ _id: 1 })
		.toArray();
}

async function getCachedProfileVector(applierName) {
	const key = profileCacheKey(applierName);
	const cached = profileVectorCache.get(key);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.vector;
	}

	let vector = (await getProfileVector(applierName))?.vector;
	if (!vector?.length) {
		const result = await upsertProfileEmbedding(applierName, { applierName });
		if (result.ok) {
			vector = (await getProfileVector(applierName))?.vector;
		}
	}

	if (vector?.length) {
		profileVectorCache.set(key, {
			vector,
			expiresAt: Date.now() + PROFILE_VECTOR_CACHE_TTL_MS,
		});
	}

	return vector || null;
}

function composePageDocs(pageRows) {
	return pageRows.map((row) => ({
		...row.job,
		...composeJobScores(row.job, {
			vectorScore: row.vectorScore,
		}),
		recommendationRanked: true,
	}));
}

/**
 * Recommend and rank jobs for an applier using one aggregated profile vector.
 * Resume-level matching runs only when viewing a job (skill-radar endpoint).
 */
export async function recommendJobsForApplier({
	applierName,
	mongoQuery,
	scoreFilters,
	listBody,
	skip = 0,
	limit = 25,
}) {
	const name = String(applierName || '').trim();
	if (!name) {
		return { docs: [], total: 0, recommendationFallback: true, reason: 'no_applier' };
	}

	if (!isQdrantReady()) {
		return { docs: [], total: 0, recommendationFallback: true, reason: 'qdrant_not_ready' };
	}

	const resumes = await loadAnalyzedResumes(name);
	if (!resumes.length) {
		return { docs: [], total: 0, recommendationFallback: true, reason: 'no_analyzed_resumes' };
	}

	const profileVector = await getCachedProfileVector(name);
	if (!profileVector?.length) {
		return { docs: [], total: 0, recommendationFallback: true, reason: 'embedding_failed' };
	}

	const qdrantFilter = buildQdrantFilterFromBody(listBody || {});
	const hasScoreFilter = !!(scoreFilters && Object.keys(scoreFilters).length);

	const catalogTotal = mongoQuery && jobsCollection
		? await jobsCollection.countDocuments(mongoQuery)
		: 0;

	// Score filters mean "only jobs scoring in this band" → keep the ranked-only
	// behavior (un-scored jobs can't satisfy a score band). Page slice as before.
	if (hasScoreFilter) {
		const pageRows = await fetchVectorRankedPage({
			queryVector: profileVector,
			skip,
			limit,
			mongoQuery: mongoQuery || {},
			qdrantFilter,
		});
		const docs = applyScoreFilters(composePageDocs(pageRows), scoreFilters);
		return { docs, total: catalogTotal, catalogTotal, recommendationFallback: false };
	}

	// No score filter: rank what the vector scan surfaces, then BACKFILL the page
	// with remaining matching jobs newest-first — fulfilling the UI's promise that
	// "remaining jobs follow sorted by date" so nothing in the filter disappears
	// from Best match (e.g. a narrowly-filtered job that ranks low globally).
	const rankedRows = await fetchVectorRankedPage({
		queryVector: profileVector,
		skip: 0,
		limit: skip + limit,
		mongoQuery: mongoQuery || {},
		qdrantFilter,
	});
	const rankedDocs = composePageDocs(rankedRows);
	const pageRanked = rankedDocs.slice(skip, skip + limit);
	let docs = pageRanked;

	// Backfill only when the ranked set is exhausted for this page (otherwise the
	// page is already full of ranked jobs and later pages continue the ranking).
	if (pageRanked.length < limit && catalogTotal > skip + pageRanked.length) {
		const rankedIds = rankedDocs.map((d) => d._id);
		const needed = limit - pageRanked.length;
		const dateSkip = Math.max(0, skip - rankedDocs.length);
		const dateDocs = await jobsCollection
			.find(
				{ $and: [mongoQuery || {}, { _id: { $nin: rankedIds } }] },
				{ projection: JOB_LIST_PROJECTION },
			)
			.sort({ postedAt: -1, _id: -1 })
			.skip(dateSkip)
			.limit(needed)
			.toArray();
		docs = [
			...pageRanked,
			...dateDocs.map((j) => ({ ...j, ...composeJobScores(j, {}), recommendationRanked: false })),
		];
	}

	return { docs, total: catalogTotal, catalogTotal, recommendationFallback: false };
}

export function invalidateRecommendationCache(applierName) {
	profileVectorCache.delete(profileCacheKey(applierName));
}
