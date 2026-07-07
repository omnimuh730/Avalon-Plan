import type { Request, Response } from 'express';
import { createLogger } from '@nextoffer/shared/terminal-log';
import { CONFIG } from '../config.js';
import { routeModel, proxyJson, checkTokenBudget } from '../providers.js';
import { recordCallLog } from '../call-log.js';

const log = createLogger('unified-ai');

export async function chatCompletionsHandler(req: Request, res: Response) {
  const startedAt = Date.now();
  try {
    const requestedModel = String(req.body?.model || '');
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    const runId = String(req.headers['x-run-id'] || req.body?.run_id || '');
    const feature = String(req.headers['x-feature'] || req.body?.feature || 'chat');

    const route = routeModel(requestedModel, auth);
    if (!route.apiKey) {
      return res.status(401).json({ error: { message: `No API key for ${route.provider}` } });
    }

    log.llm({
      msg: 'route chat',
      feature,
      provider: route.provider,
      requestedModel,
      runId: runId || undefined,
    });

    checkTokenBudget(runId || undefined, CONFIG.maxTokensPerCall);

    const { res: upstream, data } = await proxyJson(`${route.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${route.apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    const elapsedMs = Date.now() - startedAt;
    const billedModel = String(data?.model || requestedModel);

    if (data?.usage) {
      await recordCallLog({
        req,
        requestedModel,
        billedModel,
        provider: route.provider,
        rawUsage: data.usage,
        durationMs: elapsedMs,
        success: upstream.ok,
        httpStatus: upstream.status,
        error: upstream.ok ? undefined : data?.error?.message || 'upstream error',
        feature,
        path: '/v1/chat/completions',
      });
    } else if (!upstream.ok) {
      await recordCallLog({
        req,
        requestedModel,
        billedModel,
        provider: route.provider,
        rawUsage: {},
        durationMs: elapsedMs,
        success: false,
        httpStatus: upstream.status,
        error: data?.error?.message || 'upstream error',
        feature,
        path: '/v1/chat/completions',
      });
    }

    return res.status(upstream.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: { message } });
  }
}
