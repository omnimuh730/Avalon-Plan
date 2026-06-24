# Agent runtime (playwright-cli project)

Shared working directory for **codex** and **connector** plan/codex modes.

- `AGENTS.md` — command vocabulary
- `runtime/operating_procedure.md` — per-URL apply loop
- `config/` — profile and QA bank
- `scripts/` — preflight, upload, wait_stable

Point connector/codex `workingDir` at this folder.

## Codex provider config

Point codex-rs at unified-ai-server:

```toml
model_provider = "unified_ai"
[model_providers.unified_ai]
name = "Unified AI"
base_url = "http://127.0.0.1:8790/v1"
wire_api = "responses"
env_key = "CODEX_API_KEY"
```
