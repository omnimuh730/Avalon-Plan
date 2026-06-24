// MCP browser session helpers for the claude-code MCP driver.
//
// Goal: the agent uses a PERSISTENT per-applicant Chrome profile (real Chrome,
// not an incognito chromium), so any login/verification done while bidding is
// SAVED and reused — no re-verify on later runs.
//
// Concurrency + persistence together: each run launches from a COPY of the
// applicant's master profile dir (so parallel runs don't lock each other), then
// the run's profile is copied BACK into the master when it finishes (so new
// logins/cookies persist for the next run).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG } from "./config.mjs";

/** Must match claude-code/agent/sessions.mjs `safeApplier`. */
export function safeApplier(name) {
  return String(name || "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "applicant";
}

/** Legacy storage-state file (used by the playwright-cli state-load prompt hints). */
export function sessionFileFor(applierName) {
  return path.join(CONFIG.claudeCwd, ".sessions", `${safeApplier(applierName)}.json`);
}
export function hasSavedSession(applierName) {
  try { return fs.existsSync(sessionFileFor(applierName)); } catch { return false; }
}

/** The applicant's persistent Chrome profile dir (accumulates logins across runs). */
export function masterProfileDir(applierName) {
  return path.join(CONFIG.claudeCwd, ".sessions", `${safeApplier(applierName)}-chrome`);
}

// Don't copy Chrome's single-instance lock/socket files between profile dirs.
function notLock(src) {
  const b = path.basename(src);
  return !/^Singleton|^lockfile$|\.lock$/i.test(b);
}
function copyProfile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true, filter: notLock });
}

/**
 * Write a per-run MCP config. Playwright runs REAL Chrome on a per-run copy of the
 * applicant's persistent profile (logged in if used before), Gmail MCP alongside.
 * Returns { dir, config, runProfile, master, seeded } — the caller persists the
 * run profile back to `master` after the run.
 */
export function writeRunMcpConfig({ applierName, runId }) {
  const master = masterProfileDir(applierName);
  const runId2 = String(runId || Date.now().toString(36));
  const runProfile = path.join(os.tmpdir(), "nextoffer-mcp", runId2, "chrome-profile");

  let seeded = false;
  try {
    if (fs.existsSync(master)) { copyProfile(master, runProfile); seeded = true; }
    else fs.mkdirSync(runProfile, { recursive: true });
  } catch { try { fs.mkdirSync(runProfile, { recursive: true }); } catch {} }

  const gmailDir = path.join(CONFIG.claudeCwd, "mcps", "gmail");
  const config = {
    mcpServers: {
      playwright: { command: "npx", args: ["-y", "@playwright/mcp@latest", "--browser", "chrome", "--user-data-dir", runProfile] },
      gmail: { command: path.join(gmailDir, ".venv", "bin", "python"), args: [path.join(gmailDir, "server.py")] },
    },
  };

  const dir = path.join(os.tmpdir(), "nextoffer-mcp", runId2);
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, ".mcp.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return { dir, config: configPath, runProfile, master, seeded };
}

/** Save the finished run's profile back to the applicant's master (persist logins). */
export function persistProfileBack({ runProfile, master }) {
  try {
    if (runProfile && master && fs.existsSync(runProfile)) copyProfile(runProfile, master);
  } catch { /* best-effort */ }
}
