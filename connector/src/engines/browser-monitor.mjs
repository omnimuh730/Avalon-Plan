// Periodic browser screenshots for live monitoring + MongoDB history replay.
// Uses the run's playwright-cli session (PLAYWRIGHT_CLI_SESSION) so each agent
// captures only its own browser. Saves PNGs under agent-runtime/logs/runs/<runId>/.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "./config.mjs";

const DEFAULT_INTERVAL_MS = 3500;

function pwScreenshot(session, filePath, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let done = false;
    const finish = (code) => { if (!done) { done = true; resolve({ ok: code === 0, code, out, err }); } };
    try {
      const child = spawn("playwright-cli", ["screenshot", "--filename", filePath], {
        cwd: PATHS.agentRuntime,
        env: { ...process.env, PLAYWRIGHT_CLI_SESSION: session },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} finish(-1); }, timeout);
      child.stdout.on("data", (d) => { out += String(d); });
      child.stderr.on("data", (d) => { err += String(d); });
      child.on("exit", (c) => { clearTimeout(t); finish(c ?? 1); });
      child.on("error", () => { clearTimeout(t); finish(-1); });
    } catch { finish(-1); }
  });
}

/**
 * Start a periodic screenshot loop for a run. Returns { stop } — call stop() in
 * the batch runner's finally block alongside closeBrowserSession().
 */
export function startBrowserMonitor({ runId, session, emit, getJobIndex, intervalMs = DEFAULT_INTERVAL_MS }) {
  if (!runId || !session || !emit) return { stop() {} };

  const runDir = path.join(PATHS.agentRuntime, "logs", "runs", String(runId));
  try { fs.mkdirSync(runDir, { recursive: true }); } catch {}

  let frame = 0;
  let stopped = false;
  let timer = null;
  let capturing = false;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(tick, intervalMs);
  };

  const tick = async () => {
    if (stopped) return;
    if (capturing) { schedule(); return; }
    capturing = true;
    const n = ++frame;
    const filePath = path.join(runDir, `frame-${String(n).padStart(4, "0")}.png`);
    try {
      const r = await pwScreenshot(session, filePath);
      if (r.ok && fs.existsSync(filePath)) {
        const jobIndex = getJobIndex?.();
        emit({
          type: "screenshot",
          label: `Frame ${n}`,
          filePath,
          ...(jobIndex != null ? { jobIndex } : {}),
        });
      }
    } catch { /* browser not open yet or session idle — retry next tick */ }
    capturing = false;
    schedule();
  };

  schedule();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
