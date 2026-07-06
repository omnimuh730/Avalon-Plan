import type { Request, Response } from 'express';
import { CONFIG } from '../config.js';
import { routeModel, proxyJson } from '../providers.js';

export async function embeddingsHandler(req: Request, res: Response) {
  try {
    const provider = String(req.query.provider || process.env.EMBEDDING_PROVIDER || 'ollama');
    if (provider === 'ollama') {
      const model = String(req.body?.model || CONFIG.embeddingModel);
      const input = req.body?.input;
      console.log(`[llm] route → feature=embeddings provider=ollama model=${model}`);
      const { res: upstream, data } = await proxyJson(`${CONFIG.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: input }),
      });
      if (!upstream.ok) return res.status(upstream.status).json(data);
      const vector = data?.embedding;
      return res.json({
        object: 'list',
        data: [{ object: 'embedding', index: 0, embedding: vector }],
        model,
        usage: { prompt_tokens: 0, total_tokens: 0 },
      });
    }

    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') || CONFIG.defaultOpenAiKey;
    console.log(`[llm] route → feature=embeddings provider=openai model=${String(req.body?.model || '')}`);
    const { res: upstream, data } = await proxyJson('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth}`,
      },
      body: JSON.stringify(req.body),
    });
    return res.status(upstream.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: { message } });
  }
}
