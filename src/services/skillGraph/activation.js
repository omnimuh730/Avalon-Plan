/**
 * Spreading-activation engine for skill knowledge graph scoring.
 * Tunables live in src/config/graphAndVectorConfig.js (.env).
 */
import {
	getActivationParams,
	getDirectMatchWeights,
	getKgConfidenceDefaultEdgeWeight,
	getRelationMultipliers,
} from '../../config/graphAndVectorConfig.js';

export function edgeKey(from, to) {
	return `${from}->${to}`;
}

export function buildEffectiveWeights(graph, cooccurrence = {}, params) {
	const resolvedParams = params ?? getActivationParams();
	const relationMultiplier = getRelationMultipliers();
	const defaultEdgeWeight = getKgConfidenceDefaultEdgeWeight();
	const weights = {};
	const add = (from, to, w) => {
		const k = edgeKey(from, to);
		weights[k] = Math.max(weights[k] ?? 0, w);
	};

	for (const edge of graph.edges) {
		const mult = relationMultiplier[edge.type] ?? defaultEdgeWeight;
		const base = edge.weight * mult;
		const hebbian = resolvedParams.eta * (cooccurrence[edgeKey(edge.from, edge.to)] ?? 0);
		const effective = Math.min(1, base + hebbian);
		add(edge.from, edge.to, effective);
		add(edge.to, edge.from, effective);
	}

	return weights;
}

export function buildEvidenceVector(items, params) {
	const resolvedParams = params ?? getActivationParams();
	const vector = {};
	const contributors = {};

	for (const item of items) {
		const recency = Math.exp(-resolvedParams.lambda * Math.max(0, item.ageYears ?? 0));
		const raw = (item.proficiency ?? 1) * recency * Math.log(1 + (item.freq ?? 1));
		vector[item.id] = (vector[item.id] ?? 0) + raw;
		contributors[item.id] = [...new Set([...(contributors[item.id] ?? []), ...(item.sources ?? ['user'])])];
	}

	const total = Object.values(vector).reduce((s, v) => s + v, 0);
	if (total > 0) {
		for (const id of Object.keys(vector)) vector[id] /= total;
	}

	return { vector, contributors };
}

export function personalizedPageRank(nodeIds, effectiveWeights, evidence, params) {
	const resolvedParams = params ?? getActivationParams();
	const index = new Map(nodeIds.map((id, i) => [id, i]));
	const n = nodeIds.length;
	const neighbors = Array.from({ length: n }, () => []);
	const outSum = new Float64Array(n);

	for (const [key, w] of Object.entries(effectiveWeights)) {
		const [from, to] = key.split('->');
		const fi = index.get(from);
		const ti = index.get(to);
		if (fi === undefined || ti === undefined || w <= 0) continue;
		neighbors[fi].push({ to: ti, w });
		outSum[fi] += w;
	}

	const e = new Float64Array(n);
	let eTotal = 0;
	for (const id of nodeIds) eTotal += evidence[id] ?? 0;
	if (eTotal > 0) {
		for (let i = 0; i < n; i++) e[i] = (evidence[nodeIds[i]] ?? 0) / eTotal;
	} else {
		for (let i = 0; i < n; i++) e[i] = 1 / n;
	}

	let a = new Float64Array(e);
	let iterations = 0;

	for (let step = 0; step < resolvedParams.maxIterations; step++) {
		const next = new Float64Array(n);
		for (let i = 0; i < n; i++) next[i] = (1 - resolvedParams.alpha) * e[i];

		let dangling = 0;
		for (let i = 0; i < n; i++) {
			if (outSum[i] === 0) {
				dangling += a[i];
				continue;
			}
			const share = (resolvedParams.alpha * a[i]) / outSum[i];
			for (const out of neighbors[i]) {
				next[out.to] += share * out.w;
			}
		}
		if (dangling > 0) {
			for (let i = 0; i < n; i++) next[i] += resolvedParams.alpha * dangling * e[i];
		}

		let diff = 0;
		for (let i = 0; i < n; i++) diff += Math.abs(next[i] - a[i]);
		a = next;
		iterations = step + 1;
		if (diff < resolvedParams.tolerance) break;
	}

	let max = 0;
	for (let i = 0; i < n; i++) max = Math.max(max, a[i]);
	const activation = {};
	for (let i = 0; i < n; i++) {
		activation[nodeIds[i]] = max > 0 ? a[i] / max : 0;
	}

	return { activation, iterations };
}

export function computeActivation(graph, evidenceItems, params) {
	const effectiveWeights = buildEffectiveWeights(graph, {}, params);
	const { vector: evidence } = buildEvidenceVector(evidenceItems, params);
	const nodeIds = graph.nodes.map(n => n.id);
	const { activation, iterations } = personalizedPageRank(nodeIds, effectiveWeights, evidence, params);
	return { activation, iterations, edgeWeights: effectiveWeights };
}

export { getDirectMatchWeights };
