import { ObjectId } from 'mongodb';
import { jobsCollection } from '../../db/mongo.js';
import { isNeo4jReady } from '../../db/neo4j.js';
import { normalizeSkillKey, normalizeSurfaceForm } from '../skillGraph/normalize.js';
import { enrichSkillList } from '../skillEnrichment/processSkill.js';
import { recordCooccurrenceForJob } from '../skillCooccurrence/index.js';
import { computeSkillScoreValue, SKILL_SCORE_VERSION } from '../skillScoreService.js';
import { attachStaticScoreFields } from '../jobListPipeline.js';
import {
	resolveLlmConfig,
	isEnrichmentEnabled,
	getWorkerIntervalMs,
	getJobAnalysisBatchSize,
} from '../skillEnrichment/config.js';

const TERMINAL = new Set(['analyzed']);

export async function queueJobAnalysis(jobId, provider = 'auto') {
	if (!jobsCollection) throw new Error('Database not ready');

	let objectId;
	try {
		objectId = new ObjectId(jobId);
	} catch {
		throw new Error('Invalid job id');
	}

	const job = await jobsCollection.findOne({ _id: objectId });
	if (!job) throw new Error('Job not found');

	if (TERMINAL.has(job.skillAnalysis?.status)) {
		return { status: 'analyzed', alreadyAnalyzed: true, jobId: String(objectId) };
	}

	if (job.skillAnalysis?.status === 'queued' || job.skillAnalysis?.status === 'analyzing') {
		return { status: job.skillAnalysis.status, jobId: String(objectId) };
	}

	const now = new Date().toISOString();
	await jobsCollection.updateOne(
		{ _id: objectId },
		{
			$set: {
				skillAnalysis: {
					status: 'queued',
					queuedAt: now,
					provider: provider || 'auto',
					error: null,
				},
			},
		},
	);

	return { status: 'queued', jobId: String(objectId), queuedAt: now };
}

export async function getJobAnalysisStatus(jobId) {
	if (!jobsCollection) throw new Error('Database not ready');

	let objectId;
	try {
		objectId = new ObjectId(jobId);
	} catch {
		throw new Error('Invalid job id');
	}

	const job = await jobsCollection.findOne(
		{ _id: objectId },
		{ projection: { skillAnalysis: 1, skillScore: 1, skills: 1 } },
	);
	if (!job) throw new Error('Job not found');

	return {
		jobId: String(objectId),
		skillAnalysis: job.skillAnalysis || { status: 'pending' },
		skillScore: job.skillScore ?? 0,
		skills: job.skills || [],
	};
}

async function claimQueuedJobs(limit = 2) {
	if (!jobsCollection) return [];

	const now = new Date().toISOString();
	const queued = await jobsCollection
		.find({ 'skillAnalysis.status': 'queued' })
		.sort({ 'skillAnalysis.queuedAt': 1 })
		.limit(limit)
		.toArray();

	const claimed = [];
	for (const job of queued) {
		const r = await jobsCollection.findOneAndUpdate(
			{ _id: job._id, 'skillAnalysis.status': 'queued' },
			{ $set: { 'skillAnalysis.status': 'analyzing', 'skillAnalysis.startedAt': now } },
			{ returnDocument: 'after' },
		);
		if (r) claimed.push(r);
	}
	return claimed;
}

async function runJobAnalysis(job) {
	const skills = Array.isArray(job.skills) ? job.skills.map(s => String(s).trim()).filter(Boolean) : [];
	const provider = job.skillAnalysis?.provider || 'auto';
	const llmConfig = await resolveLlmConfig(provider);

	if (!isNeo4jReady()) {
		throw new Error('Neo4j is not connected');
	}

	if (!llmConfig?.apiKey && isEnrichmentEnabled()) {
		throw new Error('No LLM API key configured (OpenAI or DeepSeek in profile or env)');
	}

	if (skills.length) {
		await enrichSkillList(skills, llmConfig);
		await recordCooccurrenceForJob(skills);
	}

	const skillScore = await computeSkillScoreValue(skills);
	const staticScores = attachStaticScoreFields({ ...job, skills });
	const now = new Date().toISOString();

	await jobsCollection.updateOne(
		{ _id: job._id },
		{
			$set: {
				skillScore,
				skillScoreVersion: SKILL_SCORE_VERSION,
				...staticScores,
				skillAnalysis: {
					status: 'analyzed',
					provider: llmConfig?.provider || provider,
					queuedAt: job.skillAnalysis?.queuedAt || now,
					startedAt: job.skillAnalysis?.startedAt || now,
					analyzedAt: now,
					skillsProcessed: skills.length,
					error: null,
				},
			},
		},
	);

	return { skillScore, skillsProcessed: skills.length, provider: llmConfig?.provider };
}

async function markJobAnalysisFailed(jobId, error) {
	if (!jobsCollection) return;
	await jobsCollection.updateOne(
		{ _id: jobId },
		{
			$set: {
				'skillAnalysis.status': 'failed',
				'skillAnalysis.error': String(error?.message || error).slice(0, 500),
				'skillAnalysis.failedAt': new Date().toISOString(),
			},
		},
	);
}

export async function runJobAnalysisBatch(batchSize = 2) {
	if (!isEnrichmentEnabled() || !jobsCollection) return { processed: 0 };

	const batch = await claimQueuedJobs(batchSize);
	let processed = 0;

	for (const job of batch) {
		try {
			await runJobAnalysis(job);
			processed += 1;
			console.log(`[job-analysis] analyzed job ${job._id} (${job.title || 'untitled'})`);
		} catch (err) {
			console.error(`[job-analysis] failed job ${job._id}`, err.message);
			await markJobAnalysisFailed(job._id, err);
		}
	}

	return { processed };
}

let workerTimer = null;

export function startJobAnalysisWorker() {
	if (workerTimer) return;
	const intervalMs = getWorkerIntervalMs();
	const batchSize = getJobAnalysisBatchSize();

	const tick = async () => {
		try {
			await runJobAnalysisBatch(batchSize);
		} catch (err) {
			console.error('[job-analysis] worker tick error', err.message);
		}
	};

	workerTimer = setInterval(tick, intervalMs);
	void tick();
	console.log(`[job-analysis] worker started (interval ${intervalMs}ms, batch ${batchSize})`);
}

export function stopJobAnalysisWorker() {
	if (workerTimer) {
		clearInterval(workerTimer);
		workerTimer = null;
	}
}
