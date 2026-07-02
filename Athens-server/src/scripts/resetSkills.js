/**
 * Wipe all pre-built skill data so it can be rebuilt with AI. Jobs are kept —
 * only their skill fields are removed and re-queued for extraction. Also clears
 * the manual profile skills, materialized match scores, the global dictionary,
 * and the Redis skill index.
 *
 * Batched (never a single global $unset) so the collection stays responsive.
 *
 * Usage: node src/scripts/resetSkills.js
 */
import dotenv from 'dotenv';
dotenv.config();

import {
  initMongo,
  closeMongo,
  jobsCollection,
  userSkillsCollection,
  jobMatchScoresCollection,
  matchProfileStateCollection,
  skillDictionaryCollection,
} from '../db/mongo.js';
import { initRedis, closeRedis, isRedisReady, getRedis } from '../db/redis.js';

const BATCH = 5000;
const REDIS_PREFIXES = ['skill:', 'tok:', 'job:skills:', 'job:tokens:', 'job:skillcount:'];

async function batchUnsetJobSkills() {
  const cursor = jobsCollection.find({}, { projection: { _id: 1 } });
  let ops = [];
  let updated = 0;
  const flush = async () => {
    if (!ops.length) return;
    await jobsCollection.bulkWrite(ops, { ordered: false });
    updated += ops.length;
    ops = [];
    console.log(`  … ${updated} jobs reset`);
  };
  for await (const doc of cursor) {
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $unset: {
            skills: '',
            skillsNormalized: '',
            skillTokens: '',
            aiSkills: '',
            aiSkillsHash: '',
            aiSkillAttempts: '',
            aiSkillError: '',
            aiSkillExtractedAt: '',
          },
          $set: { aiSkillStatus: 'pending', matchScoreStatus: 'pending' },
        },
      },
    });
    if (ops.length >= BATCH) await flush();
  }
  await flush();
  return updated;
}

async function clearRedisSkillIndex() {
  if (!isRedisReady()) return 0;
  const redis = getRedis();
  let total = 0;
  for (const prefix of REDIS_PREFIXES) {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length) {
      await redis.del(keys);
      total += keys.length;
    }
  }
  return total;
}

async function main() {
  await initMongo();
  await initRedis();
  if (!jobsCollection) throw new Error('MongoDB not ready');

  console.log('[reset-skills] wiping job skill fields (batched)…');
  const jobsReset = await batchUnsetJobSkills();

  const [userSkills, matchScores, matchState, dict] = await Promise.all([
    userSkillsCollection?.deleteMany({}),
    jobMatchScoresCollection?.deleteMany({}),
    matchProfileStateCollection?.deleteMany({}),
    skillDictionaryCollection?.deleteMany({}),
  ]);
  const redisCleared = await clearRedisSkillIndex();

  console.log('[reset-skills] done:', {
    jobsReset,
    userSkillsDeleted: userSkills?.deletedCount ?? 0,
    matchScoresDeleted: matchScores?.deletedCount ?? 0,
    matchStateDeleted: matchState?.deletedCount ?? 0,
    dictionaryDeleted: dict?.deletedCount ?? 0,
    redisKeysCleared: redisCleared,
  });

  await closeRedis();
  await closeMongo?.();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
