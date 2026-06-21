import { personalInfoCollection } from '../db/mongo.js';
import {
	listUserGraphs,
	buildUserGraphFromResume,
	ensureDefaultUserGraphFromPersonal,
} from '../services/userKnowledgeGraph/index.js';

export async function listUserGraphsHandler(req, res) {
	try {
		const applierName = String(req.query.applierName || req.query.name || '').trim();
		if (!applierName) {
			return res.status(400).json({ success: false, error: 'applierName query required' });
		}

		let graphs = await listUserGraphs(applierName);

		// Interim: seed a small default graph from personal skills (cap 80 — full catalog is too large).
		if (!graphs.length && personalInfoCollection) {
			const total = await personalInfoCollection.countDocuments();
			if (total > 0 && total <= 500) {
				const personal = await personalInfoCollection
					.find({})
					.project({ name: 1 })
					.limit(80)
					.toArray();
				const skillNames = personal.map((d) => d.name).filter(Boolean);
				if (skillNames.length) {
					await ensureDefaultUserGraphFromPersonal(applierName, skillNames);
					graphs = await listUserGraphs(applierName);
				}
			}
		}

		return res.json({ success: true, applierName, graphs });
	} catch (err) {
		console.error('GET /api/user-graph error', err);
		return res.status(500).json({ success: false, error: err.message });
	}
}

export async function buildUserGraphHandler(req, res) {
	try {
		const { applierName, resumeId, resumeName, skills } = req.body || {};
		if (!applierName?.trim()) {
			return res.status(400).json({ success: false, error: 'applierName is required' });
		}
		if (!Array.isArray(skills) || !skills.length) {
			return res.status(400).json({ success: false, error: 'skills[] is required' });
		}

		const graph = await buildUserGraphFromResume({
			applierName: applierName.trim(),
			resumeId: resumeId || 'default',
			resumeName,
			skills,
		});

		return res.status(201).json({ success: true, graph });
	} catch (err) {
		console.error('POST /api/user-graph/from-resume error', err);
		return res.status(500).json({ success: false, error: err.message });
	}
}
