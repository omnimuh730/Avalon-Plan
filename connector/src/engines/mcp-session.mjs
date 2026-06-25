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
import { seedMasterFromChromeProfile, KEYCHAIN_IGNORE_ARGS } from "./chrome-profile.mjs";

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
export function writeRunMcpConfig({ applierName, runId, chromeProfileDir = "" }) {
  // Seed the persistent master from the chosen REAL Chrome profile (first run only),
  // so the MCP browser launches real Chrome already signed in — same fork the CLI
  // engines use. No-op when no profile was chosen or the master already exists.
  if (chromeProfileDir) {
    try { seedMasterFromChromeProfile({ applierName, chromeProfileDir }); } catch { /* best-effort */ }
  }

  const master = masterProfileDir(applierName);
  const runId2 = String(runId || Date.now().toString(36));
  const runProfile = path.join(os.tmpdir(), "nextoffer-mcp", runId2, "chrome-profile");

  let seeded = false;
  try {
    if (fs.existsSync(master)) { copyProfile(master, runProfile); seeded = true; }
    else fs.mkdirSync(runProfile, { recursive: true });
  } catch { try { fs.mkdirSync(runProfile, { recursive: true }); } catch {} }

  const dir = path.join(os.tmpdir(), "nextoffer-mcp", runId2);
  fs.mkdirSync(dir, { recursive: true });

  // Keep the real OS keychain so the forked profile's encrypted cookies (logins)
  // decrypt — same reason as the CLI engines. @playwright/mcp reads this --config.
  const pwConfigPath = path.join(dir, "playwright-mcp.json");
  fs.writeFileSync(pwConfigPath, JSON.stringify({
    browser: { launchOptions: { headless: false, ignoreDefaultArgs: KEYCHAIN_IGNORE_ARGS } },
  }, null, 2));

  const gmailDir = path.join(CONFIG.claudeCwd, "mcps", "gmail");
  const config = {
    mcpServers: {
      // --allow-unrestricted-file-access: AI résumés land in /tmp/nextoffer-runs/… which is
      // outside the MCP workspace; without this, browser_file_upload rejects the path.
      playwright: {
        command: "npx",
        args: [
          "-y", "@playwright/mcp@latest",
          "--browser", "chrome",
          "--user-data-dir", runProfile,
          "--config", pwConfigPath,
          "--allow-unrestricted-file-access",
        ],
      },
      gmail: { command: path.join(gmailDir, ".venv", "bin", "python"), args: [path.join(gmailDir, "server.py")] },
    },
  };

  const configPath = path.join(dir, ".mcp.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return { dir, config: configPath, runProfile, master, seeded };
}

/**
 * Copy the résumé into the per-run MCP workspace so browser_file_upload can reach it
 * even when unrestricted file access is unavailable. Returns the staged path.
 */
export function stageResumeForMcp(mcpDir, resumePath) {
  if (!mcpDir || !resumePath) return null;
  try {
    if (!fs.existsSync(resumePath)) return null;
    const dest = path.join(mcpDir, path.basename(resumePath));
    fs.copyFileSync(resumePath, dest);
    return dest;
  } catch {
    return null;
  }
}

/** Save the finished run's profile back to the applicant's master (persist logins). */
export function persistProfileBack({ runProfile, master }) {
  try {
    if (runProfile && master && fs.existsSync(runProfile)) copyProfile(runProfile, master);
  } catch { /* best-effort */ }
}
