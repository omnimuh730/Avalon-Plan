/** LLM provider + credentials for skill graph enrichment. */

import { accountInfoCollection } from '../../db/mongo.js';

const DEEPSEEK_MODELS = {
	keyword: process.env.SKILL_GRAPH_DEEPSEEK_KEYWORD_MODEL?.trim() || 'deepseek-v4-flash',
	enrich: process.env.SKILL_GRAPH_DEEPSEEK_ENRICH_MODEL?.trim() || 'deepseek-v4-flash',
	enrich_escalated: process.env.SKILL_GRAPH_DEEPSEEK_ENRICH_ESCALATED?.trim() || 'deepseek-v4-pro',
};

const OPENAI_MODELS = {
	keyword: process.env.SKILL_GRAPH_KEYWORD_MODEL?.trim() || 'gpt-4o-mini',
	enrich: process.env.SKILL_GRAPH_ENRICH_MODEL?.trim() || 'gpt-4o-mini',
	enrich_escalated: process.env.SKILL_GRAPH_ENRICH_MODEL_ESCALATED?.trim() || 'gpt-4o',
};

async function loadProfileKeys() {
	if (!accountInfoCollection) return { openaiApiKey: '', deepseekApiKey: '' };
	const acc = await accountInfoCollection.findOne(
		{},
		{ projection: { 'autoBidProfile.openaiApiKey': 1, 'autoBidProfile.deepseekApiKey': 1 } },
	);
	return {
		openaiApiKey: acc?.autoBidProfile?.openaiApiKey?.trim() || '',
		deepseekApiKey: acc?.autoBidProfile?.deepseekApiKey?.trim() || '',
	};
}

function envOpenAiKey() {
	return process.env.SKILL_GRAPH_OPENAI_API_KEY?.trim()
		|| process.env.OPENAI_API_KEY?.trim()
		|| '';
}

function envDeepseekKey() {
	return process.env.SKILL_GRAPH_DEEPSEEK_API_KEY?.trim()
		|| process.env.DEEPSEEK_API_KEY?.trim()
		|| '';
}

/**
 * Resolve LLM credentials. Priority: profile keys → env keys.
 * @param {'openai'|'deepseek'|'auto'} preferredProvider
 */
export async function resolveLlmConfig(preferredProvider = 'auto') {
	const profile = await loadProfileKeys();
	const openaiKey = profile.openaiApiKey || envOpenAiKey();
	const deepseekKey = profile.deepseekApiKey || envDeepseekKey();

	const pick = (provider) => {
		if (provider === 'deepseek' && deepseekKey) {
			return { provider: 'deepseek', apiKey: deepseekKey, models: DEEPSEEK_MODELS };
		}
		if (provider === 'openai' && openaiKey) {
			return { provider: 'openai', apiKey: openaiKey, models: OPENAI_MODELS };
		}
		return null;
	};

	if (preferredProvider === 'deepseek') return pick('deepseek') || pick('openai');
	if (preferredProvider === 'openai') return pick('openai') || pick('deepseek');

	// auto: prefer DeepSeek when configured, else OpenAI
	return pick('deepseek') || pick('openai');
}

export function getEnrichmentModel(purpose = 'keyword', llmConfig = null) {
	const models = llmConfig?.models || OPENAI_MODELS;
	return models[purpose] || models.enrich || 'gpt-4o-mini';
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

/** @deprecated use resolveLlmConfig */
export function getEnrichmentApiKey() {
	return envOpenAiKey() || envDeepseekKey();
}
