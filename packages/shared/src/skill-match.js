import { compactSkillText } from './skill-compact.js';
import { skillTokens, buildProfileTokens } from './skill-tokens.js';

const MIN_COMPACT_LEN = 2;
const MAX_PROFILE_COMPACTS = 300;
/** Min length for the substring fallback so short tokens (e.g. "ai") can't match "gmail"/"training". */
const SHIM_MIN_LEN = 5;

/**
 * @typedef {{ profileTokens?: string[]|Set<string>, profileCompacts?: string[], boostCompacts?: string[] }} ProfileMatchContext
 */

export function buildProfileCompacts(skills = [], { max = MAX_PROFILE_COMPACTS } = {}) {
  const seen = new Set();
  const out = [];

  for (const raw of skills) {
    const compact = compactSkillText(raw);
    if (!compact || compact.length < MIN_COMPACT_LEN || seen.has(compact)) continue;
    seen.add(compact);
    out.push(compact);
    if (out.length >= max) break;
  }

  return out;
}

/** @deprecated use buildProfileCompacts */
export const buildBoostCompacts = buildProfileCompacts;

export { buildProfileTokens, skillTokens };

function getProfileCompacts(ctx) {
  if (Array.isArray(ctx?.profileCompacts) && ctx.profileCompacts.length) {
    return ctx.profileCompacts;
  }
  if (Array.isArray(ctx?.boostCompacts) && ctx.boostCompacts.length) {
    return ctx.boostCompacts;
  }
  return [];
}

/** Resolve the profile token Set, caching it on the context object for reuse across many jobs. */
function getProfileTokenSet(ctx) {
  if (!ctx || typeof ctx !== 'object') return new Set();
  if (ctx._profileTokenSet instanceof Set) return ctx._profileTokenSet;
  const raw = ctx.profileTokens;
  const set = raw instanceof Set ? raw : new Set(Array.isArray(raw) ? raw : []);
  try { ctx._profileTokenSet = set; } catch { /* frozen ctx */ }
  return set;
}

/**
 * Whether a job requirement is satisfied by any profile skill.
 * Primary rule: the job skill shares a word token with the profile
 * (AI/ML → AI ✅, Gmail → AI ❌). Fallback: substring containment, but only for
 * tokens of length ≥ 5 so short tokens can't create false positives.
 */
export function jobSkillMatchesProfile(jobSkill, ctx) {
  const tokens = skillTokens(jobSkill);
  if (!tokens.length) return false;

  const profileTokens = getProfileTokenSet(ctx);
  if (profileTokens.size) {
    for (const token of tokens) {
      if (profileTokens.has(token)) return true;
    }
  }

  const profileCompacts = getProfileCompacts(ctx);
  if (profileCompacts.length) {
    const jobCompact = compactSkillText(jobSkill);
    if (jobCompact) {
      for (const profile of profileCompacts) {
        if (profile.length < SHIM_MIN_LEN) continue;
        if (jobCompact.includes(profile)) return true;
        if (jobCompact.length >= SHIM_MIN_LEN && profile.includes(jobCompact)) return true;
      }
    }
  }

  return false;
}

/**
 * @param {string[]} jobSkills display or canonical job skills
 * @param {ProfileMatchContext} ctx
 */
export function computeSkillHighlights(jobSkills = [], ctx) {
  return jobSkills.map((name) => ({
    name: String(name),
    matched: jobSkillMatchesProfile(name, ctx),
  }));
}
