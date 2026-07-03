import type { Request, Response } from 'express';
import { CONFIG } from '../config.js';
import { routeModel, proxyJson, checkTokenBudget } from '../providers.js';
import { recordUsage, normalizeUsage } from '../usage.js';

export async function chatCompletionsHandler(req: Request, res: Response) {
  try {
    const model = String(req.body?.model || '');
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    const runId = String(req.headers['x-run-id'] || req.body?.run_id || '');
    const feature = String(req.headers['x-feature'] || req.body?.feature || 'chat');

    const route = routeModel(model, auth);
    if (!route.apiKey) {
      return res.status(401).json({ error: { message: `No API key for ${route.provider}` } });
    }

    console.log(`[llm] route → feature=${feature} provider=${route.provider} model=${model}${runId ? ` run=${runId}` : ''}`);

    checkTokenBudget(runId || undefined, CONFIG.maxTokensPerCall);

    const { res: upstream, data } = await proxyJson(`${route.baseUrl}/chat/completions`, {
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
        feature,
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
