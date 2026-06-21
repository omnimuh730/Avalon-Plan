import { resolveSkillToCanonical } from '../skillGraph/resolve.js';
import { normalizeSkillKey, normalizeSurfaceForm } from '../skillGraph/normalize.js';
import { userKnowledgeGraphsCollection } from '../../db/mongo.js';
import { enqueueSkills } from '../skillEnrichment/queue.js';

/**
 * Build or update a per-resume user knowledge graph.
 * Skills reference world graph canonicalIds; missing skills are enqueued (not LLM-enriched).
 */
export async function buildUserGraphFromResume({
	applierName,
	resumeId,
	resumeName,
	skills = [],
}) {
	if (!userKnowledgeGraphsCollection) throw new Error('Database not ready');

	const name = String(applierName || '').trim();
	const rId = String(resumeId || 'default').trim();
	if (!name) throw new Error('applierName is required');

	const rawSkills = [...new Set(skills.map(String).map(s => s.trim()).filter(Boolean))].slice(0, 200);
	const cooc = rawSkills;

	await enqueueSkills(rawSkills, cooc);

	const resolvedSkills = [];
	for (const raw of rawSkills) {
		const surfaceForm = normalizeSurfaceForm(raw);
		const normalizedKey = normalizeSkillKey(surfaceForm);
		if (!normalizedKey) continue;

		const resolved = await resolveSkillToCanonical(surfaceForm, {
			enqueueIfMissing: true,
			cooccurringSkills: cooc,
		});

		resolvedSkills.push({
			surfaceForm: resolved.raw || surfaceForm,
			normalizedKey: resolved.normalizedKey || normalizedKey,
			canonicalId: resolved.canonicalId || null,
			proficiency: 0.85,
			sources: ['resume'],
		});
	}

	const edges = [];
	const edgeCap = Math.min(resolvedSkills.length, 40);
	for (let i = 0; i < edgeCap; i++) {
		for (let j = i + 1; j < edgeCap; j++) {
			const a = resolvedSkills[i].canonicalId;
			const b = resolvedSkills[j].canonicalId;
			if (a && b && a !== b) {
				edges.push({ fromId: a, toId: b, type: 'USED_WITH', weight: 0.3 });
			}
		}
	}

	const now = new Date().toISOString();
	const doc = {
		applierName: name,
		resumeId: rId,
		resumeName: resumeName?.trim() || rId,
		skills: resolvedSkills,
		edges,
		updatedAt: now,
	};

	await userKnowledgeGraphsCollection.updateOne(
		{ applierName: name, resumeId: rId },
		{ $set: doc, $setOnInsert: { createdAt: now } },
		{ upsert: true },
	);

	return doc;
}

/** List user graphs for an applier. */
export async function listUserGraphs(applierName) {
	if (!userKnowledgeGraphsCollection) return [];
	const name = String(applierName || '').trim();
	if (!name) return [];

	return userKnowledgeGraphsCollection
		.find({ applierName: name })
		.sort({ updatedAt: -1 })
		.toArray();
}

/** Build a default user graph from personal_info skills (interim bridge). */
export async function ensureDefaultUserGraphFromPersonal(applierName, personalSkills = []) {
	const skills = personalSkills.filter(Boolean);
	if (!skills.length) return null;

	return buildUserGraphFromResume({
		applierName,
		resumeId: 'personal-default',
		resumeName: 'Personal skills',
		skills,
	});
}

/** Seed canonicalIds for activation — from selected resume graphs. */
export function extractSeedCanonicalIds(graphs = []) {
	const ids = new Set();
	for (const g of graphs) {
		for (const s of g.skills || []) {
			if (s.canonicalId) ids.add(s.canonicalId);
		}
	}
	return [...ids];
}
