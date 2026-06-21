import { getVectorTopK } from '../vectorStore/collections.js';
import { getResumeVector, searchJobVectors } from '../vectorStore/qdrantClient.js';
import { PROFILE_GRAPH_ID } from '../userKnowledgeGraph/index.js';

function isProfileResume(resumeId) {
	return resumeId === PROFILE_GRAPH_ID;
}

function upsertJobMeta(merged, jobId, vectorScore, resume) {
	const prev = merged.get(jobId);
	const isConcrete = !isProfileResume(resume.resumeId);

	if (!prev || vectorScore > prev.vectorScore) {
		const next = {
			vectorScore,
			bestResumeId: resume.resumeId,
			bestResumeTechStack: resume.techStack || '',
			bestConcreteResumeId: prev?.bestConcreteResumeId ?? null,
			bestConcreteTechStack: prev?.bestConcreteTechStack ?? '',
		};
		if (isConcrete) {
			if (!prev?.bestConcreteResumeId || vectorScore > (prev.bestConcreteVectorScore ?? 0)) {
				next.bestConcreteResumeId = resume.resumeId;
				next.bestConcreteTechStack = resume.techStack || '';
				next.bestConcreteVectorScore = vectorScore;
			} else {
				next.bestConcreteResumeId = prev.bestConcreteResumeId;
				next.bestConcreteTechStack = prev.bestConcreteTechStack;
				next.bestConcreteVectorScore = prev.bestConcreteVectorScore;
			}
		} else if (prev?.bestConcreteResumeId) {
			next.bestConcreteResumeId = prev.bestConcreteResumeId;
			next.bestConcreteTechStack = prev.bestConcreteTechStack;
			next.bestConcreteVectorScore = prev.bestConcreteVectorScore;
		}
		merged.set(jobId, next);
		return;
	}

	if (isConcrete && vectorScore > (prev.bestConcreteVectorScore ?? 0)) {
		merged.set(jobId, {
			...prev,
			bestConcreteResumeId: resume.resumeId,
			bestConcreteTechStack: resume.techStack || '',
			bestConcreteVectorScore: vectorScore,
		});
	}
}

/**
 * Multi-vector retrieval: search jobs for each resume vector, merge with MAX (no averaging).
 * @param {Array<{ resumeId: string, techStack?: string, vector?: number[] }>} resumeVectors
 * @param {object} [searchOpts] — passed to searchJobVectors (limit, offset, filter)
 * @returns {Map<string, { vectorScore: number, bestResumeId: string, bestResumeTechStack: string, bestConcreteResumeId: string|null, bestConcreteTechStack: string }>}
 */
export async function retrieveJobCandidates(resumeVectors = [], searchOpts = {}) {
	const topK = searchOpts.limit ?? getVectorTopK();
	const merged = new Map();

	for (const resume of resumeVectors) {
		let vector = resume.vector;
		if (!vector?.length) {
			const stored = await getResumeVector(resume.resumeId);
			vector = stored?.vector;
		}
		if (!vector?.length) continue;

		const hits = await searchJobVectors(vector, { ...searchOpts, limit: topK });
		for (const hit of hits) {
			const jobId = hit.jobId;
			if (!jobId) continue;
			const vectorScore = Math.round(Math.max(0, Math.min(1, hit.score ?? 0)) * 100);
			upsertJobMeta(merged, jobId, vectorScore, resume);
		}
	}

	return merged;
}

/**
 * Attach per-job best resume metadata using multi-vector retrieval.
 */
export async function attachPerJobResumeMetadata(pageRows, resumeVectors) {
	if (!pageRows.length || !resumeVectors.length) return pageRows;

	const merged = await retrieveJobCandidates(resumeVectors, {
		limit: Math.max(getVectorTopK(), 500),
	});

	return pageRows.map((row) => {
		const jobId = String(row.job._id);
		const meta = merged.get(jobId);
		if (!meta) return row;

		return {
			...row,
			vectorScore: Math.max(row.vectorScore ?? 0, meta.vectorScore),
			bestResumeId: meta.bestResumeId,
			bestResumeTechStack: meta.bestResumeTechStack,
			bestConcreteResumeId: meta.bestConcreteResumeId,
			bestConcreteTechStack: meta.bestConcreteTechStack,
		};
	});
}

/**
 * Attach bestResume metadata from primary query vector row (fallback when multi-vector scan skipped).
 */
export function mergeMultiVectorScores(pageRows, resumeVectors) {
	const primary = resumeVectors[0];
	return pageRows.map((row) => ({
		...row,
		bestResumeId: primary?.resumeId || null,
		bestResumeTechStack: primary?.techStack || '',
	}));
}

export { PROFILE_GRAPH_ID };
