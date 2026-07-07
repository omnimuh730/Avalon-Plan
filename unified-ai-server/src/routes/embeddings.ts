import type { Request, Response } from 'express';
import { createLogger } from '@nextoffer/shared/terminal-log';
import { CONFIG } from '../config.js';
import { routeModel, proxyJson } from '../providers.js';
import { recordCallLog } from '../call-log.js';

const log = createLogger('unified-ai');

export async function embeddingsHandler(req: Request, res: Response) {
  const startedAt = Date.now();
  try {
    const provider = String(req.query.provider || process.env.EMBEDDING_PROVIDER || 'ollama');
    if (provider === 'ollama') {
      const model = String(req.body?.model || CONFIG.embeddingModel);
      const input = req.body?.input;
      log.llm({ msg: 'route embeddings', feature: 'embeddings', provider: 'ollama', requestedModel: model });
      const { res: upstream, data } = await proxyJson(`${CONFIG.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: input }),
      });
      const elapsedMs = Date.now() - startedAt;
      if (!upstream.ok) return res.status(upstream.status).json(data);
      const vector = data?.embedding;
      const response = {
        object: 'list',
        data: [{ object: 'embedding', index: 0, embedding: vector }],
        model,
        usage: { prompt_tokens: 0, total_tokens: 0 },
      };
      await recordCallLog({
        req,
        requestedModel: model,
        billedModel: model,
        provider: 'ollama',
        rawUsage: response.usage,
        durationMs: elapsedMs,
        success: true,
        httpStatus: 200,
        feature: 'embeddings',
        path: '/v1/embeddings',
      });
      return res.json(response);
    }

    const requestedModel = String(req.body?.model || '');
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') || CONFIG.defaultOpenAiKey;
    log.llm({ msg: 'route embeddings', feature: 'embeddings', provider: 'openai', requestedModel });
    const { res: upstream, data } = await proxyJson('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth}`,
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
        provider: 'openai',
        rawUsage: data.usage,
        durationMs: elapsedMs,
        success: upstream.ok,
        httpStatus: upstream.status,
        feature: 'embeddings',
        path: '/v1/embeddings',
      });
    }
    return res.status(upstream.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: { message } });
  }
}
