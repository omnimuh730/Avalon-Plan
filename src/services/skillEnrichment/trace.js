/** Structured console trace for skill graph enrichment (skills array only — never job description). */

function ts() {
	return new Date().toISOString();
}

function clip(value, max = 240) {
	const s = typeof value === 'string' ? value : JSON.stringify(value);
	return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function traceJobAnalysis(event, data = {}) {
	console.log(`[skill-graph][job] ${event}`, JSON.stringify({ at: ts(), ...data }));
}

export function traceSkill(event, data = {}) {
	console.log(`[skill-graph][skill] ${event}`, JSON.stringify({ at: ts(), ...data }));
}

export function traceNeo4j(event, data = {}) {
	console.log(`[skill-graph][neo4j] ${event}`, JSON.stringify({ at: ts(), ...data }));
}

export function traceLlm(event, data = {}) {
	const safe = { ...data };
	if (safe.apiKey) safe.apiKey = '***';
	console.log(`[skill-graph][llm] ${event}`, JSON.stringify({ at: ts(), ...safe }));
}

export function traceCooccurrence(event, data = {}) {
	console.log(`[skill-graph][cooc] ${event}`, JSON.stringify({ at: ts(), ...data }));
}

export function summarizeEnrichmentResults(jobId, jobTitle, rawSkills, results, coocStats = {}, usage = null) {
	const byPath = {};
	for (const r of results) {
		byPath[r.path] = (byPath[r.path] || 0) + 1;
	}
	traceJobAnalysis('enrichment_summary', {
		jobId: String(jobId),
		title: jobTitle || '',
		inputSkills: rawSkills,
		inputCount: rawSkills.length,
		processedCount: results.length,
		byPath,
		llmUsage: usage
			? {
				model: usage.model,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				totalTokens: usage.totalTokens,
				costUsd: usage.cost,
			}
			: null,
		results: results.map(r => ({
			surfaceForm: r.surfaceForm,
			normalizedKey: r.normalizedKey,
			skillId: r.skillId,
			action: r.action,
			path: r.path,
			relationshipCount: r.relationshipCount ?? 0,
		})),
		cooccurrence: coocStats,
	});
}

export { clip };
