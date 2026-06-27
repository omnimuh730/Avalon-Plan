import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

export const PATHS = {
  connector: path.resolve(__dirname, ".."),
  engines: __dirname,
  core: path.resolve(__dirname, "../core"),
  codex: path.resolve(ROOT, "codex"),
  agentRuntime: path.resolve(ROOT, "agent-runtime"),
  mcpServers: path.resolve(ROOT, "mcp-servers"),
  claudeCode: path.resolve(ROOT, "claude-code"),
  hermesAgent: path.resolve(ROOT, "hermes-agent"),
  unifiedAi: (process.env.UNIFIED_AI_URL || "http://127.0.0.1:8790").replace(/\/$/, ""),
  codexBin: path.resolve(ROOT, "codex/codex-rs/target/release/codex"),
  gmailOtp: path.resolve(ROOT, "mcp-servers/gmail/otp_fetch.py"),
  envFile: path.resolve(ROOT, "connector/.env"),
};

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

const localEnv = parseEnvFile(PATHS.envFile);

function env(key, fallback = "") {
  return process.env[key] || localEnv[key] || fallback;
}

export const CONFIG = {
  port: Number(env("PORT", "8781")),
  mongoUri: env("MONGODB_URI", env("MONGO_URL", "mongodb://127.0.0.1:27017")),
  mongoDb: env("MONGODB_DB", "AthensDB"),
  openaiApiKey: env("OPENAI_API_KEY"),
  deepseekApiKey: env("DEEPSEEK_API_KEY"),
  openaiModel: env("OPENAI_MODEL", "deepseek-v4-flash"),
  codexBin: env("CODEX_BIN") || PATHS.codexBin,
  claudeBin: env("CLAUDE_BIN", "claude"),
  claudeCwd: env("CLAUDE_CODE_DIR") || PATHS.claudeCode,
  // Hermes provider: drive Hermes' ACP server (`python -m acp_adapter`) from the
  // hermes-agent repo root so its skills/MCPs/config load exactly as
  // scripts/job-apply-start.sh sets them up.
  hermesCwd: env("HERMES_AGENT_DIR") || PATHS.hermesAgent,
  hermesPython:
    env("HERMES_PYTHON") ||
    (fs.existsSync(path.resolve(PATHS.hermesAgent, ".venv/bin/python"))
      ? path.resolve(PATHS.hermesAgent, ".venv/bin/python")
      : "python3"),
  // Parsed ~/.hermes/.env (CUSTOM_API_KEY etc.) merged into the ACP child's env,
  // mirroring `source "$HOME/.hermes/.env"` in job-apply-start.sh.
  hermesEnvVars: parseEnvFile(env("HERMES_ENV_FILE") || path.join(os.homedir(), ".hermes", ".env")),
  // Live-browser streaming for Hermes runs: attach to the headed Playwright MCP
  // Chrome over CDP and stream screenshots into Athens. Read-only; safe to disable
  // (HERMES_LIVE_VIEW=false) if the debug-port arg ever disturbs the MCP browser.
  hermesLiveView: (env("HERMES_LIVE_VIEW", "true") !== "false"),
  hermesCdpPort: Number(env("HERMES_CDP_PORT", "9223")),
  hermesHome: env("HERMES_HOME") || path.join(os.homedir(), ".hermes"),
  playwrightMcpConfigPath:
    env("PLAYWRIGHT_MCP_CONFIG") || path.join(os.homedir(), ".hermes", "playwright-mcp-config.json"),
  unifiedAiUrl: PATHS.unifiedAi,
  autoSubmit: (env("AUTO_SUBMIT") || "true") !== "false",
  defaultMode: env("AGENT_DEFAULT_MODE", "plan"),
  athensServerUrl: (env("ATHENS_SERVER_URL", "http://127.0.0.1:8979")).replace(/\/$/, ""),
  maxTokensPerRun: Number(env("AI_MAX_TOKENS_PER_RUN", "500000")),
  // How long a job may sit parked waiting for a human (CAPTCHA / ID check / account
  // confirmation) before the runner auto-abandons it so the batch never hangs forever.
  // 0 disables the timeout (wait indefinitely). Default 15 minutes.
  handoffTimeoutMs: Number(env("AGENT_HANDOFF_TIMEOUT_MS", "900000")),
};

export function maskKey(k) {
  if (!k) return "(none)";
  return `${k.slice(0, 7)}…${k.slice(-4)} (${k.length} chars)`;
}
