# @avalon/ai-bff

AI kit and BFF for **OpenAI GPT** and **DeepSeek** models. Use as an HTTP service or import `AiKit` in your own code.

## Setup

```bash
cp .env.example .env
# Set OPENAI_API_KEY and/or DEEPSEEK_API_KEY
npm run dev -w @avalon/ai-bff
```

## HTTP endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness + configured providers |
| GET | `/v1/models` | Model catalog with pricing |
| POST | `/v1/chat` | Primary chat API (see below) |
| POST | `/v1/chat/completions` | OpenAI-compatible alias |
| POST | `/v1/estimate` | Rough token + cost estimate |

### POST `/v1/chat`

```json
{
  "model": "gpt-4o-mini",
  "system": "You are a helpful assistant.",
  "messages": [
    { "role": "user", "content": "Summarize this form field." }
  ],
  "responseSchema": {
    "name": "field_summary",
    "schema": {
      "type": "object",
      "properties": {
        "label": { "type": "string" },
        "controlType": { "type": "string" }
      },
      "required": ["label", "controlType"],
      "additionalProperties": false
    },
    "strict": true
  },
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "click_target",
        "description": "Click a form control",
        "parameters": {
          "type": "object",
          "properties": { "target": { "type": "string" } },
          "required": ["target"]
        }
      }
    }
  ],
  "temperature": 0.2,
  "maxTokens": 1024
}
```

**Vision** — attach images on a user message:

```json
{
  "role": "user",
  "content": "What is in this screenshot?",
  "images": [
    { "url": "data:image/png;base64,...", "detail": "auto" }
  ]
}
```

### Response

Every completion includes token usage and USD cost:

```json
{
  "id": "chatcmpl-...",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "content": "...",
  "structured": { "label": "Email", "controlType": "text" },
  "usage": {
    "promptTokens": 120,
    "completionTokens": 40,
    "totalTokens": 160,
    "cost": {
      "promptUsd": 0.000018,
      "completionUsd": 0.000024,
      "totalUsd": 0.000042,
      "currency": "USD",
      "rates": { "promptPer1M": 0.15, "completionPer1M": 0.6 }
    }
  }
}
```

## Programmatic usage

```ts
import { createAiKit } from '@avalon/ai-bff';

const kit = createAiKit({
  openaiApiKey: process.env.OPENAI_API_KEY,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
});

const result = await kit.chat({
  model: 'deepseek-v4-flash',
  system: 'You classify form controls.',
  messages: [{ role: 'user', content: 'Button labeled Submit' }],
});

console.log(result.usage.cost.totalUsd);
```

## Supported models

- **OpenAI:** `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-3.5-turbo`
- **DeepSeek:** `deepseek-v4-flash` (recommended), `deepseek-reasoner` — `deepseek-chat` is deprecated

Pricing rates are defined in `src/pricing.ts` (USD per 1M tokens).
