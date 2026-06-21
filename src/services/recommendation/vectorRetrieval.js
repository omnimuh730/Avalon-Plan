import { userResumesCollection } from '../../db/mongo.js';
import { getJobVector, getResumeVector, isQdrantReady } from '../vectorStore/qdrantClient.js';
import { upsertJobEmbedding, upsertResumeEmbedding } from '../embeddings/embeddingIngest.js';
import { PROFILE_GRAPH_ID } from '../userKnowledgeGraph/index.js';

export function cosineSimilarity(a, b) {
	if (!a?.length || !b?.length || a.length !== b.length) return 0;

	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i += 1) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom > 0 ? dot / denom : 0;
}

async function loadAnalyzedResumeDocs(applierName) {
	if (!userResumesCollection) return [];
	const name = String(applierName || '').trim();
	if (!name) return [];

	return userResumesCollection
		.find({ ownerName: name, analyzed: true })
		.project({ _id: 1, techStack: 1, fileName: 1 })
		.toArray();
}

/**
 * Load concrete resume vectors for an applier (excludes aggregated profile vector).
 */
export async function loadResumeVectorEntries(applierName) {
	if (!isQdrantReady()) return [];

	const docs = await loadAnalyzedResumeDocs(applierName);
	const entries = [];

	for (const doc of docs) {
		const resumeId = String(doc._id);
		let vector = (await getResumeVector(resumeId))?.vector;

		if (!vector?.length) {
			const result = await upsertResumeEmbedding(resumeId, applierName, { applierName });
			if (result.ok) {
				vector = (await getResumeVector(resumeId))?.vector;
			}
		}

		if (!vector?.length) continue;

		entries.push({
			resumeId,
			techStack: String(doc.techStack || doc.fileName || 'Resume').trim() || 'Resume',
			vector,
		});
	}

	return entries;
}

/**
 * Rank profile resumes against one job vector (JD view).
 * Compares the stored job embedding to each resume embedding — O(resumes), not O(jobs).
 */
export async function rankResumesForJob(jobId, applierName) {
	if (!isQdrantReady()) return null;

	let jobVector = (await getJobVector(jobId))?.vector;
	if (!jobVector?.length) {
		const result = await upsertJobEmbedding(jobId, { applierName });
		if (result.ok) {
			jobVector = (await getJobVector(jobId))?.vector;
		}
	}
	if (!jobVector?.length) return null;

	const resumeEntries = await loadResumeVectorEntries(applierName);
	if (!resumeEntries.length) return null;

	let best = null;
	for (const resume of resumeEntries) {
		const score = cosineSimilarity(jobVector, resume.vector);
		if (!best || score > best.score) {
			best = {
				resumeId: resume.resumeId,
				techStack: resume.techStack,
				score,
			};
		}
	}

	return best;
}

export { PROFILE_GRAPH_ID };
