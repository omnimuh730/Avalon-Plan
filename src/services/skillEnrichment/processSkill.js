import { isNeo4jReady, runRead } from '../../db/neo4j.js';
import { normalizeSkillKey, stringSimilarity } from '../skillGraph/normalize.js';
import { findExactMatch, searchCandidates } from '../skillGraph/search.js';
import { applyEnrichmentResult, linkAlias } from '../skillGraph/apply.js';
import { suggestSearchKeywords } from './keywordSuggest.js';
import { enrichAgainstCandidates } from './enrich.js';
import { isEnrichmentEnabled, getEnrichmentModel } from './config.js';
import { traceSkill } from './trace.js';
import { addUsage, EMPTY_USAGE } from '../llm/llmService.js';

const AUTO_ALIAS_THRESHOLD = 0.95;
const SKIP_KEYWORD_THRESHOLD = 0.95;

/**
 * Process one raw skill through normalize → search → enrich → apply.
 * Only the skills[] surface form is analyzed — job description is never sent to the LLM.
 */
export async function processEnrichmentItem(item, llmConfig = null, ctx = {}) {
	const { surfaceForm, normalizedKey, cooccurringSkills = [] } = item;
	let usage = EMPTY_USAGE();

	traceSkill('start', {
		jobId: ctx.jobId,
		surfaceForm,
		normalizedKey,
		cooccurringSkills,
	});

	const exact = await findExactMatch(normalizedKey);
	if (exact) {
		traceSkill('exact_match', { normalizedKey, skillId: exact.id, label: exact.label });
		await linkAlias({
			surfaceForm,
			normalizedKey,
			skillId: exact.id,
			confidence: 1,
			source: 'exact',
		});
		return { skillId: exact.id, path: 'exact', action: 'alias', relationshipCount: 0, usage };
	}

	let candidates = await searchCandidates({
		rawSkill: surfaceForm,
		normalizedKey,
		searchKeywords: [],
		limit: 10,
	});

	traceSkill('search_candidates', {
		normalizedKey,
		candidateCount: candidates.length,
		top: candidates.slice(0, 3).map(c => ({ id: c.id, label: c.label, score: c.score, matchType: c.matchType })),
	});

	if (candidates.length === 1 && candidates[0].score >= AUTO_ALIAS_THRESHOLD
		&& stringSimilarity(surfaceForm, candidates[0].label) >= AUTO_ALIAS_THRESHOLD) {
		traceSkill('fuzzy_auto_alias', { normalizedKey, skillId: candidates[0].id, score: candidates[0].score });
		await linkAlias({
			surfaceForm,
			normalizedKey,
			skillId: candidates[0].id,
			confidence: candidates[0].score,
			source: 'fuzzy_auto',
		});
		return { skillId: candidates[0].id, path: 'fuzzy_auto', action: 'alias', relationshipCount: 0, usage };
	}

	const topScore = candidates[0]?.score ?? 0;

	if (topScore < SKIP_KEYWORD_THRESHOLD && isEnrichmentEnabled() && llmConfig?.apiKey) {
		const { searchKeywords, usage: kwUsage } = await suggestSearchKeywords(surfaceForm, llmConfig);
		usage = addUsage(usage, kwUsage);
		traceSkill('keyword_suggest', { normalizedKey, searchKeywords, llmUsage: kwUsage });
		if (searchKeywords.length) {
			candidates = await searchCandidates({
				rawSkill: surfaceForm,
				normalizedKey,
				searchKeywords,
				limit: 10,
			});
			traceSkill('search_after_keywords', {
				normalizedKey,
				candidateCount: candidates.length,
				top: candidates.slice(0, 3).map(c => ({ id: c.id, label: c.label, score: c.score })),
			});
		}
	}

	const { result, usage: enrichUsage } = await enrichAgainstCandidates({
		rawSkill: surfaceForm,
		normalizedKey,
		candidates,
		cooccurringSkills,
		llmConfig,
	});
	usage = addUsage(usage, enrichUsage);

	traceSkill('llm_decision', {
		normalizedKey,
		action: result.action,
		targetId: result.targetId,
		confidence: result.confidence,
		skillType: result.skillType,
		category: result.category,
		newNodeLabel: result.newNode?.label,
		relationships: result.relationships,
		llmUsage: usage,
	});

	const applied = await applyEnrichmentResult({
		surfaceForm,
		normalizedKey,
		result,
		modelVersion: getEnrichmentModel('enrich', llmConfig),
	});

	traceSkill('applied', {
		normalizedKey,
		surfaceForm,
		...applied,
		path: 'enriched',
		usage,
	});

	return { ...applied, path: 'enriched', usage };
}

/** Enrich every distinct entry in job.skills[] (not job.description). */
export async function enrichSkillList(rawSkills = [], llmConfig = null, ctx = {}) {
	if (!isNeo4jReady()) {
		throw new Error('Neo4j is not connected');
	}

	const skills = [...new Set(rawSkills.map(String).map(s => s.trim()).filter(Boolean))];
	const seen = new Set();
	const results = [];
	let usage = EMPTY_USAGE();

	traceSkill('batch_start', {
		jobId: ctx.jobId,
		inputSkills: skills,
		count: skills.length,
		note: 'Only skills[] is enriched; job description is excluded',
	});

	for (const surfaceForm of skills) {
		const normalizedKey = normalizeSkillKey(surfaceForm);
		if (!normalizedKey || seen.has(normalizedKey)) {
			traceSkill('skip_duplicate', { surfaceForm, normalizedKey });
			continue;
		}
		seen.add(normalizedKey);

		const applied = await processEnrichmentItem({
			surfaceForm,
			normalizedKey,
			cooccurringSkills: skills,
		}, llmConfig, ctx);
		usage = addUsage(usage, applied.usage);
		const { usage: _u, ...rest } = applied;
		results.push({ surfaceForm, normalizedKey, ...rest });
	}

	return { results, usage };
}

/** Count nodes/relationships in Neo4j for post-job verification logs. */
export async function getGraphCounts() {
	if (!isNeo4jReady()) return null;
	const [skills, aliases, rels] = await Promise.all([
		runRead('MATCH (s:Skill) RETURN count(s) AS n'),
		runRead('MATCH (a:RawAlias) RETURN count(a) AS n'),
		runRead('MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS n ORDER BY type'),
	]);
	const num = (v) => (typeof v?.toNumber === 'function' ? v.toNumber() : Number(v ?? 0));
	return {
		skillNodes: num(skills[0]?.get('n')),
		rawAliasNodes: num(aliases[0]?.get('n')),
		relationships: rels.map(r => ({ type: r.get('type'), count: num(r.get('n')) })),
	};
}
