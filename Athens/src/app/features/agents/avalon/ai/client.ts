import { AI_BFF_URL, AI_MODEL, ANALYZE_MAX_TOKENS, ANALYZE_TEMPERATURE } from "./config";
import type { ChatRequest, ChatResponse } from "./chat-types";

export async function chatCompletion(request: ChatRequest): Promise<ChatResponse> {
  const model = request.model ?? AI_MODEL;
  const response = await fetch(`${AI_BFF_URL}/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(model ? { model } : {}),
      system: request.system,
      messages: request.messages,
      temperature: request.temperature ?? ANALYZE_TEMPERATURE,
      maxTokens: request.maxTokens ?? ANALYZE_MAX_TOKENS,
      responseSchema: request.responseSchema,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `AI BFF error ${response.status}`);
  }

  return (await response.json()) as ChatResponse;
}
