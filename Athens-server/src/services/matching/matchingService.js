import { ObjectId } from 'mongodb';
import { jobsCollection } from '../../db/mongo.js';
import { isRedisReady } from '../../db/redis.js';
import { getHybridMatchWeights, getCandidatePoolSize } from '../../config/graphAndVectorConfig.js';
import { JOB_LIST_PROJECTION } from '../jobListQuery.js';
import { loadProfileSkillSet, invalidateProfileSkillCache } from './profileSkills.js';
import {
  findCandidateJobIds,
  normalizeJobSkills,
} from './skillIndex.js';
import { enrichJobSkillsFromTitle } from './jobSkillExtraction.js';
import {
  computeCoverageScore,
  composeJobScores,
  applyScoreFilters,
  computeHybridScore,
} from './coverageScore.js';
import { normalizeSkillSet } from '@nextoffer/shared/skill-normalize';
import { getProfileVector, isQdrantReady, searchJobVectors } from '../vectorStore/qdrantClient.js';
import { cosineToScore } from '../embeddings/embeddingService.js';

const MAX_CANDIDATES = 50000;

function jobSkillsForScoring(job) {
  return enrichJobSkillsFromTitle(job).skillsNormalized;
}

function vectorScoreFromHit(hit) {
  const raw = Number(hit?.score ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return cosineToScore(raw);
}

async function loadVectorScoreMap(applierName) {
  if (!isQdrantReady()) return new Map();

  const profile = await getProfileVector(applierName);
  if (!profile?.vector?.length) return new Map();

  const hits = await searchJobVectors(profile.vector, {
    limit: getCandidatePoolSize(),
  });

  const map = new Map();
  for (const hit of hits) {
    if (hit?.jobId) map.set(String(hit.jobId), vectorScoreFromHit(hit));
  }
  return map;
}

/**
 * Score and rank jobs for an applier: skill containment + optional profile vector similarity.
 */
export async function matchJobsForApplier({
  applierName,
  mongoQuery,
  scoreFilters,
  skip = 0,
  limit = 25,
}) {
  const name = String(applierName || '').trim();
  if (!name) {
    return { docs: [], total: 0, recommendationFallback: true, reason: 'no_applier' };
  }

  const profileSkills = await loadProfileSkillSet(name);
  if (!profileSkills.size) {
    return { docs: [], total: 0, recommendationFallback: true, reason: 'no_analyzed_resumes' };
  }

  if (!jobsCollection) {
    return { docs: [], total: 0, recommendationFallback: true, reason: 'db_not_ready' };
  }

  const hybridWeights = getHybridMatchWeights();
  const vectorScores = await loadVectorScoreMap(name);
  const useHybrid = vectorScores.size > 0;

  const catalogTotal = await jobsCollection.countDocuments(mongoQuery || {});
  const hasScoreFilter = !!(scoreFilters && Object.keys(scoreFilters).length);

  let scoredRows = [];
  const candidateIds = new Set();

  if (isRedisReady()) {
    const redisIds = await findCandidateJobIds(profileSkills);
    if (redisIds?.size) {
      for (const id of redisIds) candidateIds.add(String(id));
    }
  }

  if (useHybrid) {
    for (const id of vectorScores.keys()) candidateIds.add(id);
  }

  if (candidateIds.size) {
    const idList = [...candidateIds].slice(0, MAX_CANDIDATES);
    const objectIds = idList.map((id) => {
      try { return new ObjectId(id); } catch { return null; }
    }).filter(Boolean);

    const jobs = await jobsCollection
      .find({ $and: [mongoQuery || {}, { _id: { $in: objectIds } }] })
      .project(JOB_LIST_PROJECTION)
      .toArray();

    for (const job of jobs) {
      const jobSkills = jobSkillsForScoring(job);
      const coverage = computeCoverageScore(jobSkills, profileSkills);
      if (coverage.required === 0) continue;

      const skillScore = coverage.matchScore;
      const vectorScore = vectorScores.get(String(job._id)) ?? 0;
      const finalScore = useHybrid
        ? computeHybridScore(skillScore, vectorScore, hybridWeights)
        : skillScore;

      scoredRows.push({
        job,
        coverage: { ...coverage, finalScore },
        matchScore: finalScore,
        vectorScore: useHybrid ? vectorScore : null,
      });
    }
  } else if (!isRedisReady()) {
    scoredRows = await scoreViaMongoScan({
      mongoQuery: mongoQuery || {},
      profileSkills,
      maxScan: MAX_CANDIDATES,
      vectorScores,
      hybridWeights,
      useHybrid,
    });
  }

  scoredRows.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    const aDate = new Date(a.job.postedAt || a.job._createdAt || 0).getTime();
    const bDate = new Date(b.job.postedAt || b.job._createdAt || 0).getTime();
    return bDate - aDate;
  });

  let docs = scoredRows.map((row) => {
    const enriched = enrichJobSkillsFromTitle(row.job);
    return {
      ...row.job,
      skills: enriched.skills,
      skillsNormalized: enriched.skillsNormalized,
      ...composeJobScores(
        { ...row.job, skills: enriched.skills },
        row.coverage,
        { vectorScore: row.vectorScore },
      ),
    };
  });

  if (hasScoreFilter) {
    docs = applyScoreFilters(docs, scoreFilters);
  }

  const pageScored = docs.slice(skip, skip + limit);
  let pageDocs = pageScored;

  if (!hasScoreFilter && pageScored.length < limit && catalogTotal > skip + pageScored.length) {
    const rankedIds = docs.map((d) => d._id);
    const needed = limit - pageScored.length;
    const dateSkip = Math.max(0, skip - docs.length);
    const dateDocs = await jobsCollection
      .find(
        { $and: [mongoQuery || {}, { _id: { $nin: rankedIds } }] },
        { projection: JOB_LIST_PROJECTION },
      )
      .sort({ postedAt: -1, _id: -1 })
      .skip(dateSkip)
      .limit(needed)
      .toArray();
    pageDocs = [
      ...pageScored,
      ...dateDocs.map((j) => ({
        ...j,
        ...composeJobScores(j, { matchScore: 0, covered: [], missing: [], required: 0 }),
        recommendationRanked: false,
      })),
    ];
  }

  return {
    docs: pageDocs,
    total: catalogTotal,
    catalogTotal,
    recommendationFallback: false,
    recommendationHybrid: useHybrid,
  };
}

async function scoreViaMongoScan({
  mongoQuery,
  profileSkills,
  maxScan,
  vectorScores,
  hybridWeights,
  useHybrid,
}) {
  const rows = [];
  const cursor = jobsCollection
    .find({
      $and: [
        mongoQuery,
        {
          $or: [
            { skillsNormalized: { $in: [...profileSkills] } },
            { skills: { $exists: true, $ne: [] } },
          ],
        },
      ],
    })
    .project(JOB_LIST_PROJECTION)
    .sort({ postedAt: -1 })
    .limit(maxScan);

  for await (const job of cursor) {
    const jobSkills = jobSkillsForScoring(job);
    const coverage = computeCoverageScore(jobSkills, profileSkills);
    if (coverage.required === 0 || coverage.matchScore === 0) continue;

    const skillScore = coverage.matchScore;
    const vectorScore = vectorScores.get(String(job._id)) ?? 0;
    const finalScore = useHybrid
      ? computeHybridScore(skillScore, vectorScore, hybridWeights)
      : skillScore;

    rows.push({
      job,
      coverage: { ...coverage, finalScore },
      matchScore: finalScore,
      vectorScore: useHybrid ? vectorScore : null,
    });
  }
  return rows;
}

/** Score a single job against a profile (radar / detail views). */
export async function scoreJobAgainstProfile(job, profileSkills) {
  const jobSkills = jobSkillsForScoring(job);
  return computeCoverageScore(jobSkills, profileSkills);
}

export function invalidateRecommendationCache(applierName) {
  return invalidateProfileSkillCache(applierName);
}

export { normalizeSkillSet, normalizeJobSkills };
