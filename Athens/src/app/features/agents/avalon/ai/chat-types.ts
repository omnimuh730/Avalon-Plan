export interface JsonSchemaDefinition {
  name: string;
  description?: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface ChatRequest {
  model?: string;
  system?: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  responseSchema?: JsonSchemaDefinition;
  /** Abort the request when the caller's run is stopped (auto-run Stop). */
  signal?: AbortSignal;
}

export interface ChatResponse {
  structured?: {
    fields?: Array<Record<string, unknown>> | Array<{ id: string; script: string }>;
    script?: string;
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: { totalUsd: number; currency: string };
  };
}
