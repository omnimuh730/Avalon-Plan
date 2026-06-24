import type { Request, Response } from 'express';
import { CONFIG } from '../config.js';
import { routeModel, proxyJson, checkTokenBudget } from '../providers.js';
import { recordUsage, normalizeUsage } from '../usage.js';

/** DeepSeek Responses API passthrough for codex-rs. */
export async function responsesHandler(req: Request, res: Response) {
  try {
    const model = String(req.body?.model || 'deepseek-v4-flash');
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    const runId = String(req.headers['x-run-id'] || '');
    const route = routeModel(model, auth);
    if (!route.apiKey) return res.status(401).json({ error: { message: 'No API key' } });

    checkTokenBudget(runId || undefined, CONFIG.maxTokensPerCall);

    const { res: upstream, data } = await proxyJson(`${route.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${route.apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    if (upstream.ok && data?.usage) {
      const u = normalizeUsage(model, data.usage);
      await recordUsage({
        feature: 'responses',
        runId: runId || undefined,
        model,
        provider: route.provider,
        inputTokens: u.inputTokens,
        cachedTokens: u.cachedTokens,
        outputTokens: u.outputTokens,
        totalTokens: u.totalTokens,
        costUsd: u.costUsd,
        priced: u.priced,
      });
    }

    return res.status(upstream.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: { message } });
  }
}
