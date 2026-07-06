# NextOffer

Job search, skill matching, and Avalon-powered auto-apply.

```
Athens (UI) ──REST──► Athens-server (jobs, matching, resumes)
Athens (UI) ──Socket.io──► project-avalon relay (Chrome extension controller)
Avalon AI BFF ──► OpenAI / DeepSeek (form analysis)
All other LLM calls ──► unified-ai-server
Matching ──► Redis skill index + MongoDB
```

## Prerequisites

| Tool | Why |
|------|-----|
| **Node.js 20+** | All services |
| **Docker Desktop** | MongoDB + Redis (easiest path) |
| **npm** | Package manager |
| **Chrome** | Avalon extension drives your real browser for auto-apply |

## First-time setup

```bash
cd NextOffer

# 1. Install dependencies (root workspaces + Athens UI + build AI server)
npm run install:all

# 2. Install Avalon packages
cd project-avalon && npm install && cd ..

# 3. Copy env templates
cp .env.example Athens-server/.env
cp Athens/.env.example Athens/.env
cp project-avalon/packages/ai-bff/.env.example project-avalon/packages/ai-bff/.env
# Edit Athens-server/.env — set OPENAI_API_KEY or DEEPSEEK_API_KEY for LLM features
# Edit project-avalon/packages/ai-bff/.env — API keys for form analysis

# 4. Load the Avalon Chrome extension (dev)
cd project-avalon && npm run dev:extension
```

## Start everything (one command)

**Start Docker Desktop first**, then:

```bash
npm start
```

If you use **Homebrew MongoDB + Redis** instead of Docker:

```bash
brew services start mongodb-community
brew services start redis
SKIP_DOCKER=1 npm start
```

`npm start` automatically:

1. **Starts MongoDB + Redis + Qdrant** via Docker
2. **Waits** until ports are reachable
3. **Runs `backfill-job-skills`**
4. **Builds** `unified-ai-server`
5. **Launches** Athens-server, unified-ai-server, Avalon relay, Avalon AI BFF, and Athens UI

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:9030 |
| **Athens-server** | http://localhost:8979 |
| **Unified AI** | http://localhost:8790 |
| **Avalon relay** | http://localhost:3847 |
| **Avalon AI BFF** | http://localhost:3920 |

Press `Ctrl+C` to stop all Node processes.

## Auto-apply workflow

1. Open **Agents → Controller** in Athens
2. Ensure the Avalon extension is connected (green status badge)
3. **Queue Jobs** from posted job sources, or navigate manually in Chrome
4. On a job application page: **Fetch tree** → **Analyze** → **Apply (inject)**

## Run services individually

```bash
npm run infra:up
npm run backfill-job-skills
npm run start:ai
npm run start:athens-server
npm run start:ui
cd project-avalon && npm run dev:backend    # relay :3847
cd project-avalon && npm run dev:ai-bff     # AI :3920
cd project-avalon && npm run dev:extension    # Chrome extension
```

## Project layout

```
NextOffer/
├── Athens/              Frontend (React + Vite)
├── Athens-server/       API, matching, jobs, resumes
├── unified-ai-server/   GPT + DeepSeek gateway
├── project-avalon/      Chrome extension + relay + AI BFF (auto-apply)
└── packages/shared/     Pricing, models, skill-normalize
```

## Troubleshooting

**Relay offline** — Ensure `project-avalon` backend is running (`npm run dev:backend` or `npm start`). If you also run `vender-server` (`npm run bridge`), it must use a port other than **3847** (default **3848**) — that port is reserved for the Avalon relay.

**WebSocket 404 on port 3847** — Another service (usually `vender-server`) is bound to `127.0.0.1:3847` and blocking the relay. Stop it or set `BRIDGE_PORT=3848` in `vender-server/.env`, then reconnect the extension and Athens Controller.

**Extension not connected** — Load the unpacked extension from `project-avalon/packages/extension/.output/chrome-mv3` (after `npm run dev:extension`).

**Best Match shows 0%** — Ensure Redis is up and backfill ran: `npm run backfill-job-skills`.

**Analyze fails** — Set API keys in `project-avalon/packages/ai-bff/.env`.
