import { AI_BFF_URL, AI_MODEL } from './config.js';
import type { ChatRequest, ChatResponse } from './chat-types.js';

export async function chatCompletion(request: ChatRequest): Promise<ChatResponse> {
  const model = request.model ?? AI_MODEL;
  const response = await fetch(`${AI_BFF_URL}/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(model ? { model } : {}),
      system: request.system,
      messages: request.messages,
      ...(request.temperature != null ? { temperature: request.temperature } : {}),
      ...(request.maxTokens != null ? { maxTokens: request.maxTokens } : {}),
      responseSchema: request.responseSchema,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `AI BFF error ${response.status}`);
  }

  return (await response.json()) as ChatResponse;
}
