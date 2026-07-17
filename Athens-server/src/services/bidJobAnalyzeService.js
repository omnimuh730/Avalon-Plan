/**
 * Bid job page + Remote/Clearance analysis (bid-assistant / vender-server style).
 * AI reads full page innerText (+ optional form hints) and profile JSON — no hardcoded answers.
 */
import { chatCompletion, resolveDefaultModel, summarizeUsage } from "./llm/llmService.js";
import { loadDecryptedAutoBidProfile } from "./autoBidProfileSecrets.js";

const FLAG_KEYWORDS = {
	remote:
		/\b(in[\s-]?person|on[\s-]?site|hybrid|relocat\w*|travel|in[\s-]?office|on[\s-]?campus|office)\b/i,
	clearance:
		/\b(clearance|fingerprint\w*|polygraph|security[\s-]?clearance|background\s+(?:check|investigation)|secret|ts\/sci)\b/i,
};

const REMOTE_POSITIVE = /\b(remote|work\s+from\s+home|wfh|fully\s+remote|100%\s+remote)\b/i;
const CLEARANCE_NEGATIVE =
	/\b(no\s+(?:security\s+)?clearance|clearance\s+not\s+required|does\s+not\s+require\s+(?:a\s+)?clearance)\b/i;

const PROFILE_OMIT_KEYS = new Set([
	"openaiapikey",
	"deepseekapikey",
	"gmailapppassword",
	"defaultpassword",
	"password",
	"maillabeldefinitions",
	"resumefolderurl",
]);

const PROFILE_OMIT_KEY_RE =
	/(apikey|api_key|apppassword|app_password|password|secret|token|privatekey|private_key)/i;

const PAGE_SYSTEM_PROMPT = `You analyze web pages for job applications. Use the applicant PROFILE JSON for answers. Respond with JSON only.

Return JSON with this exact shape:
{
  "isJobPage": boolean,
  "summary": string,
  "formAnswers": [{ "question": string, "suggestedAnswer": string, "confidence": "high"|"medium"|"low" }],
  "notJobPageReason": string | null
}

Rules:
- isJobPage true for a job posting OR an application form page.
- summary: 2-4 sentence JD summary when isJobPage is true.
- formAnswers: read the FULL page text and list EVERY application question / form prompt you can see (including follow-ups like "If Other…", "If yes, describe…", education, location, visa, LinkedIn, etc.). Answer each using the PROFILE JSON. Do not skip questions that appear only in the page text.
- Form fields list (if present) is only a hint — page text is the source of truth for what to answer.
- For dropdowns, prefer a value that matches listed options when options appear in the text or form hints.
- When a question maps clearly to a profile field, use that value with confidence "high".
- Never invent API keys or passwords. Never leave suggestedAnswer empty.
- notJobPageReason: required when isJobPage is false.`;

function shouldOmitProfileKey(key) {
	const normalized = String(key || "").trim();
	if (!normalized) return true;
	if (PROFILE_OMIT_KEYS.has(normalized.toLowerCase())) return true;
	return PROFILE_OMIT_KEY_RE.test(normalized);
}

function sanitizeProfileForLlm(profile) {
	if (!profile || typeof profile !== "object") return {};
	const out = {};
	for (const [key, value] of Object.entries(profile)) {
		if (shouldOmitProfileKey(key)) continue;
		if (value === undefined || value === null || value === "") continue;
		out[key] = value;
	}
	return out;
}

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
						field.required ? "required: yes" : null,
						field.options?.length ? `options: ${field.options.join(", ")}` : null,
					].filter(Boolean);
					return parts.join(" | ");
				})
				.join("\n")
		: "(none — discover questions from page text)";
}

function buildPageUserPrompt(pageContext, profileJson, sessionContext) {
	const jdSummary = String(sessionContext?.jdSummary ?? "").trim();
	const jdText = String(sessionContext?.jdText ?? "").trim();
	const sessionBits = [];
	if (jdSummary) sessionBits.push(`Remembered JD summary: ${jdSummary}`);
	if (jdText) sessionBits.push(`Remembered JD text:\n${jdText}`);

	return `APPLICANT PROFILE (JSON — use for all answers; secrets already removed):
${profileJson}

${sessionBits.length ? `${sessionBits.join("\n\n")}\n\n` : ""}=== CURRENT PAGE ===
URL: ${pageContext.url}
Title: ${pageContext.title}
Meta: ${pageContext.metaDescription || "(none)"}

Page text (full innerText from page + iframes):
${String(pageContext.visibleText || "")}

Form field hints (optional; page text is authoritative):
${formatFormsText(pageContext)}`;
}

function normalizeFormAnswers(entries) {
	if (!Array.isArray(entries)) return [];
	return entries
		.map((entry) => ({
			question: String(entry?.question ?? "").trim(),
			suggestedAnswer: String(entry?.suggestedAnswer ?? "").trim(),
			confidence: ["high", "medium", "low"].includes(entry?.confidence)
				? entry.confidence
				: "medium",
		}))
		.filter((entry) => entry.question && entry.suggestedAnswer);
}

function extractFlagSentences(text, neededFlags) {
	const body = String(text ?? "").replace(/\s+/g, " ").trim();
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

function buildFlagSystemPrompt(neededFlags) {
	const fields = neededFlags
		.map((flag) =>
			flag === "remote"
				? '  "remote": { "status": "green" | "red", "explanation": string }'
				: '  "clearance": { "status": "green" | "red", "explanation": string }',
		)
		.join(",\n");
	return `You screen a job description for hard constraints. Decide ONLY the requested fields. JSON only.

{
${fields}
}

Rules:
- "red" = disqualifier (onsite/hybrid/relocation for remote; clearance required for clearance-free applicants).
- "green" = constraint satisfied.
- explanation: one short sentence.`;
}

function heuristicFlags(text, neededFlags) {
	const body = String(text || "");
	const result = {};
	const flags = Array.isArray(neededFlags) ? neededFlags : ["remote", "clearance"];

	if (flags.includes("remote")) {
		const matched = extractFlagSentences(body, ["remote"]);
		const hasPositive = REMOTE_POSITIVE.test(body);
		const hasOnsite = FLAG_KEYWORDS.remote.test(body) && !hasPositive;
		if (hasOnsite && matched.length) {
			result.remote = {
				status: "red",
				explanation: matched[0] || "Onsite / hybrid / relocation language found.",
			};
		} else if (hasPositive) {
			result.remote = {
				status: "green",
				explanation: "Remote / WFH language found; no hard onsite requirement detected.",
			};
		} else {
			result.remote = {
				status: "green",
				explanation: "No clear onsite/hybrid/relocation requirement found in page text.",
			};
		}
	}

	if (flags.includes("clearance")) {
		const matched = extractFlagSentences(body, ["clearance"]);
		if (CLEARANCE_NEGATIVE.test(body)) {
			result.clearance = {
				status: "green",
				explanation: "Page states clearance is not required.",
			};
		} else if (FLAG_KEYWORDS.clearance.test(body) && matched.length) {
			result.clearance = {
				status: "red",
				explanation: matched[0] || "Security clearance / investigation language found.",
			};
		} else {
			result.clearance = {
				status: "green",
				explanation: "No clearance / fingerprint / polygraph requirement found.",
			};
		}
	}

	return result;
}

function normalizeVerdict(verdict) {
	if (!verdict || typeof verdict !== "object") return null;
	const status = verdict.status === "red" ? "red" : "green";
	return { status, explanation: String(verdict.explanation ?? "").trim() };
}

/**
 * @returns {{ result: object, usage: object|null, mode: 'llm'|'heuristic' }}
 */
export async function analyzeJobPage({ pageContext, applierName, sessionContext }) {
	if (!pageContext || typeof pageContext !== "object") {
		throw new Error("pageContext is required.");
	}

	const autoBidProfile = await loadDecryptedAutoBidProfile(applierName);
	const profile = autoBidProfile && typeof autoBidProfile === "object" ? autoBidProfile : {};
	const { provider, apiKey, model } = resolveDefaultModel(profile);
	const profileJson = JSON.stringify(sanitizeProfileForLlm(profile), null, 2);

	if (!apiKey) {
		return {
			result: {
				isJobPage: false,
				summary: "LLM unavailable — set an API key on the applier autoBidProfile.",
				formAnswers: [],
				formCount: 0,
				answeredCount: 0,
				pageUrl: pageContext.url,
				pageTitle: pageContext.title,
				applierName: applierName || null,
				notJobPageReason: "No LLM API key on profile.",
			},
			usage: null,
			mode: "heuristic",
		};
	}

	if (profileJson === "{}") {
		return {
			result: {
				isJobPage: false,
				summary: "No autoBidProfile found for this applier in MongoDB.",
				formAnswers: [],
				formCount: 0,
				answeredCount: 0,
				pageUrl: pageContext.url,
				pageTitle: pageContext.title,
				applierName: applierName || null,
				notJobPageReason: "Missing autoBidProfile.",
			},
			usage: null,
			mode: "heuristic",
		};
	}

	const { content, usage } = await chatCompletion({
		provider,
		apiKey,
		model,
		messages: [
			{ role: "system", content: PAGE_SYSTEM_PROMPT },
			{
				role: "user",
				content: buildPageUserPrompt(pageContext, profileJson, sessionContext),
			},
		],
		jsonMode: true,
		cacheKey: "athens-job-bid-page",
		feature: "bid-job-analyze",
		applierName,
	});

	let parsed;
	try {
		parsed = JSON.parse(content);
	} catch {
		throw new Error("LLM returned invalid JSON for page analysis.");
	}

	const formAnswers = normalizeFormAnswers(parsed.formAnswers);

	return {
		result: {
			isJobPage: Boolean(parsed.isJobPage),
			summary: String(parsed.summary ?? "").trim(),
			formAnswers,
			notJobPageReason: parsed.notJobPageReason
				? String(parsed.notJobPageReason).trim()
				: undefined,
			pageUrl: pageContext.url,
			pageTitle: pageContext.title,
			applierName: applierName || null,
			formCount: formAnswers.length,
			answeredCount: formAnswers.length,
			charCount: String(pageContext.visibleText || "").length,
		},
		usage: summarizeUsage(usage, model),
		mode: "llm",
	};
}

/**
 * @returns {{ result: object, usage: object|null, mode: 'llm'|'heuristic' }}
 */
export async function analyzeJobFlags({
	pageContext,
	applierName,
	sessionContext,
	neededFlags = ["remote", "clearance"],
}) {
	if (!pageContext || typeof pageContext !== "object") {
		throw new Error("pageContext is required.");
	}

	const flags = (Array.isArray(neededFlags) ? neededFlags : ["remote", "clearance"]).filter(
		(f) => f === "remote" || f === "clearance",
	);
	if (flags.length === 0) {
		return { result: {}, usage: null, mode: "heuristic" };
	}

	const rememberedJd = String(sessionContext?.jdText ?? "").trim();
	const currentText = String(pageContext.visibleText ?? "").trim();
	const jdBody =
		rememberedJd && rememberedJd.length > currentText.length ? rememberedJd : currentText;

	const profile = (await loadDecryptedAutoBidProfile(applierName)) || {};
	const { provider, apiKey, model } = resolveDefaultModel(profile);

	if (!apiKey) {
		return { result: heuristicFlags(jdBody, flags), usage: null, mode: "heuristic" };
	}

	try {
		const matchedSentences = extractFlagSentences(jdBody, flags);
		const sentencesBlock = matchedSentences.length
			? matchedSentences.map((sentence) => `- ${sentence}`).join("\n")
			: "(no sentences matched the location/clearance keywords)";

		const { content, usage } = await chatCompletion({
			provider,
			apiKey,
			model,
			messages: [
				{ role: "system", content: buildFlagSystemPrompt(flags) },
				{
					role: "user",
					content: `KEYWORD-MATCHED SENTENCES:\n${sentencesBlock}\n\nJOB DESCRIPTION:\n${jdBody}`,
				},
			],
			jsonMode: true,
			cacheKey: "athens-job-bid-flags",
			feature: "bid-job-analyze",
			applierName,
		});

		let parsed;
		try {
			parsed = JSON.parse(content);
		} catch {
			throw new Error("LLM returned invalid JSON for flag analysis.");
		}

		const result = {};
		for (const flag of flags) {
			const verdict = normalizeVerdict(parsed[flag]);
			if (verdict) result[flag] = verdict;
		}
		if (!result.remote && !result.clearance) {
			return { result: heuristicFlags(jdBody, flags), usage: null, mode: "heuristic" };
		}
		return { result, usage: summarizeUsage(usage, model), mode: "llm" };
	} catch (err) {
		console.warn("[bid-job-analyze] flags LLM failed, using heuristic:", err.message);
		return { result: heuristicFlags(jdBody, flags), usage: null, mode: "heuristic" };
	}
}
