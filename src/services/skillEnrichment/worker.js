/**
 * Legacy skill queue worker — job analysis is the primary entry point.
 * Manual batch processing of skill_enrichment_queue (optional).
 */
import { isNeo4jReady } from '../../db/neo4j.js';
import { normalizeSkillKey } from '../skillGraph/normalize.js';
import { claimNextBatch, markDone, markFailed } from './queue.js';
import { processEnrichmentItem } from './processSkill.js';
import { resolveLlmConfig, isEnrichmentEnabled } from './config.js';
import { syncCooccurrenceToGraph } from '../skillCooccurrence/index.js';

export async function runEnrichmentBatch(batchSize = 3, provider = 'auto') {
	if (!isNeo4jReady() || !isEnrichmentEnabled()) return { processed: 0 };

	const llmConfig = await resolveLlmConfig(provider);
	const batch = await claimNextBatch(batchSize);
	let processed = 0;

	for (const item of batch) {
		try {
			await processEnrichmentItem(item, llmConfig);
			await markDone(item.normalizedKey);
			await syncCooccurrenceToGraph(20);
			processed += 1;
		} catch (err) {
			console.error('[skill-enrichment] failed', item.normalizedKey, err.message);
			await markFailed(item.normalizedKey, err);
		}
	}

	return { processed };
}

/** @deprecated Jobs are analyzed via POST /api/jobs/:id/analyze — no auto ingest on create. */
export async function ingestJobSkills() {
	// no-op: skill graph grows only when user triggers job analysis
}

export { enrichSkillList, processEnrichmentItem } from './processSkill.js';
