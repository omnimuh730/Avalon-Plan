# MCP Servers

Isolated MCP servers for NextOffer agents.

## gmail/

Python MCP for Gmail IMAP + OTP extraction. Ported from legacy `codex/mcps/gmail`.

```bash
cd mcp-servers/gmail
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

## Engine `.mcp.json` files

- `claude-code/.mcp.json` — gmail + playwright
- `codex/.mcp.json` — gmail + playwright (same paths)

## browser-use/

Placeholder for browser-use MCP integration. Configure when browser-use package is installed:

```json
{
  "mcpServers": {
    "browser-use": {
      "command": "browser-use-mcp",
      "args": []
    }
  }
}
```
