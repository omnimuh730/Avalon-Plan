import {
  loadProfileBoostSkills,
  addProfileBoostSkill,
} from '../services/matching/profileBoostSkills.js';
import { loadProfileMatchContext } from '../services/matching/profileSkills.js';
import { computeSkillHighlights } from '@nextoffer/shared/skill-match';

export async function getProfileMatchSkills(req, res) {
  try {
    const applierName = String(req.query?.applierName || '').trim();
    if (!applierName) {
      return res.status(400).json({ success: false, error: 'applierName query required' });
    }

    const ctx = await loadProfileMatchContext(applierName);
    return res.json({
      success: true,
      boostSkills: ctx.boostRaw || [],
      exactSkills: [...ctx.exactSet],
      profileCompacts: ctx.profileCompacts || [],
      boostCompacts: ctx.profileCompacts || [],
      profileTokens: ctx.profileTokens || [],
    });
  } catch (err) {
    console.error('GET /api/personal/profile-match-skills error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export async function addProfileMatchSkill(req, res) {
  try {
    const applierName = String(req.body?.applierName || '').trim();
    const skill = String(req.body?.skill || '').trim();
    if (!applierName || !skill) {
      return res.status(400).json({ success: false, error: 'applierName and skill required' });
    }

    const result = await addProfileBoostSkill(applierName, skill);
    const ctx = await loadProfileMatchContext(applierName);

    const jobSkills = Array.isArray(req.body?.jobSkills)
      ? req.body.jobSkills.map((s) => String(s).trim()).filter(Boolean)
      : [];

    const skillHighlights = jobSkills.length
      ? computeSkillHighlights(jobSkills, ctx)
      : [];

    const covered = skillHighlights.filter((r) => r.matched).length;
    const required = skillHighlights.length;
    const skillScore = required ? Math.round((covered / required) * 100) : 0;

    return res.json({
      success: true,
      added: result.added,
      boostSkills: result.skills,
      exactSkills: [...ctx.exactSet],
      profileCompacts: ctx.profileCompacts,
      boostCompacts: ctx.profileCompacts,
      profileTokens: ctx.profileTokens || [],
      skillHighlights,
      skillsCovered: covered,
      skillsRequired: required,
      scoreSkill: skillScore,
    });
  } catch (err) {
    console.error('POST /api/personal/profile-match-skills error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
