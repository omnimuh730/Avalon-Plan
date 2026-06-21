import { isNeo4jReady } from '../../db/neo4j.js';
import { normalizeSkillKey, stringSimilarity } from '../skillGraph/normalize.js';
import { findExactMatch, searchCandidates } from '../skillGraph/search.js';
import { applyEnrichmentResult, linkAlias } from '../skillGraph/apply.js';
import { suggestSearchKeywords } from './keywordSuggest.js';
import { enrichAgainstCandidates } from './enrich.js';
import { isEnrichmentEnabled, getEnrichmentModel } from './config.js';

const AUTO_ALIAS_THRESHOLD = 0.95;
const SKIP_KEYWORD_THRESHOLD = 0.95;

/**
 * Process one raw skill through normalize → search → enrich → apply.
 * @param {object} item - { surfaceForm, normalizedKey, cooccurringSkills? }
 * @param {object|null} llmConfig - from resolveLlmConfig()
 */
export async function processEnrichmentItem(item, llmConfig = null) {
	const { surfaceForm, normalizedKey, cooccurringSkills = [] } = item;

	const exact = await findExactMatch(normalizedKey);
	if (exact) {
		await linkAlias({
			surfaceForm,
			normalizedKey,
			skillId: exact.id,
			confidence: 1,
			source: 'exact',
		});
		return { skillId: exact.id, path: 'exact' };
	}

	let candidates = await searchCandidates({
		rawSkill: surfaceForm,
		normalizedKey,
		searchKeywords: [],
		limit: 10,
	});

	if (candidates.length === 1 && candidates[0].score >= AUTO_ALIAS_THRESHOLD
		&& stringSimilarity(surfaceForm, candidates[0].label) >= AUTO_ALIAS_THRESHOLD) {
		await linkAlias({
			surfaceForm,
			normalizedKey,
			skillId: candidates[0].id,
			confidence: candidates[0].score,
			source: 'fuzzy_auto',
		});
		return { skillId: candidates[0].id, path: 'fuzzy_auto' };
	}

	const topScore = candidates[0]?.score ?? 0;

	if (topScore < SKIP_KEYWORD_THRESHOLD && isEnrichmentEnabled() && llmConfig?.apiKey) {
		const { searchKeywords } = await suggestSearchKeywords(surfaceForm, llmConfig);
		if (searchKeywords.length) {
			candidates = await searchCandidates({
				rawSkill: surfaceForm,
				normalizedKey,
				searchKeywords,
				limit: 10,
			});
		}
	}

	const { result } = await enrichAgainstCandidates({
		rawSkill: surfaceForm,
		normalizedKey,
		candidates,
		cooccurringSkills,
		llmConfig,
	});

	const applied = await applyEnrichmentResult({
		surfaceForm,
		normalizedKey,
		result,
		modelVersion: getEnrichmentModel('enrich', llmConfig),
	});

	return { ...applied, path: 'enriched' };
}

export async function enrichSkillList(rawSkills = [], llmConfig = null) {
	if (!isNeo4jReady()) {
		throw new Error('Neo4j is not connected');
	}

	const skills = [...new Set(rawSkills.map(String).map(s => s.trim()).filter(Boolean))];
	const seen = new Set();
	const results = [];

	for (const surfaceForm of skills) {
		const normalizedKey = normalizeSkillKey(surfaceForm);
		if (!normalizedKey || seen.has(normalizedKey)) continue;
		seen.add(normalizedKey);

		const applied = await processEnrichmentItem({
			surfaceForm,
			normalizedKey,
			cooccurringSkills: skills,
		}, llmConfig);
		results.push({ surfaceForm, normalizedKey, ...applied });
	}

	return results;
}
