import {
	jobsCollection,
	skillsCategoryCollection,
	personalInfoCollection
} from "../db/mongo.js";

const normalizeSkill = (skill) => {
	if (!skill || typeof skill !== 'string') return '';
	return skill.trim();
};

const toComparable = (value) => normalizeSkill(value).toLowerCase();

const uniqueNormalizedSkills = (skills = []) => {
	const seen = new Set();
	const result = [];
	for (const skill of skills) {
		const normalized = normalizeSkill(skill);
		if (!normalized) continue;
		const key = toComparable(normalized);
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(normalized);
	}
	return result;
};

const clampPercentage = (value) => {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, Math.round(value)));
};

let cachedPersonalSkillSet = null;
let cachedSkillSetLoadedAt = 0;
const SKILL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getPersonalSkillSet(forceReload = false) {
	if (!personalInfoCollection) return new Set();
	const isCacheStale = Date.now() - cachedSkillSetLoadedAt > SKILL_CACHE_TTL_MS;
	if (!cachedPersonalSkillSet || forceReload || isCacheStale) {
		const docs = await personalInfoCollection.find({}, { projection: { name: 1 } }).toArray();
		cachedPersonalSkillSet = new Set(docs.map(doc => toComparable(doc.name)).filter(Boolean));
		cachedSkillSetLoadedAt = Date.now();
	}
	return cachedPersonalSkillSet;
}

/** Drop the cached personal skill set (call after the skills list is mutated). */
export function invalidatePersonalSkillCache() {
	cachedPersonalSkillSet = null;
	cachedSkillSetLoadedAt = 0;
}

/** Current personal skills as a lowercased, deduplicated array. */
export async function getPersonalSkillList() {
	const set = await getPersonalSkillSet();
	return [...set];
}

function scoreAgainstSkillSet(skills, personalSkillSet) {
	const normalizedSkills = uniqueNormalizedSkills(skills);
	if (!normalizedSkills.length) return 0;
	if (!personalSkillSet || personalSkillSet.size === 0) return 0;
	const matchedCount = normalizedSkills.filter(skill => personalSkillSet.has(toComparable(skill))).length;
	return clampPercentage((matchedCount / normalizedSkills.length) * 100);
}

export async function computeSkillScoreValue(skills = []) {
	if (!Array.isArray(skills) || !skills.length) {
		return 0;
	}
	const personalSkillSet = await getPersonalSkillSet();
	return scoreAgainstSkillSet(skills, personalSkillSet);
}

export async function getMissingSkills(skills = []) {
	if (!skillsCategoryCollection || !Array.isArray(skills) || !skills.length) {
		return [];
	}
	const normalizedSkills = uniqueNormalizedSkills(skills);
	if (!normalizedSkills.length) return [];

	const existingNames = await skillsCategoryCollection.distinct('name', { name: { $in: normalizedSkills } });
	const existingSet = new Set(existingNames.map(toComparable));
	return normalizedSkills.filter(skill => !existingSet.has(toComparable(skill)));
}

export async function refreshSkillScoresForSkills(skills = []) {
	if (!jobsCollection || !skills.length) return;
	const normalizedTargets = uniqueNormalizedSkills(skills);
	if (!normalizedTargets.length) return;

	const personalSkillSet = await getPersonalSkillSet(true);
	const cursor = jobsCollection.find({ skills: { $in: normalizedTargets } }, { projection: { _id: 1, skills: 1 } });

	let batch = [];
	const flush = async () => {
		if (!batch.length) return;
		await jobsCollection.bulkWrite(batch, { ordered: false });
		batch = [];
	};

	for await (const job of cursor) {
		const score = scoreAgainstSkillSet(job.skills || [], personalSkillSet);
		batch.push({
			updateOne: {
				filter: { _id: job._id },
				update: { $set: { skillScore: score } },
			},
		});
		if (batch.length >= 200) await flush();
	}
	await flush();
}

export { uniqueNormalizedSkills };
