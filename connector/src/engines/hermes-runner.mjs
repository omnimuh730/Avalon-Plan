// Drive Hermes Agent as the agent for one job application — via its ACP server.
//
// Counterpart to claude-runner.mjs, but Hermes speaks the Agent Client Protocol
// (ACP) over stdio instead of a `stream-json` CLI. We spawn Hermes' ACP server
// (`python -m acp_adapter`) from the hermes-agent repo root, then run a minimal
// newline-delimited JSON-RPC client: initialize → session/new → session/prompt,
// consuming `session/update` notifications until the prompt resolves.
//
// Hermes IS the agent: it reasons, drives a real browser through its own
// Playwright MCP + Gmail MCP (loaded from the hermes-agent repo config — exactly
// as scripts/job-apply-start.sh sets up), runs its greenhouse-apply / workday-apply
// skills, and verifies — all itself. We pass `mcpServers: []` in session/new so
// Hermes uses its OWN configured MCP servers, not any we'd inject.
//
// Model/provider is whatever Hermes is configured with (~/.hermes) — the connector
// does not map model ids onto Hermes provider flags. So we do not price per-turn
// usage here; cost accounting is best-effort (see hermes-apply.mjs).

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
  // Single text block: { type: "text", text }
  if (!Array.isArray(content)) return content.text || "";
  // List of ToolCallContent: [{ type: "content", content: { type:"text", text } }]
  return content
    .map((c) => c?.content?.text || c?.text || "")
    .filter(Boolean)
    .join(" ");
}

/**
 * Normalize an ACP `session/update` payload into the compact dashboard event
 * vocabulary shared with claude-runner ({ kind: message|reasoning|command|tool }).
 * Returns null when ignored.
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
      // Browser/terminal/fetch tools read as "commands"; everything else as a tool.
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
    // plan / usage_update / mode updates: not surfaced as steps.
    default:
      return null;
  }
}

/**
 * Run one Hermes ACP turn for a job application.
 *
 * @param {object} o
 * @param {string} o.hermesPython  python interpreter (the hermes-agent venv's)
 * @param {string} o.cwd           the hermes-agent repo root (skills/MCP/config load from here)
 * @param {string} o.prompt        the task prompt
 * @param {object} [o.env]         extra env (CUSTOM_API_KEY etc. + gate secrets)
 * @param {(e:object)=>void} [o.onEvent]
 * @param {AbortSignal} [o.signal]
 * @param {object} [o.deps]        { spawn } injectable for tests
 */
export async function runHermesAgent(o) {
  const spawnFn = o.deps?.spawn || spawn;
  const env = { ...process.env, ...(o.env || {}) };
  const child = spawnFn(o.hermesPython, ["-m", "acp_adapter"], { cwd: o.cwd, env, signal: o.signal });

  const stderr = [];
  let failure = null;
  let sessionId = null;
  let stopReason = null;
  let finalMessage = "";

  const emit = (mapped) => {
    if (!mapped || !o.onEvent) return;
    o.onEvent(mapped);
  };

  // Hermes streams assistant text token-by-token (one agent_message_chunk /
  // agent_thought_chunk per few characters). Coalesce consecutive same-kind
  // chunks into ONE event so the dashboard shows whole thoughts / messages
  // instead of a per-token flood. Flush on a kind switch, a tool boundary, or
  // turn end.
  let buf = { kind: null, text: "" };
  const flushBuf = () => {
    if (buf.text) emit({ kind: buf.kind, text: buf.text });
    buf = { kind: null, text: "" };
  };
  const bufferChunk = (kind, text) => {
    if (!text) return;
    if (buf.kind && buf.kind !== kind) flushBuf();
    buf.kind = kind;
    buf.text += text;
  };

  // Swallow the ABORT_ERR a signal-spawned child emits on Stop/Pause — otherwise
  // Node re-throws it as uncaught and kills the connector process.
  child.on("error", (err) => {
    if (err?.code === "ABORT_ERR" || err?.name === "AbortError") return;
    stderr.push(`spawn error: ${err?.message || err}`);
  });

  // Parse per-call DeepSeek usage out of Hermes' stderr log (line-buffered, since
  // a chunk may straddle line boundaries) and emit it as a usage delta.
  let errBuf = "";
  const scanUsageLine = (line) => {
    const m = USAGE_LINE_RE.exec(line);
    if (!m) return;
    const [, model, inTok, outTok, hit] = m;
    const input = Number(inTok) || 0;
    const output = Number(outTok) || 0;
    const cached = Number(hit) || 0;
    emit({
      kind: "usage",
      model,
      usage: { input_tokens: input, output_tokens: output, cached_input_tokens: cached, total_tokens: input + output },
    });
  };
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

  // --- Minimal newline-delimited JSON-RPC client over the child's stdio. ---
  let nextId = 1;
  const pending = new Map(); // id -> { resolve, reject }
  const send = (msg) => {
    try {
      child.stdin.write(JSON.stringify(msg) + "\n");
    } catch {
      /* child gone — the awaiting request rejects on close */
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
    // We advertise no client fs/terminal capabilities, so Hermes shouldn't call
    // back for those. If it does, decline cleanly rather than hang.
    respondError(id, -32601, `method not handled: ${method}`);
  };

  const handleNotification = (msg) => {
    if (msg.method !== "session/update") return;
    const update = msg.params?.update;
    if (!update) return;
    const su = update.sessionUpdate;
    if (su === "agent_message_chunk") {
      const text = contentText(update.content);
      finalMessage += text;
      bufferChunk("message", text);
      return;
    }
    if (su === "agent_thought_chunk") {
      bufferChunk("reasoning", contentText(update.content));
      return;
    }
    // Any non-text update (tool call/result, plan, …) ends the current text run.
    flushBuf();
    emit(mapUpdate(update));
  };

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const readerDone = (async () => {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        continue; // non-JSON diagnostic line on stdout — ignore
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
    // Stream closed — fail any still-pending requests so awaits don't hang.
    for (const [, p] of pending) p.reject(new Error("ACP stream closed"));
    pending.clear();
  })();

  try {
    await request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {}, // no fs/terminal — Hermes uses its own tools
      clientInfo: { name: "nextoffer-connector", version: "1.0.0" },
    });
    const newSession = await request("session/new", { cwd: o.cwd, mcpServers: [] });
    sessionId = newSession?.sessionId || null;
    const prompt = await request("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: o.prompt || "" }],
    });
    stopReason = prompt?.stopReason || null;
    if (stopReason && !["end_turn", "max_tokens", "max_turn_requests"].includes(stopReason)) {
      // "cancelled" | "refusal" | … — surface as a failure unless we aborted.
      if (!o.signal?.aborted) failure = `hermes stopped: ${stopReason}`;
    }
  } catch (err) {
    if (!(o.signal?.aborted)) failure = `hermes ACP error: ${err?.message || err}`;
  } finally {
    flushBuf(); // emit any trailing buffered message/thought before teardown
    if (errBuf) { scanUsageLine(errBuf); errBuf = ""; } // last (newline-less) stderr line
    // One prompt per job — tear the ACP server down so each application is isolated.
    try {
      child.stdin.end();
    } catch {
      /* already closed */
    }
    if (!child.killed) child.kill();
  }

  await readerDone.catch(() => {});
  const exitCode = await new Promise((r) => child.on("exit", (c) => r(c ?? 0)));

  // Usage is priced per-call from the stderr log (emitted live as usage deltas);
  // hermes-apply accumulates it. Nothing to return here.
  return { threadId: sessionId, finalMessage, usage: null, costUsd: null, exitCode, failure, stderr: stderr.join("") };
}
