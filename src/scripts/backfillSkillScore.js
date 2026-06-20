import 'dotenv/config';
import { initMongo, closeMongo, jobsCollection } from '../db/mongo.js';
import { computeSkillScoreValue } from '../services/skillScoreService.js';

async function backfillSkillScores() {
	await initMongo();
	if (!jobsCollection) {
		console.error('Jobs collection is not available. Check Mongo configuration.');
		process.exit(1);
	}

	const cursor = jobsCollection.find({}, { projection: { _id: 1, skills: 1 } });

	let processed = 0;
	while (await cursor.hasNext()) {
		const job = await cursor.next();
		const score = await computeSkillScoreValue(job.skills || []);
		await jobsCollection.updateOne(
			{ _id: job._id },
			{
				$set: {
					skillScore: score,
					modelVersion: '1.12.8'
				}
			}
		);
		processed += 1;
		if (processed % 200 === 0) {
			console.log(`Updated ${processed} job documents with skillScore.`);
		}
	}

	console.log(`Backfill completed. Updated ${processed} job documents.`);
	await closeMongo();
}

backfillSkillScores().catch(err => {
	console.error('Backfill skillScore script failed', err);
	process.exit(1);
});
