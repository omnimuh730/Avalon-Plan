# Project Avalon

Remote browser control stack: Chrome extension + controller UI + Socket.io backend.

## Packages

| Package | Description |
|---------|-------------|
| `@avalon/shared` | Shared types, target matching, action definitions |
| `@avalon/backend` | Socket.io relay server |
| `@avalon/frontend` | Remote control dashboard (Vite + React) |
| `@avalon/extension` | Chrome MV3 extension (WXT + React sidebar) |
| `@avalon/ai-bff` | AI kit + BFF for GPT / DeepSeek (chat, schemas, usage pricing) |

## Quick start

```bash
npm install
npm run dev:backend    # http://localhost:3847
npm run dev:frontend   # http://localhost:5173
npm run dev:extension  # loads unpacked extension with HMR
npm run dev:ai-bff     # http://localhost:3920 (copy packages/ai-bff/.env.example → .env)
```

Load the extension from `packages/extension/.output/chrome-mv3` (or the path WXT prints).

For AI field analysis in the controller UI, also start ai-bff and optionally copy `packages/frontend/.env.example` → `.env`.

## Target selector

Targets are matched by **tag**, **properties** (dynamic attribute patterns), and **index** (nth match).

Property patterns use `?` as a single-character wildcard:

| Pattern | Matches |
|---------|---------|
| `?__index__` | `2X6x__index__`, anything ending with `__index__` |
| `?_id_?` | `weioj_id_aiofjio`, `weioj_id_` |

## Socket events

- `register` — join as `extension` or `controller`
- `execute-action` — controller → extension
- `action-result` — extension → controller
- `tabs-update` — extension tab list
- `screenshot-result` — tab screenshot data URL
