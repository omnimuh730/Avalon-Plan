import type { Request, Response } from 'express';
import { DEEPSEEK_ANTHROPIC_BASE_URL } from '@nextoffer/shared/models';
import { CONFIG } from '../config.js';
import { proxyJson, checkTokenBudget } from '../providers.js';
import { recordUsage, normalizeUsage } from '../usage.js';

/** Anthropic-compatible passthrough (DeepSeek) for claude-code. */
export async function anthropicHandler(req: Request, res: Response) {
  try {
    const model = String(req.body?.model || 'deepseek-v4-flash');
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') || process.env.DEEPSEEK_API_KEY || '';
    const runId = String(req.headers['x-run-id'] || '');
    if (!auth) return res.status(401).json({ error: { message: 'No API key' } });

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

    if (upstream.ok && data?.usage) {
      const usage = {
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
        total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
      };
      const u = normalizeUsage(model, usage);
      await recordUsage({
        feature: 'anthropic',
        runId: runId || undefined,
        model,
        provider: 'deepseek',
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
