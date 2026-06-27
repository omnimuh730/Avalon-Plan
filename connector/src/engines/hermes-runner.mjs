// Drive Hermes Agent as the agent for job applications — via its ACP server.
//
// Counterpart to claude-runner.mjs, but Hermes speaks the Agent Client Protocol
// (ACP) over stdio. To match `scripts/job-apply-start.sh` reliability we run a
// WARM client: ONE `python -m acp_adapter` process for the whole batch, with a
// FRESH ACP session per job. That keeps the Playwright MCP browser + Gmail MCP +
// skills warm (started once via discover_mcp_tools at process start) and the
// prompt cache hot, while each job still gets a clean conversation. This mirrors
// the interactive `hermes chat` session the script opens — same .hermes.md,
// MCP config, skills and model (~/.hermes) — minus the human in the loop.
//
// Hermes IS the agent: it reasons, drives the headed browser via its OWN
// Playwright MCP, runs greenhouse/workday/ashby skills, and verifies. We pass
// `mcpServers: []` in session/new because the MCP servers are loaded from the
// hermes-agent repo config at process start, not injected per session.

import { spawn } from "node:child_process";
import readline from "node:readline";

const PROTOCOL_VERSION = 1; // acp.meta.PROTOCOL_VERSION

// Hermes logs each model call to stderr (stdout is reserved for ACP JSON-RPC):
//   "API call #1: model=deepseek-v4-flash provider=custom in=21393 out=33 \
//    total=21426 latency=4.3s cache=2304/21393 (11%)"
// in = total prompt tokens, out = completion tokens, cache=<hit>/<promptTotal>.
// This is the only place exact per-call token usage is exposed, so we parse it
// to price DeepSeek runs accurately (cache-hit vs cache-miss split).
const USAGE_LINE_RE = /API call #\d+:.*?\bmodel=(\S+).*?\bin=(\d+)\b.*?\bout=(\d+)\b.*?\bcache=(\d+)\/(\d+)/;

/** Short label for a Hermes tool-call update — prefer the human title the ACP
 *  adapter already builds (e.g. "navigate: <url>", "terminal: <cmd>"). */
function toolLabel(update) {
  const title = (update?.title || "").trim();
  if (title) return title.slice(0, 200);
  return update?.toolCallId || "tool";
}

/** Extract plain text from an ACP content block or list of blocks. */
function contentText(content) {
  if (!content) return "";
  if (!Array.isArray(content)) return content.text || "";
  return content
    .map((c) => c?.content?.text || c?.text || "")
    .filter(Boolean)
    .join(" ");
}

/**
 * Normalize an ACP `session/update` payload into the compact dashboard event
 * vocabulary shared with claude-runner ({ kind: message|reasoning|command|tool }).
 * Returns null when ignored. (Text chunks are coalesced by the client, so this
 * only maps non-text updates.)
 */
export function mapUpdate(update) {
  switch (update?.sessionUpdate) {
    case "agent_message_chunk": {
      const text = contentText(update.content);
      return text.trim() ? { kind: "message", text } : null;
    }
    case "agent_thought_chunk": {
      const text = contentText(update.content);
      return text.trim() ? { kind: "reasoning", text } : null;
    }
    case "tool_call": {
      const kind = ["execute", "fetch"].includes(update.kind) ? "command" : "tool";
      const label = toolLabel(update);
      return kind === "command"
        ? { kind: "command", status: "running", command: label, server: "hermes" }
        : { kind: "tool", tool: label, server: "hermes" };
    }
    case "tool_call_update": {
      const text = contentText(update.content);
      if (update.status === "failed") return { kind: "error", message: (text || "tool failed").slice(0, 140) };
      if (text.trim()) return { kind: "command", status: "completed", output: text.slice(0, 140) };
      return null;
    }
    default:
      return null;
  }
}

/**
 * Create a warm Hermes ACP client. One child process, many jobs.
 *
 * @param {object} o
 * @param {string} o.hermesPython  python interpreter (the hermes-agent venv's)
 * @param {string} o.hermesCwd     the hermes-agent repo root (skills/MCP/config load from here)
 * @param {object} [o.env]         extra env (CUSTOM_API_KEY etc. + gate secrets)
 * @param {number} [o.mcpReadyMs]  grace after initialize for MCP warmup (default 1500)
 * @param {number} [o.initTimeoutMs] initialize timeout (default 60000)
 * @param {object} [o.deps]        { spawn } injectable for tests
 */
export function createHermesClient(o) {
  const spawnFn = o.deps?.spawn || spawn;
  const cwd = o.hermesCwd || o.cwd || process.cwd(); // ACP requires an absolute cwd
  let child = null;
  let exited = false;
  let exitCode = null;
  let rl = null;

  const stderr = [];
  let errBuf = "";
  let nextId = 1;
  const pending = new Map(); // id -> { resolve, reject }

  // Per-job state, swapped in by runJob. Jobs run sequentially (the batch loop
  // awaits each), so a single "active job" pointer is safe: all stdout
  // notifications + stderr usage lines belong to the in-flight job.
  let active = null; // { onEvent, sessionId, buf, finalMessage }

  const send = (msg) => {
    try {
      child?.stdin.write(JSON.stringify(msg) + "\n");
    } catch {
      /* child gone — awaiting request rejects on close */
    }
  };
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      send({ jsonrpc: "2.0", id, method, params });
    });
  const respond = (id, result) => send({ jsonrpc: "2.0", id, result });
  const respondError = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

  const flushBuf = () => {
    if (active?.buf.text) active.onEvent?.({ kind: active.buf.kind, text: active.buf.text });
    if (active) active.buf = { kind: null, text: "" };
  };
  const bufferChunk = (kind, text) => {
    if (!text || !active) return;
    if (active.buf.kind && active.buf.kind !== kind) flushBuf();
    active.buf.kind = kind;
    active.buf.text += text;
  };

  const scanUsageLine = (line) => {
    const m = USAGE_LINE_RE.exec(line);
    if (!m || !active) return;
    const [, model, inTok, outTok, hit] = m;
    const input = Number(inTok) || 0;
    const output = Number(outTok) || 0;
    const cached = Number(hit) || 0;
    active.onEvent?.({
      kind: "usage",
      model,
      usage: { input_tokens: input, output_tokens: output, cached_input_tokens: cached, total_tokens: input + output },
    });
  };

  // Server → client request: auto-approve dangerous-command permission gates so
  // the run stays unattended. Pick the most permissive "allow" option offered.
  const handleServerRequest = (msg) => {
    const { id, method, params } = msg;
    if (method === "session/request_permission") {
      const options = params?.options || [];
      const allow =
        options.find((op) => op.optionId === "allow_always") ||
        options.find((op) => op.optionId === "allow_session") ||
        options.find((op) => (op.kind || "").startsWith("allow")) ||
        options[0];
      if (allow) respond(id, { outcome: { outcome: "selected", optionId: allow.optionId } });
      else respond(id, { outcome: { outcome: "cancelled" } });
      return;
    }
    respondError(id, -32601, `method not handled: ${method}`);
  };

  const handleNotification = (msg) => {
    if (msg.method !== "session/update") return;
    const update = msg.params?.update;
    if (!update || !active) return;
    // Ignore updates for any session that isn't the in-flight job's.
    if (active.sessionId && msg.params?.sessionId && msg.params.sessionId !== active.sessionId) return;
    const su = update.sessionUpdate;
    if (su === "agent_message_chunk") {
      const text = contentText(update.content);
      active.finalMessage += text;
      bufferChunk("message", text);
      return;
    }
    if (su === "agent_thought_chunk") {
      bufferChunk("reasoning", contentText(update.content));
      return;
    }
    flushBuf();
    const mapped = mapUpdate(update);
    if (mapped) active.onEvent?.(mapped);
  };

  const attachStreams = () => {
    child.on("error", (err) => {
      if (err?.code === "ABORT_ERR" || err?.name === "AbortError") return;
      stderr.push(`spawn error: ${err?.message || err}`);
    });
    child.on("exit", (c) => {
      exited = true;
      exitCode = c ?? 0;
      for (const [, p] of pending) p.reject(new Error("ACP process exited"));
      pending.clear();
    });
    if (child.stderr) {
      child.stderr.on("data", (d) => {
        const s = String(d);
        stderr.push(s);
        errBuf += s;
        let nl;
        while ((nl = errBuf.indexOf("\n")) >= 0) {
          scanUsageLine(errBuf.slice(0, nl));
          errBuf = errBuf.slice(nl + 1);
        }
      });
    }
    rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    (async () => {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let msg;
        try {
          msg = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (msg.method != null && msg.id != null) handleServerRequest(msg);
        else if (msg.method != null) handleNotification(msg);
        else if (msg.id != null) {
          const p = pending.get(msg.id);
          if (!p) continue;
          pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message || `JSON-RPC error ${msg.error.code}`));
          else p.resolve(msg.result);
        }
      }
    })().catch(() => {});
  };

  async function start() {
    exited = false;
    exitCode = null;
    child = spawnFn(o.hermesPython, ["-m", "acp_adapter"], {
      cwd,
      // HERMES_HOME points Hermes at a per-run config (isolated browser + unique
      // CDP port) so concurrent runs never share a browser. Omitted → shared ~/.hermes.
      env: { ...process.env, ...(o.env || {}), ...(o.hermesHome ? { HERMES_HOME: o.hermesHome } : {}) },
    });
    attachStreams();
    await withTimeout(
      request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {}, // no fs/terminal — Hermes uses its own tools
        clientInfo: { name: "nextoffer-connector", version: "1.0.0" },
      }),
      o.initTimeoutMs ?? 60000,
      "hermes ACP initialize timed out",
    );
    // MCP tools are discovered synchronously at process start; give the headed
    // browser a brief grace before the first navigate so job 1 doesn't race it.
    await sleep(o.mcpReadyMs ?? 1500);
  }

  function isAlive() {
    return !!child && !exited;
  }

  /**
   * Run one job on a fresh ACP session. Resolves with
   * { threadId, finalMessage, usage:null, failure }. Rejects only on transport
   * death; an aborted signal resolves with failure=null + whatever was seen.
   */
  async function runJob({ prompt, onEvent, signal }) {
    active = { onEvent, sessionId: null, buf: { kind: null, text: "" }, finalMessage: "" };
    let failure = null;
    let sessionId = null;
    let onAbort = null;
    try {
      const ns = await request("session/new", { cwd, mcpServers: [] });
      sessionId = ns?.sessionId || null;
      active.sessionId = sessionId;

      const promptPromise = request("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: prompt || "" }],
      });
      const abortPromise = new Promise((resolve) => {
        if (!signal) return;
        onAbort = () => {
          if (sessionId) send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
          resolve({ stopReason: "cancelled" });
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      });
      const res = signal ? await Promise.race([promptPromise, abortPromise]) : await promptPromise;
      flushBuf();
      const stopReason = res?.stopReason || null;
      if (stopReason && !["end_turn", "max_tokens", "max_turn_requests", "cancelled"].includes(stopReason)) {
        if (!signal?.aborted) failure = `hermes stopped: ${stopReason}`;
      }
    } finally {
      if (onAbort && signal) signal.removeEventListener("abort", onAbort);
    }
    const finalMessage = active.finalMessage;
    active = null;
    return { threadId: sessionId, finalMessage, usage: null, failure };
  }

  async function stop() {
    flushBuf();
    if (errBuf) { scanUsageLine(errBuf); errBuf = ""; }
    try { child?.stdin.end(); } catch { /* closed */ }
    try { rl?.close(); } catch { /* closed */ }
    if (child && !child.killed) child.kill();
    if (child && !exited) await new Promise((r) => child.on("exit", () => r()));
  }

  async function restart() {
    try { await stop(); } catch { /* ignore */ }
    await start();
  }

  return {
    start, stop, restart, runJob, isAlive,
    get stderr() { return stderr.join(""); },
    get exitCode() { return exitCode; },
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(promise, ms, message) {
  let t;
  const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}

/**
 * One-shot convenience wrapper (start → runJob → stop). Kept for tests / the ACP
 * smoke script; the batch path uses createHermesClient directly for a warm session.
 */
export async function runHermesAgent(o) {
  const client = createHermesClient(o);
  try {
    await client.start();
    const res = await client.runJob({ prompt: o.prompt, onEvent: o.onEvent, signal: o.signal });
    return { ...res, exitCode: client.exitCode ?? 0, stderr: client.stderr };
  } finally {
    await client.stop();
  }
}
