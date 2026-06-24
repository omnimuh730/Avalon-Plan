# NextOffer

Job search, skill matching, and agentic auto-apply platform.

```
Athens (UI) ──REST──► Athens-server (jobs, matching, resumes)
Athens (UI) ──Socket.io──► connector (agent runs)
All LLM calls ──► unified-ai-server ──► OpenAI / DeepSeek
Matching ──► Redis skill index + MongoDB
```

## Prerequisites

| Tool | Why |
|------|-----|
| **Node.js 20+** | All services |
| **Docker Desktop** | MongoDB + Redis (easiest path) |
| **npm** | Package manager |

Optional (for agent auto-apply): Python 3, `codex-rs` build, Chrome profile for Gmail OTP.

## First-time setup

```bash
cd NextOffer

# 1. Install dependencies (root workspaces + Athens UI + build AI server)
npm run install:all

# 2. Copy env templates
cp .env.example Athens-server/.env
cp .env.example connector/.env
# Edit Athens-server/.env — at minimum set OPENAI_API_KEY or DEEPSEEK_API_KEY if you use LLM features

cp Athens/.env.example Athens/.env
# Ensure VITE_CONNECTOR_URL=http://127.0.0.1:8781
```

## Start everything (one command)

```bash
npm start
```

`npm start` automatically:

1. **Starts MongoDB + Redis** via Docker (`Athens-server/docker-compose.yml`)
2. **Waits** until both ports are reachable (`27017`, `6379`)
3. **Runs `backfill-job-skills`** — normalizes job skills in Mongo + rebuilds the Redis inverted index (mandatory for Best Match)
4. **Builds** `unified-ai-server` (TypeScript → `dist/`)
5. **Launches** all dev services in parallel

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:5173 |
| **Athens-server** | http://localhost:7979 |
| **Unified AI** | http://localhost:8790 |
| **Connector** | http://localhost:8781 |

Press `Ctrl+C` to stop all Node processes. Docker containers keep running until you run `npm run infra:down`.

## Infrastructure only (manual)

If you prefer to start databases yourself:

```bash
# Start MongoDB + Redis
npm run infra:up

# Watch logs
npm run infra:logs

# Stop
npm run infra:down
```

### What Docker starts

Defined in `Athens-server/docker-compose.yml`:

| Container | Port | Purpose |
|-----------|------|---------|
| **mongodb** | `27017` | Primary database (`AthensDB`) |
| **redis** | `6379` | Skill inverted index + profile skill cache |

Optional services in the same compose file (not started by `npm start`):

| Container | Port | Purpose |
|-----------|------|---------|
| qdrant | `6333` | Optional “similar jobs” vectors |
| ollama | `11434` | Optional local embeddings |

### Without Docker (macOS Homebrew)

```bash
brew install mongodb-community redis
brew services start mongodb-community
brew services start redis
```

Then set in `Athens-server/.env`:

```
MONGO_URL=mongodb://127.0.0.1:27017
REDIS_URL=redis://127.0.0.1:6379
```

## Run services individually

```bash
npm run infra:up                    # Mongo + Redis
npm run backfill-job-skills         # Skill index (also runs on every npm start)
npm run start:ai                    # unified-ai-server :8790
npm run start:athens-server         # Athens-server :7979
npm run start:connector             # connector :8781
npm run start:ui                    # Athens Vite :5173
```

## Project layout

```
NextOffer/
├── Athens/              Frontend (React + Vite)
├── Athens-server/       API, matching, jobs, resumes
├── unified-ai-server/   GPT + DeepSeek gateway
├── connector/           Socket.io agent orchestrator
├── agent-runtime/       Playwright apply scripts (shared cwd)
├── mcp-servers/         Gmail, Playwright MCP configs
├── codex/               codex-rs engine
├── claude-code/         Claude Code engine
└── packages/shared/     Pricing, models, skill-normalize
```

## Git monorepo (subtree)

This repo is a **monorepo** that contains former independent git projects as **subtree prefixes**. Upstream remotes:

| Prefix | Upstream remote | Branch |
|--------|-----------------|--------|
| `Athens/` | `https://github.com/omnimuh730/Athens.git` | `master` |
| `Athens-server/` | `https://github.com/omnimuh730/Athens-server.git` | `master` |
| `codex/` | *(local — no published remote)* | `main` |
| `claude-code/` | *(local — no published remote)* | `main` |

### Push subtree changes back to upstream

```bash
git subtree push --prefix=Athens athens-upstream master
git subtree push --prefix=Athens-server athens-server-upstream master
```

### Pull upstream updates

```bash
git subtree pull --prefix=Athens athens-upstream master --squash
git subtree pull --prefix=Athens-server athens-server-upstream master --squash
```

Remotes are registered as `athens-upstream` and `athens-server-upstream` (see `scripts/git-subtree-remotes.sh`).

## Troubleshooting

**`docker: command not found`** — Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and ensure it is running.

**`Timed out waiting for MongoDB`** — Run `npm run infra:logs`. First Mongo start can take 30–60s.

**Best Match shows 0% for everything** — Ensure Redis is up and backfill ran: `npm run backfill-job-skills`.

**Agent runs don't stream** — Check `VITE_CONNECTOR_URL` in `Athens/.env` points to `http://127.0.0.1:8781`.

**Unified AI 502** — Set `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` in `connector/.env` and `Athens-server/.env`.
