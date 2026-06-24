# Claude Code engine (NextOffer)

Orchestration lives in **connector/** — this folder is a clean engine clone only.

## MCP servers

Configured in `.mcp.json` → `../mcp-servers/` (gmail, playwright).

## LLM traffic

All Anthropic-compatible calls route through **unified-ai-server** (`UNIFIED_AI_URL`, default `http://127.0.0.1:8790`).

## Agent runtime

Playwright apply loop cwd: `../agent-runtime/` (shared with codex plan mode).

## Deploy

Connector invokes `claude` CLI from this directory with generated env. Do not embed Mongo or job data here.
