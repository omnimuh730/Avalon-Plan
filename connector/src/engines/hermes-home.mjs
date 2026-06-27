// Per-run isolation for concurrent Hermes runs.
//
// Each concurrent deploy must get its OWN headed browser. A Hermes ACP process
// starts its own Playwright MCP (own Chromium) already — EXCEPT when live-view
// pins a CDP debug port: a single fixed port in the shared ~/.hermes config makes
// every concurrent run fight over it and collapse into one browser. So for runs
// that want live-view we build a per-run HERMES_HOME: a symlink farm of the real
// ~/.hermes with config.yaml + the Playwright MCP config overridden to use a
// UNIQUE debug port (and a fresh state.db). Everything else (skills via
// skills.external_dirs in the repo, .env/CUSTOM_API_KEY, auth) is inherited.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const usedPorts = new Set();

/** Hand out a unique-per-process CDP port. Best-effort: a wide random range +
 *  an in-process set keeps concurrent runs from colliding. */
export function allocateCdpPort(base = 9223) {
  for (let i = 0; i < 500; i++) {
    const port = base + Math.floor(Math.random() * 5000);
    if (!usedPorts.has(port)) { usedPorts.add(port); return port; }
  }
  return null;
}
export function releaseCdpPort(port) { if (port) usedPorts.delete(port); }

/** Remove a stale fixed `--remote-debugging-port` an earlier version may have
 *  written to the SHARED Playwright MCP config (it broke concurrent runs). */
export function cleanSharedCdpPort(configPath) {
  try {
    if (!configPath || !fs.existsSync(configPath)) return;
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) || {};
    const args = cfg?.browser?.launchOptions?.args;
    if (!Array.isArray(args)) return;
    const filtered = args.filter((a) => !String(a).startsWith("--remote-debugging-port"));
    if (filtered.length !== args.length) {
      if (filtered.length) cfg.browser.launchOptions.args = filtered;
      else delete cfg.browser.launchOptions.args;
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    }
  } catch { /* ignore */ }
}

/**
 * Build a per-run HERMES_HOME that isolates the browser and pins `cdpPort`.
 * Returns { home, cleanup } or null on failure (caller then uses the shared home
 * with no port — concurrency still holds via separate MCP processes, just no
 * live-view).
 */
export function prepareHermesHome({ baseHome, basePlaywrightConfig, runId, cdpPort }) {
  try {
    const runHome = path.join(os.tmpdir(), "nextoffer-hermes", String(runId));
    fs.rmSync(runHome, { recursive: true, force: true });
    fs.mkdirSync(runHome, { recursive: true });

    // Symlink everything except the files we override / want fresh per run.
    const override = new Set([
      "config.yaml", "playwright-mcp-config.json",
      "state.db", "state.db-wal", "state.db-shm",
    ]);
    for (const entry of fs.readdirSync(baseHome)) {
      if (override.has(entry)) continue;
      try { fs.symlinkSync(path.join(baseHome, entry), path.join(runHome, entry)); } catch { /* skip */ }
    }

    // Per-run Playwright MCP config = base + a UNIQUE remote-debugging-port.
    let pwCfg = {};
    try { pwCfg = JSON.parse(fs.readFileSync(basePlaywrightConfig, "utf8")) || {}; } catch { /* defaults below */ }
    pwCfg.browser = pwCfg.browser || {};
    pwCfg.browser.launchOptions = pwCfg.browser.launchOptions || {};
    if (pwCfg.browser.launchOptions.headless == null) pwCfg.browser.launchOptions.headless = false;
    const args = (pwCfg.browser.launchOptions.args || []).filter((a) => !String(a).startsWith("--remote-debugging-port"));
    if (cdpPort) args.push(`--remote-debugging-port=${cdpPort}`);
    pwCfg.browser.launchOptions.args = args;
    const runPwPath = path.join(runHome, "playwright-mcp-config.json");
    fs.writeFileSync(runPwPath, JSON.stringify(pwCfg, null, 2));

    // Per-run config.yaml = base copy with the Playwright `--config` path repointed
    // at our per-run file (it's an absolute path in the base config, so HERMES_HOME
    // alone wouldn't redirect it).
    const baseConfigYaml = path.join(baseHome, "config.yaml");
    if (fs.existsSync(baseConfigYaml)) {
      let yaml = fs.readFileSync(baseConfigYaml, "utf8");
      if (basePlaywrightConfig && yaml.includes(basePlaywrightConfig)) {
        yaml = yaml.split(basePlaywrightConfig).join(runPwPath);
      }
      fs.writeFileSync(path.join(runHome, "config.yaml"), yaml);
    }

    return {
      home: runHome,
      cleanup: () => { try { fs.rmSync(runHome, { recursive: true, force: true }); } catch { /* ignore */ } },
    };
  } catch {
    return null;
  }
}
