// Apply to jobs using Hermes Agent (via its ACP server) as the agent.
//
// The "hermes" provider counterpart to runApplicationClaude. To match the
// reliability of scripts/job-apply-start.sh, the batch holds ONE warm Hermes
// process (createHermesClient) and runs a FRESH ACP session per job — keeping
// the Playwright MCP browser + Gmail MCP + skills warm and the prompt cache hot,
// like the script's single interactive session. Hermes drives the browser itself
// through its OWN Playwright MCP and its greenhouse/workday/ashby skills (loaded
// from the hermes-agent repo config). The connector only composes a short prompt,
// runs one ACP turn per job (with a retry), streams events to the dashboard, and
// streams the headed browser via CDP (hermes-browser-monitor).

import { createHermesClient } from "./hermes-runner.mjs";
import { parseResult, runBatchCodex, usageToAgentForce } from "./codex-apply.mjs";
import { startHermesBrowserMonitor } from "./hermes-browser-monitor.mjs";
import { allocateCdpPort, releaseCdpPort, prepareHermesHome, cleanSharedCdpPort } from "./hermes-home.mjs";
import { formatUsd } from "../core/pricing.mjs";
import { CONFIG } from "./config.mjs";

/** Compose the (deliberately short) task prompt for Hermes — mirrors the proven
 *  job-apply-start.sh prompt shape. Hermes already carries the job-apply skills +
 *  operating rules (.hermes.md), so this is just the facts + the result contract. */
export function buildHermesApplyPrompt({ url, job, profile, resumePath, autoSubmit = false }) {
  const lines = [
    `Please apply to this job for me using your job-apply skill (greenhouse-apply / workday-apply / ashby-apply as appropriate) and your Playwright browser + Gmail tools.`,
    "",
    `Job: ${job?.title || "(role)"}${job?.company ? ` at ${job.company}` : ""}`,
    `URL: ${url}`,
    "",
    "Applicant profile (JSON) — use these values for every field:",
    JSON.stringify(profile, null, 2),
    "",
    `Resume file to upload: ${resumePath || "(none)"}`,
    "Upload EXACTLY that file path for the resume/CV field — do NOT substitute, rename, or pick any other file.",
    "",
    autoSubmit
      ? "AUTO-SUBMIT is ON: after every required field is filled, click the real Submit button, then snapshot to confirm a thank-you / application-received page BEFORE you report RESULT: submitted. If Submit is still visible or validation errors show, fix them and retry — do NOT report submitted until the confirmation page is visible. Do not stop to ask me; decide and proceed."
      : "Fill everything but do NOT click the final Submit; end with RESULT: review_pending.",
    "",
    "DECIDE — is this the job's application?",
    "- A multi-step flow is NORMAL: a job-description page with an \"Apply\" / \"Apply Now\" button → click it, then fill the form. Greenhouse / Workday / Ashby / iCIMS work this way — do NOT skip just because the form isn't shown yet.",
    "- ONLY end with `RESULT: skipped — <reason>` if the page truly has no way to apply: a generic listing page with no apply control, an expired/removed posting, a 404, or clearly the wrong page.",
    "",
    "When done, end with one line: RESULT: <submitted|review_pending|skipped|error> — <short reason>",
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Apply to one job with the warm Hermes client. Same opts shape as
 * runApplicationClaude (accepts the codex superset so the shared batch loop can
 * pass one object) plus the warm `client` bound by runBatchHermes.
 */
export async function runApplicationHermes({
  url,
  agentName,
  emit,
  profile,
  job,
  signal,
  autoSubmit,
  client,
  // Accepted-but-unused (codex/claude-specific) so the batch loop can pass one shape:
  model, apiKey, proxyUrl, codexPath, claudeBin, claudeCwd, claudeMcpCwd, claudeEngine,
  forkedProfile, chromeProfile, resumeGenerating, runId,
}) {
  const step = (level, title, detail) => emit({ type: "step", level, title, detail });

  emit({ type: "status", phase: "starting", message: `Agent "${agentName}" booting for ${profile.fullName}` });
  emit({ type: "meta", profileName: profile.fullName, model: "hermes", resumeStack: profile.resumeStack, resumePath: profile.resumePath, url, role: job?.title, company: job?.company });
  step("info", "Profile", `${profile.fullName} · resume: ${profile.resumeStack || "default"}`);
  step("info", "Engine", "hermes → ACP (warm session) · drives its own Playwright + Gmail MCP & job-apply skills");

  // Running total, accumulated from per-call usage DELTAS parsed out of Hermes'
  // stderr log. Each delta is priced at DeepSeek rates and forwarded as its own
  // dashboard usage event (real-time cost), like the claude-code path.
  let total = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };

  // Translate runner events → dashboard steps. Message/Thinking text is sent in
  // FULL (Athens renders it with break-words, no clamp) to mirror Hermes' terminal.
  const onEvent = (e) => {
    if (!e) return;
    switch (e.kind) {
      case "message":
        if (e.text) step("ai", "Agent", e.text);
        break;
      case "reasoning":
        if (e.text) step("ai", "Thinking", e.text);
        break;
      case "command":
        emit({ type: "status", phase: "filling", message: "Driving the browser" });
        if (e.command) step("action", "hermes", e.command);
        else if (e.output) step("info", "result", String(e.output).slice(0, 500));
        break;
      case "tool":
        step("info", "tool", `${e.server || "hermes"}/${e.tool || ""}`);
        break;
      case "error":
        step("warn", "Error", e.message);
        break;
      case "usage": {
        const d = usageToAgentForce(e.model, e.usage || {});
        total = {
          inputTokens: total.inputTokens + d.inputTokens,
          cachedTokens: total.cachedTokens + d.cachedTokens,
          outputTokens: total.outputTokens + d.outputTokens,
          totalTokens: total.totalTokens + d.totalTokens,
          costUsd: total.costUsd + d.costUsd,
        };
        emit({
          type: "usage", model: e.model,
          inputTokens: d.inputTokens, cachedTokens: d.cachedTokens, outputTokens: d.outputTokens,
          totalTokens: d.totalTokens, costUsd: d.costUsd, priced: d.priced, costLabel: d.costLabel,
        });
        break;
      }
      default:
        break;
    }
  };

  const prompt = buildHermesApplyPrompt({ url, job, profile, resumePath: profile.resumePath, autoSubmit });

  // Run with one retry on a fresh session. A transport death (process exit) or an
  // abnormal stop reason sets `failure`; we restart the client if it died and try
  // once more — mirroring the manual "nudge it past the hiccup" recovery.
  let res = { failure: "not started", finalMessage: "" };
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (!client.isAlive()) {
      try { await client.restart(); } catch (e) { res = { failure: `restart failed: ${e?.message || e}`, finalMessage: "" }; }
    }
    try {
      res = await client.runJob({ prompt, onEvent, signal });
    } catch (e) {
      res = { failure: String(e?.message || e), finalMessage: "" };
    }
    if (!res.failure || signal?.aborted || attempt === 2) break;
    step("warn", "Retry", `attempt ${attempt} failed (${res.failure}); retrying on a fresh Hermes session`);
  }

  // Per-call deltas were already emitted above (priced at DeepSeek rates); the
  // done event carries the accumulated total (no extra usage emit).
  const usage = { ...total, priced: true, costLabel: formatUsd(total.costUsd) };

  if (res.failure) {
    const message = `${res.failure}${client.stderr ? `: ${String(client.stderr).slice(-200)}` : ""}`;
    emit({ type: "done", result: "error", message, usage });
    return { result: "error", message, usage, threadId: res.threadId };
  }

  const { result, message } = parseResult(res.finalMessage);
  emit({ type: "done", result, message, usage });
  return { result, message, usage, threadId: res.threadId };
}

/**
 * Apply to a batch of jobs with Hermes. Reuses the shared batch loop (resume
 * matching, AI-resume generation, MongoDB marking, dashboard framing) but:
 *  - holds ONE warm Hermes process for the whole batch (fresh session per job),
 *  - streams the headed MCP browser into Athens over CDP,
 *  - skips the codex playwright-cli browser monitor (Hermes uses Playwright MCP).
 */
export async function runBatchHermes(opts) {
  const { hermesPython, hermesCwd, hermesEnvVars } = opts;

  // Profile-level gate secrets (Gmail OTP, default password) — passed once at
  // process start so Hermes can self-resolve login/OTP gates with its MCP tools.
  const env = {
    ...(hermesEnvVars || {}),
    GMAIL_ADDRESS: opts.profile?.email || "",
    GMAIL_APP_PASSWORD: opts.profile?.gmailAppPassword || "",
    APPLICANT_PASSWORD: opts.profile?.defaultPassword || "",
  };

  // Undo any stale fixed debug-port a prior version wrote to the SHARED config
  // (that made concurrent runs share one browser).
  cleanSharedCdpPort(CONFIG.playwrightMcpConfigPath);

  // Live view needs a CDP port; a fixed shared port breaks concurrency, so each
  // run gets an isolated HERMES_HOME with a UNIQUE port. If that prep fails we
  // fall back to the shared home with no port — concurrency still holds (separate
  // MCP processes = separate browsers), just no live frames for this run.
  const jobIndexRef = { current: 0 };
  let monitor = { stop() {} };
  let cdpPort = null;
  let prepared = null;
  let hermesHome; // undefined → shared ~/.hermes
  if (CONFIG.hermesLiveView) {
    cdpPort = allocateCdpPort(CONFIG.hermesCdpPort);
    prepared = prepareHermesHome({
      baseHome: CONFIG.hermesHome,
      basePlaywrightConfig: CONFIG.playwrightMcpConfigPath,
      runId: opts.runId,
      cdpPort,
    });
    if (prepared) {
      hermesHome = prepared.home;
      monitor = startHermesBrowserMonitor({
        runId: opts.runId, cdpPort, emit: opts.emit, getJobIndex: () => jobIndexRef.current,
      });
    } else {
      releaseCdpPort(cdpPort);
      cdpPort = null;
    }
  }

  const client = createHermesClient({ hermesPython, hermesCwd, env, hermesHome });

  let seq = 0;
  try {
    await client.start();
    return await runBatchCodex({
      ...opts,
      skipBrowserMonitor: true, // Hermes uses Playwright MCP, not playwright-cli
      runApplication: (jobOpts) => {
        jobIndexRef.current = seq++; // align live frames with the current job tab
        return runApplicationHermes({ ...jobOpts, client });
      },
    });
  } finally {
    monitor.stop();
    await client.stop();
    prepared?.cleanup?.();
    releaseCdpPort(cdpPort);
  }
}
