// Live-browser screenshots for Hermes runs.
//
// Hermes drives a HEADED Chrome via its Playwright MCP, which the connector does
// not own — so (unlike the codex playwright-cli path) we can't screenshot it
// directly. Instead we attach to that Chrome over CDP and poll
// `Page.captureScreenshot`, writing frames to the same run dir and emitting the
// same `{type:"screenshot", filePath}` events as browser-monitor.mjs — so Athens
// renders them through the existing pipeline with no UI changes.
//
// This is strictly READ-ONLY and fully degradation-safe: if CDP isn't reachable
// (port not exposed, browser not up yet, Playwright ignored the arg) every tick
// silently no-ops. It must never affect the agent run.

import fs from "node:fs";
import path from "node:path";
import { PATHS } from "./config.mjs";

const DEFAULT_INTERVAL_MS = 3500;

async function cdpPages(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return [];
    const targets = await res.json();
    return Array.isArray(targets) ? targets.filter((t) => t.type === "page" && t.webSocketDebuggerUrl) : [];
  } catch {
    return [];
  }
}

/** Prefer a real http(s) application tab over about:blank / devtools. */
function pickPage(pages) {
  return pages.find((p) => /^https?:/i.test(p.url || "")) || pages[0] || null;
}

function captureScreenshot(wsUrl, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    let ws = null;
    const done = (v) => {
      if (settled) return;
      settled = true;
      try { ws?.close(); } catch { /* ignore */ }
      resolve(v);
    };
    const t = setTimeout(() => done(null), timeoutMs);
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ id: 1, method: "Page.captureScreenshot", params: { format: "png" } }));
      };
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
          if (m.id === 1) { clearTimeout(t); done(m.result?.data || null); }
        } catch { /* ignore non-JSON frames */ }
      };
      ws.onerror = () => { clearTimeout(t); done(null); };
    } catch {
      clearTimeout(t);
      done(null);
    }
  });
}

/**
 * Start polling the Hermes MCP Chrome over CDP. Returns { stop }.
 * Mirrors startBrowserMonitor's contract so it slots into the batch finally.
 */
export function startHermesBrowserMonitor({ runId, cdpPort, emit, getJobIndex, intervalMs = DEFAULT_INTERVAL_MS }) {
  if (!runId || !cdpPort || !emit) return { stop() {} };

  const runDir = path.join(PATHS.agentRuntime, "logs", "runs", String(runId));
  try { fs.mkdirSync(runDir, { recursive: true }); } catch { /* ignore */ }

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
    try {
      const page = pickPage(await cdpPages(cdpPort));
      if (page) {
        const b64 = await captureScreenshot(page.webSocketDebuggerUrl);
        if (b64 && !stopped) {
          const n = ++frame;
          const filePath = path.join(runDir, `frame-${String(n).padStart(4, "0")}.png`);
          fs.writeFileSync(filePath, Buffer.from(b64, "base64"));
          const jobIndex = getJobIndex?.();
          emit({ type: "screenshot", label: `Frame ${n}`, filePath, ...(jobIndex != null ? { jobIndex } : {}) });
        }
      }
    } catch { /* browser not up / CDP not exposed — retry next tick */ }
    capturing = false;
    schedule();
  };

  schedule();
  return { stop() { stopped = true; if (timer) clearTimeout(timer); } };
}
