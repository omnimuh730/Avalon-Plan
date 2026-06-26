/**
 * Backfill jobs.skillsNormalized and rebuild Redis skill inverted index.
 * Usage: node src/scripts/backfillJobSkills.js
 */
import dotenv from 'dotenv';
dotenv.config();

import { initMongo, jobsCollection, closeMongo } from '../db/mongo.js';
import { initRedis, closeRedis, isRedisReady } from '../db/redis.js';
import { indexJobInRedis, jobSkillTokens } from '../services/matching/skillIndex.js';
import { enrichJobSkillsFromTitle } from '../services/matching/jobSkillExtraction.js';

async function main() {
  await initMongo();
  await initRedis();

  if (!jobsCollection) throw new Error('MongoDB not ready');

  const cursor = jobsCollection.find({}, { projection: { title: 1, skills: 1, skillsNormalized: 1, skillTokens: 1 } });
  let updated = 0;
  let indexed = 0;

  for await (const doc of cursor) {
    const { skills, skillsNormalized } = enrichJobSkillsFromTitle(doc);
    const skillTokens = jobSkillTokens(skills);
    const prevSkills = JSON.stringify(doc.skills || []);
    const nextSkills = JSON.stringify(skills);
    const prev = JSON.stringify(doc.skillsNormalized || []);
    const next = JSON.stringify(skillsNormalized);
    const prevTokens = JSON.stringify(doc.skillTokens || []);
    const nextTokens = JSON.stringify(skillTokens);
    if (prevSkills !== nextSkills || prev !== next || prevTokens !== nextTokens) {
      await jobsCollection.updateOne(
        { _id: doc._id },
        { $set: { skills, skillsNormalized, skillTokens } },
      );
      updated += 1;
    }
    if (isRedisReady() && (skillsNormalized.length || skillTokens.length)) {
      await indexJobInRedis(String(doc._id), skillsNormalized, skillTokens);
      indexed += 1;
    }
  }

  console.log(`[backfill-job-skills] updated=${updated} redis-indexed=${indexed}`);
  await closeRedis();
  await closeMongo?.();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
