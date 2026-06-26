import { userResumesCollection, accountInfoCollection } from '../../db/mongo.js';
import { getRedis, isRedisReady } from '../../db/redis.js';
import { normalizeSkillSet } from '@nextoffer/shared/skill-normalize';
import { loadProfileBoostSkills, buildProfileMatchContext } from './profileBoostSkills.js';

const PROFILE_CACHE_TTL_SEC = 180;
const profileKey = (applierName) => `profile:skills:${String(applierName || '').trim()}`;
const matchContextKey = (applierName) => `profile:match:${String(applierName || '').trim()}`;

async function loadResumeSkillRaw(applierName) {
  const name = String(applierName || '').trim();
  if (!name || !userResumesCollection) return [];

  const resumes = await userResumesCollection
    .find({ ownerName: name, analyzed: true })
    .project({ skillProfile: 1, skills: 1 })
    .toArray();

  const rawSkills = [];
  for (const doc of resumes) {
    if (Array.isArray(doc.skillProfile)) {
      for (const item of doc.skillProfile) {
        const n = item?.name || item?.skill;
        if (n) rawSkills.push(String(n));
      }
    }
    if (Array.isArray(doc.skills)) {
      for (const s of doc.skills) rawSkills.push(String(s));
    }
  }
  return rawSkills;
}

/**
 * Load union of canonical skills across resumes (exact match layer).
 */
export async function loadProfileSkillSet(applierName) {
  const ctx = await loadProfileMatchContext(applierName);
  return ctx.exactSet;
}

/**
 * Resume exact skills + user-boosted skills with compact substring rules.
 */
export async function loadProfileMatchContext(applierName) {
  const name = String(applierName || '').trim();
  if (!name) {
    return buildProfileMatchContext(new Set(), [], []);
  }

  if (isRedisReady()) {
    const redis = getRedis();
    const cached = await redis.get(matchContextKey(name));
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return {
          exactSet: new Set(parsed.exactSet || []),
          profileCompacts: parsed.profileCompacts || parsed.boostCompacts || [],
          boostCompacts: parsed.profileCompacts || parsed.boostCompacts || [],
          profileTokens: parsed.profileTokens || [],
          boostRaw: parsed.boostRaw || [],
        };
      } catch {
        /* rebuild */
      }
    }
  }

  const rawSkills = await loadResumeSkillRaw(name);
  const resumeExact = normalizeSkillSet(rawSkills);
  const boostSkills = await loadProfileBoostSkills(name);
  const ctx = buildProfileMatchContext(resumeExact, boostSkills, rawSkills);
  ctx.boostRaw = boostSkills;

  if (isRedisReady()) {
    const redis = getRedis();
    const payload = JSON.stringify({
      exactSet: [...ctx.exactSet],
      profileCompacts: ctx.profileCompacts,
      boostCompacts: ctx.profileCompacts,
      profileTokens: ctx.profileTokens,
      boostRaw: boostSkills,
    });
    await redis.setEx(matchContextKey(name), PROFILE_CACHE_TTL_SEC, payload);
    await redis.setEx(profileKey(name), PROFILE_CACHE_TTL_SEC, JSON.stringify([...ctx.exactSet]));
  }

  return ctx;
}

export async function invalidateProfileSkillCache(applierName) {
  const name = String(applierName || '').trim();
  if (!name || !isRedisReady()) return;
  const redis = getRedis();
  await redis.del(profileKey(name), matchContextKey(name));
}
