// Fork a REAL Google Chrome profile so the agent applies already-signed-in.
//
// The Deploy "Browser" step lets the user pick one of their installed Chrome
// profiles (Tracy Nguyen / Work, etc.). We launch REAL Chrome (channel "chrome",
// NOT the bundled "Chrome for Testing") from a COPY of that profile:
//
//   real profile  ──seed once──►  master user-data-dir (.sessions/<applier>-chrome)
//   master         ──per run──►  tmp run user-data-dir   (parallel runs don't lock)
//   run            ──persist──►  master                  (new logins carried forward)
//
// All engines (codex turbo, plan, claude cli, claude mcp) launch from the run dir
// via `--browser chrome --profile <dir>` (CLI) or `--user-data-dir <dir>` (MCP).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { masterProfileDir } from "./mcp-session.mjs";

// User-data-dir locations by OS (the one containing `Local State`).
const CHROME_DIRS = [
  "Library/Application Support/Google/Chrome", // macOS
  ".config/google-chrome", // Linux
  "AppData/Local/Google/Chrome/User Data", // Windows
];

export function chromeUserDataDir() {
  for (const rel of CHROME_DIRS) {
    const p = path.join(os.homedir(), rel);
    try { if (fs.existsSync(path.join(p, "Local State"))) return p; } catch { /* keep looking */ }
  }
  return null;
}

// Skip Chrome's lock/socket files (copying them breaks single-instance) and the
// large, regenerable caches (copying them is slow and pointless for a fork).
const SKIP_RE = /^(Singleton.*|lockfile|.*\.lock|Cache|Code Cache|GPUCache|GrShaderCache|ShaderCache|GraphiteDawnCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache|Service Worker|CacheStorage|Crashpad|Crash Reports|component_crx_cache|extensions_crx_cache|optimization_guide_model_store|Safe Browsing|segmentation_platform|BudgetDatabase|blob_storage)$/i;

function notSkipped(src) {
  return !SKIP_RE.test(path.basename(src));
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true, filter: notSkipped });
}

/** Absolute path of a selected Chrome profile subdir (e.g. "Profile 63"), or null. */
export function resolveChromeProfilePath(chromeProfileDir) {
  const base = chromeUserDataDir();
  if (!base || !chromeProfileDir) return null;
  const safe = path.basename(String(chromeProfileDir)); // guard against traversal
  const full = path.join(base, safe);
  try { return fs.existsSync(full) ? full : null; } catch { return null; }
}

/**
 * Seed the applicant's persistent master user-data-dir from a real Chrome profile.
 * Copies <profile> → <master>/Default (+ Local State) ONCE. No-op if the master is
 * already seeded, unless `force` (the "Re-import session" button). Chrome must be
 * quit for cookies/Login Data to be readable. Returns true when a seed happened.
 */
export function seedMasterFromChromeProfile({ applierName, chromeProfileDir, force = false }) {
  const master = masterProfileDir(applierName);
  const src = resolveChromeProfilePath(chromeProfileDir);
  if (!src) return false;
  try {
    if (force && fs.existsSync(master)) fs.rmSync(master, { recursive: true, force: true });
    if (fs.existsSync(path.join(master, "Default"))) return false; // already seeded
    copyDir(src, path.join(master, "Default"));
    const base = chromeUserDataDir();
    const localState = base ? path.join(base, "Local State") : null;
    try { if (localState && fs.existsSync(localState)) fs.copyFileSync(localState, path.join(master, "Local State")); } catch { /* optional */ }
    return true;
  } catch { return false; }
}

/**
 * Prepare a per-run forked user-data-dir. Seeds the master from the chosen Chrome
 * profile if given (first run only), then copies master → a tmp run dir so parallel
 * runs don't lock each other. Returns { runProfile, master } — or null when there's
 * nothing to fork (no profile chosen and no master yet) so the caller falls back to
 * a fresh browser.
 */
export function prepareForkedProfile({ applierName, chromeProfileDir, runId }) {
  if (chromeProfileDir) seedMasterFromChromeProfile({ applierName, chromeProfileDir });
  const master = masterProfileDir(applierName);
  if (!fs.existsSync(path.join(master, "Default"))) return null;
  const runProfile = path.join(os.tmpdir(), "nextoffer-chrome", String(runId || Date.now().toString(36)), "user-data-dir");
  try { copyDir(master, runProfile); } catch { return null; }
  return { runProfile, master };
}

/** Persist a finished run's profile back to the master (carry new logins forward). */
export function persistForkedProfile({ runProfile, master }) {
  try { if (runProfile && master && fs.existsSync(runProfile)) copyDir(runProfile, master); } catch { /* best-effort */ }
}
