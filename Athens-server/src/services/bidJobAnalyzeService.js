/**
 * Bid job page + Remote/Clearance analysis (ported from vender-server bridge).
 * Uses Athens LLM gateway + applier autoBidProfile keys.
 */
import { chatCompletion, resolveDefaultModel, summarizeUsage } from "./llm/llmService.js";
import { loadDecryptedAutoBidProfile } from "./autoBidProfileSecrets.js";
import { personalInfoCollection } from "../db/mongo.js";

const FLAG_KEYWORDS = {
	remote:
		/\b(in[\s-]?person|on[\s-]?site|hybrid|relocat\w*|travel|in[\s-]?office|on[\s-]?campus|office)\b/i,
	clearance:
		/\b(clearance|fingerprint\w*|polygraph|security[\s-]?clearance|background\s+(?:check|investigation)|secret|ts\/sci)\b/i,
};

const REMOTE_POSITIVE = /\b(remote|work\s+from\s+home|wfh|fully\s+remote|100%\s+remote)\b/i;
const CLEARANCE_NEGATIVE =
	/\b(no\s+(?:security\s+)?clearance|clearance\s+not\s+required|does\s+not\s+require\s+(?:a\s+)?clearance)\b/i;

const PAGE_SYSTEM_PROMPT = `You analyze web pages for job applications. Respond with JSON only.

Return JSON with this exact shape:
{
  "isJobPage": boolean,
  "summary": string,
  "formAnswers": [{ "question": string, "suggestedAnswer": string, "confidence": "high"|"medium"|"low" }],
  "notJobPageReason": string | null
}

Rules:
- Set isJobPage true only if this looks like a job posting or job application page.
- summary: 2-4 sentence JD summary when isJobPage is true; otherwise brief explanation.
- formAnswers: suggest concise answers for detected application questions when isJobPage is true; otherwise return [].
- notJobPageReason: required when isJobPage is false.`;

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
		: "(no form fields detected)";
}

function buildPageUserPrompt(pageContext, profileBlock, sessionContext) {
	const jdSummary = String(sessionContext?.jdSummary ?? "").trim();
	const jdText = String(sessionContext?.jdText ?? "").trim();
	const sessionBits = [];
	if (jdSummary) sessionBits.push(`Remembered JD summary: ${jdSummary}`);
	if (jdText) sessionBits.push(`Remembered JD text:\n${jdText.slice(0, 6000)}`);

	return `APPLICANT PROFILE
${profileBlock || "(none)"}

${sessionBits.length ? `${sessionBits.join("\n\n")}\n\n` : ""}=== CURRENT PAGE ===
URL: ${pageContext.url}
Title: ${pageContext.title}
Meta: ${pageContext.metaDescription || "(none)"}

Page text:
${String(pageContext.visibleText || "").slice(0, 12000)}

Form fields:
${formatFormsText(pageContext)}`;
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

function heuristicPage(pageContext) {
	const text = String(pageContext.visibleText || "").trim();
	const title = String(pageContext.title || "");
	const url = String(pageContext.url || "");
	const looksLikeJob =
		text.length > 200 ||
		/job|engineer|apply|greenhouse|lever|workday/i.test(`${title} ${url}`);
	const summary = looksLikeJob
		? text
				.split(/(?<=[.!?])\s+/)
				.filter(Boolean)
				.slice(0, 3)
				.join(" ")
				.slice(0, 600) || title
		: `Does not look like a job page (${title || url}).`;
	return {
		isJobPage: looksLikeJob,
		summary,
		formAnswers: [],
		notJobPageReason: looksLikeJob ? undefined : "Insufficient job-related text on page.",
		pageUrl: pageContext.url,
		pageTitle: pageContext.title,
	};
}

async function loadProfileBlock(applierName) {
	const profile = await loadDecryptedAutoBidProfile(applierName, {
		autoBidProfile: 1,
		name: 1,
	});
	let skillsLine = "";
	if (personalInfoCollection && applierName) {
		try {
			const pi = await personalInfoCollection.findOne(
				{ name: { $regex: new RegExp(`^${String(applierName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
				{ projection: { skills: 1, fullName: 1 } },
			);
			if (Array.isArray(pi?.skills) && pi.skills.length) {
				skillsLine = `Skills: ${pi.skills.slice(0, 40).join(", ")}`;
			}
		} catch {
			/* ignore */
		}
	}
	const p = profile || {};
	const parts = [
		p.fullName ? `Name: ${p.fullName}` : applierName ? `Name: ${applierName}` : null,
		p.email ? `Email: ${p.email}` : null,
		p.phone ? `Phone: ${p.phone}` : null,
		p.location ? `Location: ${p.location}` : null,
		skillsLine || null,
	].filter(Boolean);
	return { profile: p, profileBlock: parts.join("\n") || "(none)" };
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

	const { profile, profileBlock } = await loadProfileBlock(applierName);
	const { provider, apiKey, model } = resolveDefaultModel(profile);

	if (!apiKey) {
		const result = heuristicPage(pageContext);
		result.applierName = applierName || null;
		return { result, usage: null, mode: "heuristic" };
	}

	try {
		const { content, usage } = await chatCompletion({
			provider,
			apiKey,
			model,
			messages: [
				{ role: "system", content: PAGE_SYSTEM_PROMPT },
				{
					role: "user",
					content: buildPageUserPrompt(pageContext, profileBlock, sessionContext),
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

		const result = {
			isJobPage: Boolean(parsed.isJobPage),
			summary: String(parsed.summary ?? "").trim(),
			formAnswers: Array.isArray(parsed.formAnswers)
				? parsed.formAnswers
						.map((entry) => ({
							question: String(entry?.question ?? "").trim(),
							suggestedAnswer: String(entry?.suggestedAnswer ?? "").trim(),
							confidence: ["high", "medium", "low"].includes(entry?.confidence)
								? entry.confidence
								: "medium",
						}))
						.filter((entry) => entry.question && entry.suggestedAnswer)
				: [],
			notJobPageReason: parsed.notJobPageReason
				? String(parsed.notJobPageReason).trim()
				: undefined,
			pageUrl: pageContext.url,
			pageTitle: pageContext.title,
			applierName: applierName || null,
		};

		return { result, usage: summarizeUsage(usage, model), mode: "llm" };
	} catch (err) {
		console.warn("[bid-job-analyze] page LLM failed, using heuristic:", err.message);
		const result = heuristicPage(pageContext);
		result.applierName = applierName || null;
		return { result, usage: null, mode: "heuristic" };
	}
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

	const { profile } = await loadProfileBlock(applierName);
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
					content: `KEYWORD-MATCHED SENTENCES:\n${sentencesBlock}\n\nJOB DESCRIPTION EXCERPT:\n${jdBody.slice(0, 6000)}`,
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
