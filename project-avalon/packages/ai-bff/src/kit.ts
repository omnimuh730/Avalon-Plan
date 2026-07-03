import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { calculateCost, resolveModelPricing, listModels } from './pricing.js';
import type {
  AiKitConfig,
  ChatMessageInput,
  ChatRequest,
  ChatResponse,
  ModelInfo,
} from './types.js';
import type { AiProvider } from './providers/base.js';
import { createProviders, resolveProvider } from './providers/registry.js';

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
    const model = request.model ?? this.config.defaultModel ?? 'gpt-4o-mini';
    const provider = resolveProvider(this.providers, model);
    const pricing = resolveModelPricing(model);

    if (request.responseSchema && !pricing.supportsStructuredOutput) {
      throw new Error(`Model "${model}" does not support structured output schemas`);
    }

    const hasImages = request.messages.some((m) => m.images?.length);
    if (hasImages && !pricing.supportsVision) {
      throw new Error(`Model "${model}" does not support image input`);
    }

    const messages = buildMessages(request);
    const promptChars = messages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
    const startedAt = Date.now();
    console.log(`[llm] → ai-bff · ${provider.id}/${model} — ${messages.length} msg (${promptChars} chars)`);

    let result;
    try {
      result = await provider.chat({
        model,
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
      console.error(`[llm] ✖ ai-bff · ${provider.id}/${model} — failed after ${elapsedMs}ms: ${message}`);
      throw err;
    }

    const elapsedMs = Date.now() - startedAt;
    const usage = {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      cost: calculateCost(model, {
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
      }),
    };
    console.log(
      `[llm] ← ai-bff · ${provider.id}/${model} — in ${usage.promptTokens} out ${usage.completionTokens} · $${usage.cost.totalUsd.toFixed(4)} · ${elapsedMs}ms`,
    );

    return {
      id: result.id,
      provider: provider.id,
      model: result.model,
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
