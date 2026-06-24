import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  port: Number(process.env.PORT || 8790),
  mongoUri: process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  mongoDb: process.env.MONGO_DB || 'AthensDB',
  defaultOpenAiKey: process.env.OPENAI_API_KEY || '',
  defaultDeepSeekKey: process.env.DEEPSEEK_API_KEY || '',
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  embeddingModel: process.env.EMBEDDING_MODEL || 'mxbai-embed-large',
  maxTokensPerRun: Number(process.env.AI_MAX_TOKENS_PER_RUN || 500_000),
  maxTokensPerCall: Number(process.env.AI_MAX_TOKENS_PER_CALL || 100_000),
};
