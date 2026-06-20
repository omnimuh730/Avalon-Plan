import 'dotenv/config';
import { fileURLToPath } from 'url';
import { initMongo, closeMongo, jobsCollection, skillsCategoryCollection } from '../db/mongo.js';
import { computeSkillScoreValue, uniqueNormalizedSkills } from '../services/skillScoreService.js';

const normalizeSkillKey = (skill) => {
	if (!skill || typeof skill !== 'string') return '';
	return skill.trim().toLowerCase();
};

export async function recalculateSkillScores({ ensureMongo = true, closeMongoWhenDone = false } = {}) {
	if (ensureMongo && (!jobsCollection || !skillsCategoryCollection)) {
		await initMongo();
	}
	try {
		if (!jobsCollection || !skillsCategoryCollection) {
			throw new Error('Required collections are not available. Check Mongo configuration.');
		}

		const existingSkills = await skillsCategoryCollection.find({}, { projection: { name: 1 } }).toArray();
		const knownSkills = new Set(existingSkills.map(doc => normalizeSkillKey(doc.name)).filter(Boolean));

		const cursor = jobsCollection.find({}, { projection: { _id: 1, skills: 1, skillScore: 1 } });

		let processed = 0;
		let updatedScores = 0;
		let insertedSkills = 0;

		for await (const job of cursor) {
			const normalizedSkills = uniqueNormalizedSkills(job.skills || []);
			const missingSkills = normalizedSkills.filter(skill => {
				const key = normalizeSkillKey(skill);
				return key && !knownSkills.has(key);
			});

			if (missingSkills.length) {
				const timestamp = new Date().toISOString();
				const ops = missingSkills.map(skill => ({
					updateOne: {
						filter: { name: skill },
						update: { $setOnInsert: { name: skill, createdAt: timestamp } },
						upsert: true,
					}
				}));

				await skillsCategoryCollection.bulkWrite(ops, { ordered: false });
				missingSkills.forEach(skill => knownSkills.add(normalizeSkillKey(skill)));
				insertedSkills += missingSkills.length;
			}

			const score = await computeSkillScoreValue(job.skills || []);
			if (Number.isFinite(score) && job.skillScore !== score) {
				await jobsCollection.updateOne(
					{ _id: job._id },
					{
						$set: {
							skillScore: score,
							modelVersion: '1.12.8'
						}
					}
				);
				updatedScores += 1;
			}

			processed += 1;
			if (processed % 200 === 0) {
				console.log(`Processed ${processed} jobs (skillScore updates: ${updatedScores}, new skills recorded: ${insertedSkills}).`);
			}
		}

		console.log(`SkillScore recalculation finished. Jobs scanned: ${processed}. SkillScores updated: ${updatedScores}. New skills recorded: ${insertedSkills}.`);
		return { processed, updatedScores, insertedSkills };
	} finally {
		if (closeMongoWhenDone) {
			await closeMongo();
		}
	}
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	recalculateSkillScores({ ensureMongo: true, closeMongoWhenDone: true }).catch(err => {
		console.error('SkillScore recalculation script failed', err);
		process.exit(1);
	});
}
