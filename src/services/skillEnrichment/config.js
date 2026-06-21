/** DeepSeek LLM config for skill graph enrichment — key from MongoDB account_info only. */

import { accountInfoCollection } from '../../db/mongo.js';

const DEEPSEEK_MODEL = 'deepseek-v4-flash';

const DEEPSEEK_MODELS = {
	keyword: DEEPSEEK_MODEL,
	enrich: DEEPSEEK_MODEL,
	enrich_escalated: DEEPSEEK_MODEL,
};

/**
 * Load deepseekApiKey from account_info.autoBidProfile (first account that has one).
 * @param {string} [applierName] optional account name filter
 */
export async function loadDeepseekApiKey(applierName) {
	if (!accountInfoCollection) return '';

	const filter = { 'autoBidProfile.deepseekApiKey': { $exists: true, $nin: ['', null] } };
	if (applierName?.trim()) {
		filter.name = applierName.trim();
	}

	const acc = await accountInfoCollection.findOne(filter, {
		projection: { 'autoBidProfile.deepseekApiKey': 1, name: 1 },
	});

	return acc?.autoBidProfile?.deepseekApiKey?.trim() || '';
}

/** Resolve DeepSeek credentials for skill graph LLM calls. */
export async function resolveLlmConfig(applierName) {
	const apiKey = await loadDeepseekApiKey(applierName);
	if (!apiKey) return null;

	return {
		provider: 'deepseek',
		apiKey,
		model: DEEPSEEK_MODEL,
		models: DEEPSEEK_MODELS,
	};
}

export function getEnrichmentModel(purpose = 'keyword', llmConfig = null) {
	return llmConfig?.models?.[purpose] || llmConfig?.model || DEEPSEEK_MODEL;
}

export function isEnrichmentEnabled() {
	return process.env.SKILL_GRAPH_ENRICHMENT_ENABLED !== 'false';
}

export function getWorkerIntervalMs() {
	return Number(process.env.SKILL_GRAPH_WORKER_INTERVAL_MS) || 5000;
}

export function getJobAnalysisBatchSize() {
	return Number(process.env.SKILL_GRAPH_JOB_ANALYSIS_BATCH_SIZE) || 2;
}
