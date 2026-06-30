import type { ActionableTree } from '@avalon/shared';
import type { FieldActionPlan, FlatFormField } from './types.js';

export const FORM_ACTION_PLAN_SYSTEM_PROMPT = `You are a job-application automation planner. You receive form fields scraped from a live application page and must output an executable action plan for each field.

For every field id, return:
- action: one of Click | Typing | SelectOption | FileUpload | Check | Uncheck
- shouldSkip: Yes | No
- value: the literal value to use, or "N/A" when not applicable
- notes: optional brief rationale

Action rules by controlType:
- text / textarea → Typing, value = text to enter
- combobox (autocomplete input, including location/city fields) → ALWAYS Typing — type a short searchable prefix from profile (e.g. "New York" not the full option string), never SelectOption. Options in the payload are hints only; automation types, waits for suggestions, then confirms with keyboard.
- native select element (controlTag select) → SelectOption with EXACT option label
- checkbox → Check or Uncheck, value = "checked" or "unchecked"
- Multi-select checkbox groups (groupContext like "Select all that apply", skill/interest questions):
  - Evaluate each checkbox individually — shouldSkip No for nearly all options in the group
  - Check options that match the candidate's careers, title, diploma, and reasonable skills for a software engineer
  - Uncheck only options clearly unrelated — never skip the whole group with "no profile data"
  - Use groupContext + option label together (e.g. "What do you want to work on?" → Check Backend/Frontend for a full-stack engineer)
- radio → Click (select that option), value = N/A
- button → Click, value = N/A
- file → FileUpload, value = file purpose (e.g. "resume", "cover letter") — do not invent file bytes
- link → Click with shouldSkip Yes, value N/A — informational links must NOT be clicked (they leave the application page)

Resume / CV file upload (TOP PRIORITY — MANDATORY):
- Any field labeled Resume, CV, Resume/CV, or similar file upload is the highest-priority action on the form.
- Always action FileUpload with shouldSkip No — never skip Resume/CV even if the field appears optional.
- value = "resume" (or the exact label purpose). The automation attaches the candidate document separately.
- Cover letter file uploads: shouldSkip No when present; resume takes precedence if only one upload can be prioritized.

ShouldSkip Yes when:
- Informational / disclosure / external links (definitions, OFCCP, dol.gov, learn more)
- Optional fields with no profile data and no sensible default (only if truly skippable)
- NEVER for Resume/CV file uploads
- NEVER for all checkboxes in a "select all that apply" group — pick Check/Uncheck per option instead

ShouldSkip No for required fields and all real inputs that must be filled to submit.

Profile (autoBidProfile): use exact values for firstName, lastName, email, phone, city, state, country,
linkedin, github, gender, demographic fields, sponsorship, etc. Map EEO dropdowns to closest listed option label.
Never use placeholder names like John Doe or johndoe@example.com when profile data is provided.

Return one entry per field id in the request. Use value "N/A" for Click actions and when shouldSkip is Yes.`;

const INFORMATIONAL_LINK_PATTERN =
  /\b(definition|definitions|learn more|ofccp|dol\.gov|privacy|policy|voluntary|disclosure|www\.|https?:\/\/)\b/i;

export function isSkippableField(field: FlatFormField): boolean {
  if (field.controlType !== 'link') return false;
  if (field.required) return false;
  return true;
}

export function skipActionPlanEntry(field: FlatFormField): FieldActionPlan {
  const informational = INFORMATIONAL_LINK_PATTERN.test(`${field.label} ${field.groupContext}`);
  return {
    id: field.id,
    action: 'Click',
    shouldSkip: 'Yes',
    value: 'N/A',
    notes: informational
      ? 'Informational link — do not click; leaves the application page.'
      : 'Link — skip during autofill.',
  };
}

export function partitionFields(fields: FlatFormField[]): {
  actionable: FlatFormField[];
  skippable: FlatFormField[];
} {
  const actionable: FlatFormField[] = [];
  const skippable: FlatFormField[] = [];
  for (const field of fields) {
    if (isSkippableField(field)) {
      skippable.push({ ...field, skippable: true });
    } else {
      actionable.push(field);
    }
  }
  return { actionable, skippable };
}

export function isRequiredLabel(label: string): boolean {
  return /\*\s*$/.test(label.trim()) || label.includes('*');
}

export function flattenActionableTree(tree: ActionableTree): FlatFormField[] {
  const fields: FlatFormField[] = [];

  tree.forEach((group, groupIndex) => {
    group.children.forEach((entry, childIndex) => {
      fields.push({
        id: `${groupIndex}:${childIndex}`,
        groupIndex,
        childIndex,
        groupContext: group.content,
        label: entry.target.replace(/\*+\s*$/, '').trim(),
        required: isRequiredLabel(entry.target),
        controlType: entry.controlType,
        controlTag: entry.control.tag,
        options: entry.options?.map((o) => o.label).filter(Boolean),
        optionsSource: entry.optionsSource,
      });
    });
  });

  return fields;
}

export function buildAnalysisUserMessage(
  fields: FlatFormField[],
  applicantContext?: string,
  skippedCount = 0,
): string {
  const payload = {
    fieldCount: fields.length,
    fields: fields.map((f) => ({
      id: f.id,
      groupContext: f.groupContext,
      label: f.label,
      required: f.required,
      controlType: f.controlType,
      controlTag: f.controlTag,
      ...(f.options?.length
        ? { options: f.options.slice(0, 50), optionsTruncated: f.options.length > 50 }
        : {}),
    })),
  };

  const parts = [
    'Build an action plan (action, shouldSkip, value) for every field id below.',
    'Resume/CV file uploads are mandatory — must be FileUpload with shouldSkip No (top priority).',
    'Multi-select checkbox groups: shouldSkip No per option — Check skills that match profile careers/title.',
    'Combobox / location / autocomplete fields: action must be Typing (never SelectOption) — type profile city or filter text; Enter confirms after typing.',
    skippedCount > 0
      ? `(Note: ${skippedCount} informational link(s) omitted from this list — already marked shouldSkip Yes.)`
      : '',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ].filter(Boolean);

  if (applicantContext?.trim()) {
    parts.push('', 'Applicant profile (profile.json / autoBidProfile):', '```json', applicantContext.trim(), '```');
  } else {
    parts.push('', 'No profile.json — use realistic generic values where needed.');
  }

  return parts.join('\n');
}
