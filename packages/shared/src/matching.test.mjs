import test from 'node:test';
import assert from 'node:assert/strict';
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

test('computeHybridScore blends skill and vector scores', () => {
  assert.equal(computeHybridScore(100, 0, { skill: 0.55, vector: 0.45 }), 55);
  assert.equal(computeHybridScore(0, 100, { skill: 0.55, vector: 0.45 }), 45);
  assert.equal(computeHybridScore(100, 100, { skill: 0.55, vector: 0.45 }), 100);
});
