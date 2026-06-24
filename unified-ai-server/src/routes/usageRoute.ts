import type { Request, Response } from 'express';
import { aggregateUsage } from '../usage.js';

export async function usageHandler(req: Request, res: Response) {
  try {
    const feature = req.query.feature ? String(req.query.feature) : undefined;
    const runId = req.query.runId ? String(req.query.runId) : undefined;
    const sinceDays = Number(req.query.sinceDays || 0);
    const since = sinceDays > 0 ? new Date(Date.now() - sinceDays * 86400000) : undefined;
    const stats = await aggregateUsage({ feature, runId, since });
    return res.json({ success: true, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
}
