import { randomUUID } from 'node:crypto';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { buildCallLogEntry, tokensToRawUsage } from '@nextoffer/shared/ai-usage';
import { createLogger } from '@nextoffer/shared/terminal-log';
import { calculateCost, resolveModelPricing, listModels } from './pricing.js';
import type {
  AiKitConfig,
  ChatMessageInput,
  ChatRequest,
  ChatResponse,
  ModelInfo,
} from './types.js';
import { normalizeApiKey } from './api-keys.js';
import type { AiProvider } from './providers/base.js';
import { createProviders, resolveProvider } from './providers/registry.js';
import { getRecordCallLog } from './db.js';

const log = createLogger('ai-bff');

export class AiKit {
  private readonly config: AiKitConfig;
  private readonly providers: AiProvider[];

  constructor(config: AiKitConfig = {}) {
    this.config = config;
    this.providers = createProviders(config);
  }

  listModels(): ModelInfo[] {
    return listModels().filter((model) => {
      const provider = this.providers.find((p) => p.id === model.provider);
      return provider?.isConfigured();
    });
  }

  getConfiguredProviders(): string[] {
    return this.providers.filter((p) => p.isConfigured()).map((p) => p.id);
  }

  getDefaultModel(): string {
    return this.config.defaultModel ?? 'gpt-4o-mini';
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const requestedModel = request.model ?? this.config.defaultModel ?? 'gpt-4o-mini';
    const requestId = request.requestId || randomUUID();
    const providers = request.apiKeys
      ? createProviders({
          ...this.config,
          openaiApiKey:
            normalizeApiKey(request.apiKeys.openai) ?? this.config.openaiApiKey,
          deepseekApiKey:
            normalizeApiKey(request.apiKeys.deepseek) ?? this.config.deepseekApiKey,
        })
      : this.providers;
    const provider = resolveProvider(providers, requestedModel);
    const pricing = resolveModelPricing(requestedModel);

    if (request.responseSchema && !pricing.supportsStructuredOutput) {
      throw new Error(`Model "${requestedModel}" does not support structured output schemas`);
    }

    const hasImages = request.messages.some((m) => m.images?.length);
    if (hasImages && !pricing.supportsVision) {
      throw new Error(`Model "${requestedModel}" does not support image input`);
    }

    const messages = buildMessages(request);
    const promptChars = messages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
    const startedAt = Date.now();
    const feature = request.feature || 'ai-bff-chat';

    log.llm({
      msg: 'chat started',
      requestId,
      feature,
      provider: provider.id,
      requestedModel,
      runId: request.runId,
      applierName: request.applierName,
      messageCount: messages.length,
      promptChars,
    });

    let result;
    try {
      result = await provider.chat({
        model: requestedModel,
        messages,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        topP: request.topP,
        stop: request.stop,
        tools: request.tools,
        toolChoice: request.toolChoice,
        responseSchema: request.responseSchema,
        stream: request.stream,
      });
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      log.error('llm', 'chat failed', {
        requestId,
        feature,
        provider: provider.id,
        requestedModel,
        durationMs: elapsedMs,
        error: message,
      });
      throw err;
    }

    const elapsedMs = Date.now() - startedAt;
    const billedModel = result.model || requestedModel;
    const tokenUsage = {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      cachedTokens: result.cachedTokens,
    };
    const usage = {
      ...tokenUsage,
      cost: calculateCost(billedModel, tokenUsage),
    };

    const callLogEntry = buildCallLogEntry({
      requestId,
      service: 'ai-bff',
      feature,
      provider: provider.id,
      requestedModel,
      billedModel,
      rawUsage: tokensToRawUsage(tokenUsage),
      durationMs: elapsedMs,
      success: true,
      runId: request.runId,
      applierName: request.applierName,
      jobId: request.jobId,
      path: '/v1/chat',
    });

    try {
      await getRecordCallLog()(callLogEntry);
    } catch (recordErr) {
      const message = recordErr instanceof Error ? recordErr.message : String(recordErr);
      log.warn('mongo', 'llm_call_log write failed', { requestId, error: message });
    }

    log.llm({
      msg: 'chat completed',
      requestId,
      feature,
      provider: provider.id,
      requestedModel,
      billedModel,
      inputTokens: usage.promptTokens,
      cachedInputTokens: usage.cachedTokens ?? 0,
      outputTokens: usage.completionTokens,
      costUsd: usage.cost.totalUsd,
      durationMs: elapsedMs,
      runId: request.runId,
      applierName: request.applierName,
      modelMismatch: requestedModel !== billedModel,
    });

    return {
      id: result.id,
      requestId,
      requestedModel,
      billedModel,
      modelMismatch: requestedModel !== billedModel,
      provider: provider.id,
      model: billedModel,
      content: result.content,
      structured: result.structured,
      finishReason: result.finishReason,
      toolCalls: result.toolCalls,
      usage,
      raw: result.raw,
    };
  }
}

function buildMessages(request: ChatRequest): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];

  const hasSystem = request.messages.some((m) => m.role === 'system');
  if (request.system && !hasSystem) {
    out.push({ role: 'system', content: request.system });
  }

  for (const message of request.messages) {
    out.push(convertMessage(message));
  }

  return out;
}

function convertMessage(message: ChatMessageInput): ChatCompletionMessageParam {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.toolCallId ?? '',
    };
  }

  if (message.role === 'assistant') {
    return { role: 'assistant', content: message.content, name: message.name };
  }

  if (message.role === 'system') {
    return { role: 'system', content: message.content, name: message.name };
  }

  if (message.images?.length) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: message.content },
        ...message.images.map((image) => ({
          type: 'image_url' as const,
          image_url: {
            url: image.url,
            detail: image.detail ?? 'auto',
          },
        })),
      ],
    };
  }

  return { role: 'user', content: message.content, name: message.name };
}

export function createAiKit(config?: AiKitConfig): AiKit {
  return new AiKit(config);
}
