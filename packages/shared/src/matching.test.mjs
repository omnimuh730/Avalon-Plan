import test from 'node:test';
import assert from 'node:assert/strict';
import { compactSkillText } from './skill-compact.js';
import { skillTokens, buildProfileTokens } from './skill-tokens.js';
import { jobSkillMatchesProfile, buildProfileCompacts } from './skill-match.js';
import { extractSkillsFromTitle, enrichJobSkillsFromTitle } from '../../../Athens-server/src/services/matching/jobSkillExtraction.js';
import { computeHybridScore } from '../../../Athens-server/src/services/matching/coverageScore.js';

test('extractSkillsFromTitle pulls technology tokens, skips role filler', () => {
  const skills = extractSkillsFromTitle('Senior Salesforce Developer (m/f/d)');
  assert.ok(skills.some((s) => s.toLowerCase() === 'salesforce'));
  assert.equal(skills.some((s) => s.toLowerCase() === 'developer'), false);
  assert.equal(skills.some((s) => s.toLowerCase() === 'senior'), false);
});

test('extractSkillsFromTitle works for non-engineering titles', () => {
  const skills = extractSkillsFromTitle('Marketing Manager — HubSpot');
  assert.ok(skills.some((s) => s.toLowerCase() === 'marketing'));
  assert.ok(skills.some((s) => s.toLowerCase() === 'hubspot'));
});

test('enrichJobSkillsFromTitle adds title skill to job list', () => {
  const { skills, skillsNormalized } = enrichJobSkillsFromTitle({
    title: 'Salesforce Developer',
    skills: ['Java', 'SQL', 'REST APIs'],
  });
  assert.ok(skills.some((s) => /salesforce/i.test(s)));
  assert.ok(skillsNormalized.includes('salesforce'));
});

function profileCtx(skills) {
  return {
    profileTokens: buildProfileTokens(skills),
    profileCompacts: buildProfileCompacts(skills),
  };
}

test('shared word token matches related job skills', () => {
  assert.ok(jobSkillMatchesProfile('software development', profileCtx(['Software'])));
  assert.ok(jobSkillMatchesProfile('MFC C++', profileCtx(['C++'])));
  assert.equal(compactSkillText('full-stack'), 'fullstack');
});

test('>=5 substring shim keeps fullstack <-> full-stack development', () => {
  assert.ok(jobSkillMatchesProfile('full-stack development', profileCtx(['fullstack'])));
});

test('profile AI matches AI-family job skills by word, not by blob', () => {
  const ctx = profileCtx(['AI']);
  assert.ok(jobSkillMatchesProfile('AI', ctx));
  assert.ok(jobSkillMatchesProfile('AI/ML System', ctx));
  assert.ok(jobSkillMatchesProfile('AI-driven Solutions', ctx));
  assert.ok(jobSkillMatchesProfile('AI/ML-powered Systems', ctx));
});

test('profile AI does NOT match unrelated skills containing the letters "ai"', () => {
  const ctx = profileCtx(['AI']);
  assert.equal(jobSkillMatchesProfile('Gmail', ctx), false);
  assert.equal(jobSkillMatchesProfile('Training', ctx), false);
  assert.equal(jobSkillMatchesProfile('Maintenance', ctx), false);
});

test('skillTokens splits on separators but preserves c++/node.js', () => {
  assert.deepEqual(skillTokens('AI/ML Model'), ['ai', 'ml', 'model']);
  assert.deepEqual(skillTokens('AI-driven Workflows'), ['ai', 'driven']); // "workflows" is generic filler
  assert.ok(skillTokens('MFC C++').includes('c++'));
  assert.ok(skillTokens('Node.js').includes('node.js'));
});

test('generic filler tokens are dropped, distinctive ones kept', () => {
  // "development"/"systems" are filler; the real noun survives
  assert.deepEqual(skillTokens('Backend Development'), ['backend']);
  assert.deepEqual(skillTokens('Distributed Systems'), ['distributed']);
  // distinctive words are NOT filtered
  assert.ok(skillTokens('UI Design').includes('design'));
  assert.ok(skillTokens('Cloud Data').includes('data'));
});

test('generic word alone does not cross-match unrelated roles', () => {
  const ctx = profileCtx(['React', 'Frontend Development', 'UI Design']);
  // shares only the filler "development" with the job → must NOT match
  assert.equal(jobSkillMatchesProfile('Backend Development', ctx), false);
  // but a real shared word still matches
  assert.ok(jobSkillMatchesProfile('React Native', ctx));
});

test('computeHybridScore blends skill and vector scores', () => {
  assert.equal(computeHybridScore(100, 0, { skill: 0.55, vector: 0.45 }), 55);
  assert.equal(computeHybridScore(0, 100, { skill: 0.55, vector: 0.45 }), 45);
  assert.equal(computeHybridScore(100, 100, { skill: 0.55, vector: 0.45 }), 100);
});
