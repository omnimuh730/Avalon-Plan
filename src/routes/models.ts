import type { Request, Response } from 'express';
import { DEEPSEEK_MODELS, listOpenAiModels } from '@nextoffer/shared/models';
import { CONFIG } from '../config.js';

export async function modelsHandler(req: Request, res: Response) {
  try {
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') || CONFIG.defaultOpenAiKey;
    let models: { id: string }[] = [];
    if (auth) {
      try {
        const openai = await listOpenAiModels(auth);
        models = openai.map((m: { id: string }) => ({ id: m.id }));
      } catch {
        /* optional */
      }
    }
    models = [...models, ...DEEPSEEK_MODELS.map((id: string) => ({ id }))];
    return res.json({ object: 'list', data: models.map((m) => ({ id: m.id, object: 'model' })) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: { message } });
  }
}
