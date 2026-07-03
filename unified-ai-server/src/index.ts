import { installTerminalLogger } from '@nextoffer/shared/terminal-log';

installTerminalLogger('unified-ai');

import express from 'express';
import cors from 'cors';
import { CONFIG } from './config.js';
import { initDb } from './db.js';
import { chatCompletionsHandler } from './routes/chat.js';
import { responsesHandler } from './routes/responses.js';
import { anthropicHandler } from './routes/anthropic.js';
import { embeddingsHandler } from './routes/embeddings.js';
import { modelsHandler } from './routes/models.js';
import { usageHandler } from './routes/usageRoute.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'unified-ai-server' }));

app.post('/v1/chat/completions', chatCompletionsHandler);
app.post('/v1/responses', responsesHandler);
app.post('/anthropic/v1/messages', anthropicHandler);
app.post('/v1/embeddings', embeddingsHandler);
app.get('/v1/models', modelsHandler);
app.get('/v1/usage', usageHandler);

async function main() {
  await initDb();
  app.listen(CONFIG.port, () => {
    console.log(`unified-ai-server listening on http://127.0.0.1:${CONFIG.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
