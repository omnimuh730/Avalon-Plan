import { API_BASE } from "@/lib/api-base";
import { AI_BFF_URL, ANALYZE_TEMPERATURE } from "./config";
import type { ChatRequest, ChatResponse } from "./chat-types";
import { getProfileApplierName, resolveChatModel } from "./model";

const AGENTS_CHAT_URL = `${API_BASE.replace(/\/$/, "")}/agents/chat`;

export async function chatCompletion(request: ChatRequest): Promise<ChatResponse> {
  const model = resolveChatModel(request.model);
  const applierName = getProfileApplierName();
  const payload = {
    ...(model ? { model } : {}),
    system: request.system,
    messages: request.messages,
    temperature: request.temperature ?? ANALYZE_TEMPERATURE,
    ...(request.maxTokens != null ? { maxTokens: request.maxTokens } : {}),
    responseSchema: request.responseSchema,
  };

  const response = applierName
    ? await fetch(AGENTS_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applierName, ...payload }),
        signal: request.signal,
      })
    : await fetch(`${AI_BFF_URL}/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: request.signal,
      });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `AI request failed (${response.status})`);
  }

  return (await response.json()) as ChatResponse;
}
