
import { skillsCategoryCollection } from "../db/mongo.js";
import { buildMongoCaseInsensitiveRegexFilter } from "../utils/safeRegex.js";

export async function getSkillCategories(req, res) {
	try {
		if (!skillsCategoryCollection) return res.status(503).json({ success: false, error: 'Database not ready' });
		const { sort = 'name_asc', page = 1, limit = 30, q = '' } = req.query;
		let sortOption = {};
		if (typeof sort === 'string') {
			const [field, order] = sort.split('_');
			sortOption[field] = order === 'desc' ? -1 : 1;
		} else {
			sortOption.name = 1;
		}
		const pageNum = Math.max(1, parseInt(page, 10) || 1);
		const limitNum = Math.max(1, parseInt(limit, 10) || 30);
		const skip = (pageNum - 1) * limitNum;
		const query = {};
		const nameFilter = buildMongoCaseInsensitiveRegexFilter(q);
		if (nameFilter) query.name = nameFilter;
		const total = await skillsCategoryCollection.countDocuments(query);
		const docs = await skillsCategoryCollection.find(query).sort(sortOption).skip(skip).limit(limitNum).toArray();
		const skills = docs.map(d => d.name);
		return res.json({ success: true, skills, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
	} catch (err) {
		console.error('GET /api/skills-category error', err);
		return res.status(500).json({ success: false, error: err.message });
	}
}
