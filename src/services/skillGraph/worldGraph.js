import neo4j from 'neo4j-driver';
import { isNeo4jReady, runRead } from '../../db/neo4j.js';
import { RELATION_TYPES } from '../skillGraph/search.js';

const DEFAULT_NODE_LIMIT = 2000;
const DEFAULT_EDGE_LIMIT = 5000;

function intParam(n) {
	return neo4j.int(Math.max(0, Math.floor(Number(n) || 0)));
}

function num(v) {
	return typeof v?.toNumber === 'function' ? v.toNumber() : Number(v ?? 0);
}

/** Map Neo4j skillType/category to frontend SkillCategory slug. */
export function mapToSkillCategory(skillType, category) {
	const cat = String(category || '').toLowerCase();
	const type = String(skillType || '').toUpperCase();
	if (cat.includes('front')) return 'frontend';
	if (cat.includes('back')) return 'backend';
	if (cat.includes('cloud')) return 'cloud';
	if (cat.includes('database') || cat.includes('data store')) return 'database';
	if (cat.includes('devops') || cat.includes('infra')) return 'devops';
	if (cat.includes('mobile')) return 'mobile';
	if (cat.includes('data') && !cat.includes('database')) return 'data';
	if (type === 'SOFT_SKILL' || cat.includes('soft')) return 'concept';
	if (cat.includes('language') || type === 'TECHNOLOGY') {
		if (cat.includes('framework') || cat.includes('front')) return 'frontend';
		return 'language';
	}
	return 'concept';
}

/**
 * Fetch the shared world skill graph for the Knowledge Graph UI.
 */
export async function fetchWorldGraph({ nodeLimit = DEFAULT_NODE_LIMIT, edgeLimit = DEFAULT_EDGE_LIMIT } = {}) {
	if (!isNeo4jReady()) {
		throw new Error('Neo4j is not connected');
	}

	const nodeRecords = await runRead(
		`
		MATCH (s:Skill)
		RETURN s.id AS id, s.label AS label, s.category AS category, s.skillType AS skillType
		ORDER BY s.label
		LIMIT $limit
		`,
		{ limit: intParam(nodeLimit) },
	);

	const edgeRecords = await runRead(
		`
		MATCH (a:Skill)-[r]->(b:Skill)
		WHERE type(r) IN $relTypes
		RETURN a.id AS from, b.id AS to, type(r) AS type, coalesce(r.weight, 0.5) AS weight
		LIMIT $limit
		`,
		{ relTypes: RELATION_TYPES, limit: intParam(edgeLimit) },
	);

	const nodes = nodeRecords.map(r => {
		const skillType = r.get('skillType');
		const category = r.get('category');
		return {
			id: r.get('id'),
			label: r.get('label'),
			category: mapToSkillCategory(skillType, category),
			skillType,
			rawCategory: category,
		};
	});

	const nodeIds = new Set(nodes.map(n => n.id));
	const edges = edgeRecords
		.map(r => ({
			from: r.get('from'),
			to: r.get('to'),
			type: r.get('type'),
			weight: num(r.get('weight')),
		}))
		.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));

	const countRecords = await runRead('MATCH (s:Skill) RETURN count(s) AS total');
	const totalNodes = num(countRecords[0]?.get('total'));

	return {
		nodes,
		edges,
		totalNodes,
		truncated: totalNodes > nodes.length,
	};
}
