import { parseSkillProfile, rankResumes } from '../lib/resume-match.mjs';
import { formatProfileForAnalysis } from '../services/profileService.js';
import { profileResumeMatch, selectResumePdfPath } from '../services/resumeSelectionService.js';

/** Bid-Copilot always uses the lightest/cheapest GPT-5 tier — ignore profile model picks. */
const HARDCODED_OPENAI_MODEL = 'gpt-5-nano';
/** gpt-5-nano rejects `none`; `minimal` is the cheapest valid reasoning effort. */
const HARDCODED_REASONING_EFFORT = 'minimal';

const PRICING_PER_MILLION = {
  'gpt-5-nano': { input: 0.05, cached: 0.005, output: 0.4 },
  'gpt-5-mini': { input: 0.25, cached: 0.025, output: 2.0 },
  'gpt-5': { input: 1.25, cached: 0.125, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, cached: 0.075, output: 0.6 },
  'gpt-4o': { input: 2.5, cached: 1.25, output: 10.0 },
};

function getPricing(model) {
  if (PRICING_PER_MILLION[model]) return PRICING_PER_MILLION[model];
  const key = Object.keys(PRICING_PER_MILLION)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => model.startsWith(candidate));
  return key ? PRICING_PER_MILLION[key] : null;
}

function summarizeUsage(usage, model) {
  const inputTokens = usage?.prompt_tokens ?? 0;
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
  const uncachedInput = Math.max(0, inputTokens - cachedTokens);

  const pricing = getPricing(model);
  const cost = pricing
    ? (uncachedInput / 1_000_000) * pricing.input +
      (cachedTokens / 1_000_000) * pricing.cached +
      (outputTokens / 1_000_000) * pricing.output
    : null;

  // What the same call would have cost if every input token were billed at the
  // full (uncached) rate — the difference is the savings from prompt caching.
  const costWithoutCache = pricing
    ? (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
    : null;
  const savings =
    cost !== null && costWithoutCache !== null ? Math.max(0, costWithoutCache - cost) : null;

  return {
    model,
    inputTokens,
    cachedTokens,
    outputTokens,
    totalTokens,
    cost,
    savings,
  };
}

// Manual keyword scan for the traffic-light flags. Location words decide the
// "Remote" light; security words decide the "No clearance" light. We extract the
// sentences that mention these terms and hand only those (plus a JD excerpt) to a
// dedicated, focused AI request so the verdict is grounded in the actual phrasing.
const FLAG_KEYWORDS = {
  remote: /\b(in[\s-]?person|on[\s-]?site|hybrid|relocat\w*|travel|in[\s-]?office|on[\s-]?campus|office)\b/i,
  clearance:
    /\b(clearance|fingerprint\w*|polygraph|security[\s-]?clearance|background\s+(?:check|investigation)|secret|ts\/sci)\b/i,
};

// Splits text into sentences and keeps the ones matching either keyword group,
// deduped and capped so the dedicated request stays small and cache-friendly.
function extractFlagSentences(text, neededFlags) {
  const body = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!body) return [];
  const patterns = neededFlags.map((flag) => FLAG_KEYWORDS[flag]).filter(Boolean);
  if (patterns.length === 0) return [];

  const sentences = body.split(/(?<=[.!?])\s+|\n+/);
  const seen = new Set();
  const matched = [];
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence || sentence.length > 320) continue;
    if (!patterns.some((pattern) => pattern.test(sentence))) continue;
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    matched.push(sentence);
    if (matched.length >= 25) break;
  }
  return matched;
}

const FLAG_FIELD_SPEC = {
  remote:
    '  "remote": { "status": "green" | "red", "explanation": string }  // red if onsite, in-person, hybrid, relocation, or travel is mandatory within the first 3 months; green if effectively remote with no such requirement',
  clearance:
    '  "clearance": { "status": "green" | "red", "explanation": string }  // red if a security clearance, fingerprinting, polygraph, or formal background investigation is required; green otherwise',
};

function buildFlagSystemPrompt(neededFlags) {
  const fields = neededFlags.map((flag) => FLAG_FIELD_SPEC[flag]).filter(Boolean).join(',\n');
  return `You screen a job description for two hard constraints. Decide ONLY the requested fields and respond with JSON only.

Return JSON with exactly this shape:
{
${fields}
}

Rules:
- Base the verdict on the provided sentences (extracted because they mention relevant keywords) and the job description excerpt.
- "red" means the constraint is violated (a disqualifier for a remote, clearance-free applicant); "green" means it is satisfied.
- explanation: one short sentence quoting or paraphrasing the exact phrase that drove the verdict. For green, say briefly why nothing disqualifying was found.
- Do not include any field that was not requested.`;
}

function formatRadarLine(skillName, score) {
  const value = Math.max(0, Math.min(10, Math.round(Number(score) || 0)));
  const bar = '█'.repeat(value).padEnd(10, ' ');
  return `${skillName.padEnd(24)} ${bar} ${String(value).padStart(2)}`;
}

function normalizeSkillProfileOutput(text) {
  const scores = parseSkillProfile(text);
  if (scores.size === 0) return String(text ?? '').trim();

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([skill, score]) => formatRadarLine(skill, score))
    .join('\n');
}

async function callOpenAi(
  apiKey,
  model,
  messages,
  { jsonMode = false, cacheKey, reasoningEffort = HARDCODED_REASONING_EFFORT } = {},
) {
  if (!apiKey) {
    throw new Error(
      'OpenAI API key is not configured. Add it under Settings → Profile in lancer-frontend, then Save.',
    );
  }

  const body = {
    model,
    messages,
  };

  if (model.startsWith('gpt-5')) {
    // gpt-5* default to "medium" effort (slow/expensive). Use minimal for nano.
    // Note: "none" is rejected by the API for this model family.
    body.reasoning_effort = reasoningEffort;
  } else {
    body.temperature = 0.2;
  }

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  if (cacheKey) {
    body.prompt_cache_key = cacheKey;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? `OpenAI request failed (${response.status})`;
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response.');
  }

  return { content, usage: data?.usage ?? null };
}

function buildSessionContextBlock(sessionContext) {
  if (!sessionContext || typeof sessionContext !== 'object') return '';

  const jdSummary = String(sessionContext.jdSummary ?? '').trim();
  const jdText = String(sessionContext.jdText ?? '').trim();
  const skillProfile = String(sessionContext.skillProfile ?? '').trim();

  if (!jdSummary && !jdText && !skillProfile) return '';

  const parts = [
    'CONTEXT FROM EARLIER IN THIS APPLICATION SESSION',
    '(The current page may be an application form on a different URL than the original job posting.',
    'Use this remembered job description to answer the form even if the JD is not visible on this page.)',
  ];
  if (jdSummary) parts.push(`\nJob summary: ${jdSummary}`);
  if (skillProfile) parts.push(`\nRequired skills profile:\n${skillProfile}`);
  if (jdText) parts.push(`\nOriginal job posting text:\n${jdText.slice(0, 6000)}`);

  return `${parts.join('\n')}\n\n---\n\n`;
}

// Fully static — kept identical on every request so the whole system message
// (the start of the prompt prefix) is served from OpenAI's prompt cache.
const PAGE_SYSTEM_PROMPT = `You analyze web pages for job applications. You maintain context across multiple pages of the same application session, so a remembered job description applies to later form pages. Use the applicant profile for form answers. Respond with JSON only. Do not extract skills.

Return JSON with this exact shape:
{
  "isJobPage": boolean,
  "summary": string,
  "formAnswers": [{ "question": string, "suggestedAnswer": string, "confidence": "high"|"medium"|"low" }],
  "notJobPageReason": string | null
}

Rules:
- Set isJobPage true only if this looks like a job posting or job application page.
- Treat the page as job-related (isJobPage true) if it is a job posting OR an application form, including when the job description itself is only available from the remembered session context.
- summary: 2-4 sentence JD summary when isJobPage is true; otherwise brief explanation.
- formAnswers: suggest concise answers for detected application questions when isJobPage is true; otherwise return [].
- When a form field clearly maps to a profile value provided, use that exact value and set confidence to "high".
- notJobPageReason: required when isJobPage is false.
- Do NOT include skill analysis in this response — skills are extracted separately.`;

function formatFormsText(pageContext) {
  return pageContext.forms?.length > 0
    ? pageContext.forms
        .map((field, index) => {
          const parts = [
            `#${index + 1}`,
            field.label ? `label: ${field.label}` : null,
            field.name ? `name: ${field.name}` : null,
            field.type ? `type: ${field.type}` : null,
            field.placeholder ? `placeholder: ${field.placeholder}` : null,
            field.required ? 'required: yes' : null,
            field.options?.length ? `options: ${field.options.join(', ')}` : null,
          ].filter(Boolean);
          return parts.join(' | ');
        })
        .join('\n')
    : '(no form fields detected)';
}

/**
 * Builds the user message with the most STABLE content first (applicant
 * profile, then the remembered session JD) and the VARIABLE current-page
 * content last. OpenAI caches the longest common prompt prefix, so keeping the
 * per-applier/per-session blocks at the front lets repeated analyze clicks in
 * the same session reuse cached input tokens at the discounted rate.
 */
function buildAnalysisPrompt(pageContext, profileBlock, sessionContext) {
  const sessionBlock = buildSessionContextBlock(sessionContext);
  const formsText = formatFormsText(pageContext);

  return `APPLICANT PROFILE
${profileBlock}

${sessionBlock}=== CURRENT PAGE (analyze this) ===
URL: ${pageContext.url}
Title: ${pageContext.title}
Meta description: ${pageContext.metaDescription || '(none)'}

Page text:
${pageContext.visibleText}

Form fields on page:
${formsText}`;
}

export function createAnalyzer({ skillPromptTemplate, defaultModel = HARDCODED_OPENAI_MODEL }) {
  // Always bill/analyze on gpt-5-nano regardless of profile defaultModel.
  const model = HARDCODED_OPENAI_MODEL || defaultModel;

  async function analyzePage(pageContext, profileBundle, sessionContext) {
    const profileBlock = formatProfileForAnalysis(profileBundle.profile, profileBundle.skills);
    const apiKey = profileBundle.openAi?.apiKey ?? '';
    const { content, usage } = await callOpenAi(
      apiKey,
      model,
      [
        { role: 'system', content: PAGE_SYSTEM_PROMPT },
        { role: 'user', content: buildAnalysisPrompt(pageContext, profileBlock, sessionContext) },
      ],
      { jsonMode: true, cacheKey: 'job-bid-page' },
    );

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('OpenAI returned invalid JSON.');
    }

    const result = {
      isJobPage: Boolean(parsed.isJobPage),
      summary: String(parsed.summary ?? '').trim(),
      formAnswers: Array.isArray(parsed.formAnswers)
        ? parsed.formAnswers
            .map((entry) => ({
              question: String(entry?.question ?? '').trim(),
              suggestedAnswer: String(entry?.suggestedAnswer ?? '').trim(),
              confidence: ['high', 'medium', 'low'].includes(entry?.confidence)
                ? entry.confidence
                : 'medium',
            }))
            .filter((entry) => entry.question && entry.suggestedAnswer)
        : [],
      notJobPageReason: parsed.notJobPageReason ? String(parsed.notJobPageReason).trim() : undefined,
      pageUrl: pageContext.url,
      pageTitle: pageContext.title,
      applierName: profileBundle.applierName,
    };

    return { result, usage: summarizeUsage(usage, model) };
  }

  async function analyzeSkills(pageContext, profileBundle, sessionContext) {
    if (!String(skillPromptTemplate ?? '').trim()) {
      throw new Error(
        'Job analysis prompt is not loaded. Ensure prompt.md sits next to bridge.mjs in dist/, or remove PROMPT_MD_PATH from .env.',
      );
    }

    const apiKey = profileBundle.openAi?.apiKey ?? '';
    // The JD usually lives on the original posting, not the form page. Prefer
    // the JD remembered from earlier in the session so the skill profile stays
    // anchored to the real job description even when analyzing a form page.
    const rememberedJd = String(sessionContext?.jdText ?? '').trim();
    const currentText = String(pageContext.visibleText ?? '').trim();
    // Use only the JD body (no per-page URL/title), so within a session the
    // input stays byte-identical across analyze clicks and hits the prompt
    // cache. The skill profile depends on the JD, not on the current page URL.
    const jdBody = rememberedJd && rememberedJd.length > currentText.length ? rememberedJd : currentText;

    const { content, usage } = await callOpenAi(
      apiKey,
      model,
      [
        { role: 'system', content: skillPromptTemplate },
        {
          role: 'user',
          content: `Analyze this job description and output ONLY the radar profile.\n\n${jdBody}`,
        },
      ],
      { cacheKey: 'job-bid-skill' },
    );

    const skillProfile = normalizeSkillProfileOutput(content);

    const catalog =
      profileBundle.resumeAnalysisCatalog && typeof profileBundle.resumeAnalysisCatalog === 'object'
        ? profileBundle.resumeAnalysisCatalog
        : profileBundle.resumeCatalog && typeof profileBundle.resumeCatalog === 'object'
          ? profileBundle.resumeCatalog
          : {};

    let topResumes = [];
    if (Object.keys(catalog).length === 0) {
      console.warn(
        '[vender-server] Resume analysis catalog is empty — Analyze resumes first or load legacy resumes.json under Settings → Resume.',
      );
    } else if (skillProfile) {
      topResumes = rankResumes(skillProfile, catalog, 3).map((entry) => ({
        name: entry.name,
        score: entry.score,
        scorePercent: Math.round(entry.score * 100),
      }));
      if (topResumes.length === 0) {
        const parsedCount = parseSkillProfile(skillProfile).size;
        console.warn(
          `[vender-server] Could not rank resumes (${parsedCount} skills parsed from JD profile).`,
        );
      }
    }

    let bestResume = topResumes[0] ?? null;

    if (profileBundle.profile.resumeFolderUrl && profileBundle.profile.fullName) {
      const pick = await selectResumePdfPath({
        resumeFolderUrl: profileBundle.profile.resumeFolderUrl,
        fullName: profileBundle.profile.fullName,
        jobDescription: pageContext.visibleText,
        skills: profileBundle.skills,
      });
      const profileMatch = profileResumeMatch(pick);
      if (profileMatch) {
        bestResume = {
          name: profileMatch.name,
          score: profileMatch.score,
          scorePercent: profileMatch.scorePercent,
        };
        topResumes = [
          bestResume,
          ...topResumes.filter((entry) => entry.name !== bestResume.name),
        ].slice(0, 3);
      }
    }

    return {
      result: {
        skillProfile,
        bestResume,
        topResumes,
        applierName: profileBundle.applierName,
      },
      usage: summarizeUsage(usage, model),
    };
  }

  // Dedicated traffic-light request. Decides only the still-unresolved flags
  // (neededFlags), so once the client has a verdict it stops asking — the schema
  // shrinks and eventually the client skips this call entirely.
  async function analyzeFlags(pageContext, profileBundle, sessionContext, neededFlags) {
    const flags = Array.isArray(neededFlags)
      ? neededFlags.filter((flag) => flag === 'remote' || flag === 'clearance')
      : [];
    if (flags.length === 0) {
      return { result: {}, usage: null };
    }

    const apiKey = profileBundle.openAi?.apiKey ?? '';

    // Prefer the richest remembered JD (same rationale as analyzeSkills) so a
    // form page on a different URL still gets the original posting scanned.
    const rememberedJd = String(sessionContext?.jdText ?? '').trim();
    const currentText = String(pageContext.visibleText ?? '').trim();
    const jdBody = rememberedJd && rememberedJd.length > currentText.length ? rememberedJd : currentText;

    const matchedSentences = extractFlagSentences(jdBody, flags);
    const sentencesBlock = matchedSentences.length
      ? matchedSentences.map((sentence) => `- ${sentence}`).join('\n')
      : '(no sentences matched the location/clearance keywords)';

    const { content, usage } = await callOpenAi(
      apiKey,
      model,
      [
        { role: 'system', content: buildFlagSystemPrompt(flags) },
        {
          role: 'user',
          content: `KEYWORD-MATCHED SENTENCES (manual scan):\n${sentencesBlock}\n\nJOB DESCRIPTION EXCERPT (backup context):\n${jdBody.slice(0, 6000)}`,
        },
      ],
      { jsonMode: true, cacheKey: 'job-bid-flags' },
    );

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('OpenAI returned invalid JSON for flag analysis.');
    }

    const normalizeVerdict = (verdict) => {
      if (!verdict || typeof verdict !== 'object') return null;
      const status = verdict.status === 'red' ? 'red' : 'green';
      return { status, explanation: String(verdict.explanation ?? '').trim() };
    };

    const result = {};
    for (const flag of flags) {
      const verdict = normalizeVerdict(parsed[flag]);
      if (verdict) result[flag] = verdict;
    }

    return { result, usage: summarizeUsage(usage, model) };
  }

  return { analyzePage, analyzeSkills, analyzeFlags };
}
