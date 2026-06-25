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

/** Read one profile's metadata from the real Chrome install. */
function readProfileInfo(chromeProfileDir) {
  const base = chromeUserDataDir();
  if (!base) return null;
  const name = path.basename(String(chromeProfileDir));
  try {
    const ls = JSON.parse(fs.readFileSync(path.join(base, "Local State"), "utf8"));
    return ls?.profile?.info_cache?.[name] || { name, user_name: "" };
  } catch {
    return { name, user_name: "" };
  }
}

/** Minimal Local State for a single-profile user-data-dir (Playwright fork). */
function writeSingleProfileLocalState(master, profileDirName, profileInfo) {
  const info = { ...profileInfo, name: profileInfo?.name || profileDirName };
  const ls = {
    profile: {
      info_cache: { [profileDirName]: info },
      last_used: profileDirName,
    },
  };
  fs.writeFileSync(path.join(master, "Local State"), JSON.stringify(ls));
}

/**
 * Seed the applicant's persistent master user-data-dir from a real Chrome profile.
 * Copies <Profile N>/ → <master>/<Profile N>/ and writes a minimal Local State that
 * points at that profile (NOT into Default/ — copying into Default while Local State
 * still says Profile 80 is why the fork looked logged-out). Chrome must be quit.
 */
export function seedMasterFromChromeProfile({ applierName, chromeProfileDir, force = false }) {
  const master = masterProfileDir(applierName);
  const src = resolveChromeProfilePath(chromeProfileDir);
  if (!src) return false;
  const profileDirName = path.basename(src);
  const dest = path.join(master, profileDirName);
  try {
    if (force && fs.existsSync(master)) fs.rmSync(master, { recursive: true, force: true });
    if (fs.existsSync(path.join(dest, "Cookies")) || fs.existsSync(path.join(dest, "Login Data"))) return false;
    fs.mkdirSync(master, { recursive: true });
    copyDir(src, dest);
    writeSingleProfileLocalState(master, profileDirName, readProfileInfo(profileDirName));
    fs.writeFileSync(path.join(master, ".seeded-profile"), profileDirName);
    return true;
  } catch { return false; }
}

function masterHasProfile(master) {
  try {
    const marker = fs.readFileSync(path.join(master, ".seeded-profile"), "utf8").trim();
    if (marker && fs.existsSync(path.join(master, marker))) return true;
  } catch { /* no marker */ }
  // Legacy layout (profile copied into Default/)
  return fs.existsSync(path.join(master, "Default", "Cookies"));
}

// Playwright launches Chrome with --use-mock-keychain + --password-store=basic, which
// force a DUMMY cookie-encryption key — so a real profile's macOS-Keychain-encrypted
// cookies (the logged-in session) can't be decrypted and the browser looks logged out.
// We tell playwright-cli to NOT pass those, so real Chrome uses the real Keychain and
// the forked session decrypts. (playwright-cli reads browser.launchOptions.ignoreDefaultArgs
// from --config and adds them to its ignore list — see createPersistentBrowser.)
export const KEYCHAIN_IGNORE_ARGS = ["--use-mock-keychain", "--password-store=basic"];

/** Build the `playwright-cli open` argv that launches the forked REAL signed-in Chrome. */
export function forkedOpenArgs({ runProfile, configPath }, url) {
  const args = ["open"];
  if (url) args.push(url);
  // --headed: playwright-cli defaults to headless=true when neither --headed nor
  // launchOptions.headless:false is set — the browser drives fine but is invisible
  // and the Live Browser panel never gets frames.
  args.push("--browser", "chrome", "--persistent", "--profile", runProfile, "--headed");
  if (configPath) args.push("--config", configPath);
  return args;
}

/** Same as forkedOpenArgs but as a shell command string for an agent prompt. */
export function forkedOpenCommand({ runProfile, configPath }, url) {
  return `playwright-cli ${forkedOpenArgs({ runProfile, configPath }, url).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}`;
}

/**
 * Prepare a per-run forked user-data-dir. Seeds the master from the chosen Chrome
 * profile if given (first run only), then copies master → a tmp run dir so parallel
 * runs don't lock each other. Also writes a playwright-cli config that keeps the real
 * OS keychain so the session decrypts. Returns { runProfile, master, configPath } —
 * or null when there's nothing to fork (caller falls back to a fresh browser).
 */
export function prepareForkedProfile({ applierName, chromeProfileDir, runId }) {
  if (chromeProfileDir) seedMasterFromChromeProfile({ applierName, chromeProfileDir, force: false });
  const master = masterProfileDir(applierName);
  if (!masterHasProfile(master)) return null;
  const runDir = path.join(os.tmpdir(), "nextoffer-chrome", String(runId || Date.now().toString(36)));
  const runProfile = path.join(runDir, "user-data-dir");
  try { copyDir(master, runProfile); } catch { return null; }
  const configPath = path.join(runDir, "cli.config.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      browser: {
        launchOptions: {
          headless: false,
          ignoreDefaultArgs: KEYCHAIN_IGNORE_ARGS,
        },
      },
    }, null, 2));
  } catch { return { runProfile, master, configPath: null }; }
  return { runProfile, master, configPath };
}

/** Persist a finished run's profile back to the master (carry new logins forward). */
export function persistForkedProfile({ runProfile, master }) {
  try { if (runProfile && master && fs.existsSync(runProfile)) copyDir(runProfile, master); } catch { /* best-effort */ }
}
