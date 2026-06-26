import { accountInfoCollection } from '../../db/mongo.js';
import { updateAccountInfoById } from '../accountInfoStore.js';
import { buildProfileCompacts } from '@nextoffer/shared/skill-match';
import { buildProfileTokens } from '@nextoffer/shared/skill-tokens';
import { toCanonical } from '@nextoffer/shared/skill-normalize';
import { invalidateProfileSkillCache } from './profileSkills.js';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findAccountByApplierName(nameRaw) {
  const trimmed = String(nameRaw ?? '').trim();
  if (!trimmed || !accountInfoCollection) return null;
  let acc = await accountInfoCollection.findOne(
    { name: trimmed },
    { projection: { _id: 1, name: 1, profileBoostSkills: 1 } },
  );
  if (acc) return acc;
  const esc = escapeRegExp(trimmed);
  return accountInfoCollection.findOne(
    { name: { $regex: new RegExp(`^${esc}$`, 'i') } },
    { projection: { _id: 1, name: 1, profileBoostSkills: 1 } },
  );
}

export async function loadProfileBoostSkills(applierName) {
  const acc = await findAccountByApplierName(applierName);
  if (!acc) return [];
  const raw = Array.isArray(acc.profileBoostSkills) ? acc.profileBoostSkills : [];
  return raw.map((s) => String(s).trim()).filter(Boolean);
}

export async function addProfileBoostSkill(applierName, skill) {
  const name = String(applierName || '').trim();
  const label = String(skill || '').trim();
  if (!name || !label) throw new Error('applierName and skill are required');

  const acc = await findAccountByApplierName(name);
  if (!acc) throw new Error(`No account named "${name}"`);

  const canonical = toCanonical(label);
  const existing = await loadProfileBoostSkills(name);
  const dup = existing.some((s) => toCanonical(s) === canonical || compactDup(s, label));
  if (dup) {
    return { skills: existing, added: false };
  }

  await updateAccountInfoById(acc._id, acc.name, {
    $addToSet: { profileBoostSkills: label },
    $set: { profileBoostSkillsUpdatedAt: new Date().toISOString() },
  });

  await invalidateProfileSkillCache(name);
  const skills = await loadProfileBoostSkills(name);
  return { skills, added: true };
}

function compactDup(a, b) {
  const ca = String(a).toLowerCase().replace(/[\s\-–—_./+]/g, '');
  const cb = String(b).toLowerCase().replace(/[\s\-–—_./+]/g, '');
  return ca === cb;
}

export function buildProfileMatchContext(exactSet, boostSkills = [], resumeRawSkills = []) {
  const merged = new Set(exactSet);
  for (const raw of boostSkills) {
    const c = toCanonical(raw);
    if (c) merged.add(c);
  }
  const profileCompacts = buildProfileCompacts([...boostSkills, ...resumeRawSkills]);
  const profileTokens = buildProfileTokens([...boostSkills, ...resumeRawSkills]);
  return {
    exactSet: merged,
    profileCompacts,
    boostCompacts: profileCompacts,
    profileTokens,
  };
}
