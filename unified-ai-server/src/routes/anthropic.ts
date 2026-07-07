import type { Request, Response } from 'express';
import { DEEPSEEK_ANTHROPIC_BASE_URL } from '@nextoffer/shared/models';
import { createLogger } from '@nextoffer/shared/terminal-log';
import { CONFIG } from '../config.js';
import { proxyJson, checkTokenBudget } from '../providers.js';
import { recordCallLog } from '../call-log.js';

const log = createLogger('unified-ai');

/** Anthropic-compatible passthrough (DeepSeek) for claude-code. */
export async function anthropicHandler(req: Request, res: Response) {
  const startedAt = Date.now();
  try {
    const requestedModel = String(req.body?.model || 'deepseek-v4-flash');
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') || process.env.DEEPSEEK_API_KEY || '';
    const runId = String(req.headers['x-run-id'] || '');
    if (!auth) return res.status(401).json({ error: { message: 'No API key' } });

    log.llm({ msg: 'route anthropic', feature: 'anthropic', provider: 'deepseek', requestedModel, runId: runId || undefined });

    checkTokenBudget(runId || undefined, CONFIG.maxTokensPerCall);

    const { res: upstream, data } = await proxyJson(`${DEEPSEEK_ANTHROPIC_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': auth,
        'anthropic-version': req.headers['anthropic-version'] as string || '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const elapsedMs = Date.now() - startedAt;
    const billedModel = String(data?.model || requestedModel);

    if (upstream.ok && data?.usage) {
      const usage = {
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
        total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
      };
      await recordCallLog({
        req,
        requestedModel,
        billedModel,
        provider: 'deepseek',
        rawUsage: usage,
        durationMs: elapsedMs,
        success: true,
        httpStatus: upstream.status,
        feature: 'anthropic',
        path: '/anthropic/v1/messages',
      });
    }

    return res.status(upstream.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: { message } });
  }
}
