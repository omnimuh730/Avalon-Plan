// Apply to one job using Hermes Agent (via its ACP server) as the agent.
//
// The "hermes" provider counterpart to runApplicationClaude. Hermes drives the
// browser itself through its OWN Playwright MCP + Gmail MCP and its
// greenhouse-apply / workday-apply skills (all loaded from the hermes-agent repo
// config, exactly as scripts/job-apply-start.sh sets up). The connector only
// composes a short prompt, runs one ACP turn (runHermesAgent), and translates the
// event stream into AgentForce's dashboard vocabulary — same shape as the
// codex / claude-code paths so the live-run UI works identically.
//
// Model/provider is whatever Hermes is configured with (~/.hermes), so usage is
// best-effort: Hermes owns billing and the ACP stream isn't priced here.

import { runHermesAgent } from "./hermes-runner.mjs";
import { parseResult, runBatchCodex, sessionForRun, usageToAgentForce } from "./codex-apply.mjs";
import { formatUsd } from "../core/pricing.mjs";

/** Compose the (deliberately short) task prompt for Hermes. Hermes already carries
 *  the job-apply skills + operating rules, so this is essentially the proven
 *  job-apply prompt: the facts plus the submit/result contract. */
export function buildHermesApplyPrompt({ url, job, profile, resumePath, autoSubmit = false }) {
  const lines = [
    "Apply to this job for me using your job-apply skill and your browser tools.",
    "",
    `Job: ${job?.title || "(role)"}${job?.company ? ` at ${job.company}` : ""}`,
    `URL: ${url}`,
    "",
    "Applicant profile (JSON):",
    JSON.stringify(profile, null, 2),
    "",
    `Resume file to upload: ${resumePath || "(none)"}`,
    "Upload EXACTLY that file path for the resume/CV field — do NOT substitute, rename, or pick any other file.",
    "",
    autoSubmit
      ? "AUTO-SUBMIT is ON: after every required field is filled, click the real Submit button, then take a snapshot to confirm a thank-you / application-received page BEFORE you report RESULT: submitted. If Submit is still visible or validation errors show, fix them and retry — do NOT report submitted until the confirmation page is visible."
      : "Fill everything but do NOT click the final Submit; end with RESULT: review_pending.",
    "",
    "DECIDE — is this the job's application?",
    "- A multi-step flow is NORMAL: a job-description page with an \"Apply\" / \"Apply Now\" button → click it, then fill the form. Greenhouse / Workday / iCIMS work this way — do NOT skip just because the form isn't shown yet.",
    "- ONLY end with `RESULT: skipped — <reason>` if the page truly has no way to apply: a generic listing page with no apply control, an expired/removed posting, a 404, or clearly the wrong page.",
    "",
    "When done, end with one line: RESULT: <submitted|review_pending|skipped|error> — <short reason>",
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Apply to one job with Hermes. Same opts shape as runApplicationClaude (accepts
 * the codex superset so the shared batch loop passes one object) plus the Hermes
 * launch config (hermesPython / hermesCwd / hermesEnvVars) bound by runBatchHermes.
 */
export async function runApplicationHermes({
  url,
  agentName,
  emit,
  profile,
  job,
  signal,
  autoSubmit,
  runId,
  hermesPython,
  hermesCwd,
  hermesEnvVars = {},
  // Accepted-but-unused (codex/claude-specific) so the batch loop can pass one shape:
  model, apiKey, proxyUrl, codexPath, claudeBin, claudeCwd, claudeMcpCwd, claudeEngine,
  forkedProfile, chromeProfile, resumeGenerating,
}) {
  const step = (level, title, detail) => emit({ type: "step", level, title, detail });

  emit({ type: "status", phase: "starting", message: `Agent "${agentName}" booting for ${profile.fullName}` });
  emit({ type: "meta", profileName: profile.fullName, model: "hermes", resumeStack: profile.resumeStack, resumePath: profile.resumePath, url, role: job?.title, company: job?.company });
  step("info", "Profile", `${profile.fullName} · resume: ${profile.resumeStack || "default"}`);
  step("info", "Engine", "hermes → ACP · Hermes drives via its own Playwright + Gmail MCP & job-apply skills");

  // Running total, accumulated from per-call usage DELTAS parsed out of Hermes'
  // stderr log. Each delta is priced at DeepSeek rates and forwarded as its own
  // dashboard usage event, so cost ticks up in real time (and a killed run still
  // reports what it already spent) — same scheme as the claude-code path.
  let total = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };

  // Translate runner events → dashboard steps. Same vocabulary as the claude path.
  // Message/Thinking text is sent in FULL (Athens renders it with break-words and
  // no clamp) so the dashboard mirrors Hermes' terminal transcript.
  const onEvent = (e) => {
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
        // Price this call's delta at the model Hermes actually used (deepseek-*),
        // not the modal's model — the stderr log carries the real model name.
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

  // Secrets passed via env (never in the prompt) so Hermes can self-resolve any
  // login / Gmail-OTP gate with its own MCP tools. Merged on top of the parsed
  // ~/.hermes/.env (CUSTOM_API_KEY etc.) the connector loaded at startup.
  const env = {
    ...hermesEnvVars,
    PLAYWRIGHT_CLI_SESSION: sessionForRun(runId, agentName),
    GMAIL_ADDRESS: profile.email || "",
    GMAIL_APP_PASSWORD: profile.gmailAppPassword || "",
    APPLICANT_PASSWORD: profile.defaultPassword || "",
  };

  const res = await runHermesAgent({
    hermesPython,
    cwd: hermesCwd,
    env,
    prompt: buildHermesApplyPrompt({ url, job, profile, resumePath: profile.resumePath, autoSubmit }),
    onEvent,
    signal,
  });

  // Per-call deltas were already emitted above (priced at DeepSeek rates); the
  // done event just carries the accumulated total (no extra usage emit, to avoid
  // double-counting).
  const usage = { ...total, priced: true, costLabel: formatUsd(total.costUsd) };

  if (res.failure || res.exitCode !== 0) {
    const message = res.failure || `hermes exited ${res.exitCode}: ${String(res.stderr || "").slice(0, 200)}`;
    emit({ type: "done", result: "error", message, usage });
    return { result: "error", message, usage, threadId: res.threadId };
  }

  const { result, message } = parseResult(res.finalMessage);
  emit({ type: "done", result, message, usage });
  return { result, message, usage, threadId: res.threadId };
}

/**
 * Apply to a batch of jobs with Hermes. Reuses the shared batch loop (resume
 * matching, AI-resume generation, MongoDB marking, dashboard framing) — only the
 * per-job runner differs. The Hermes launch config (hermesPython / hermesCwd /
 * hermesEnvVars) isn't part of the per-job call the loop makes, so we bind it here
 * via a closure rather than threading it through the shared codex loop.
 */
export function runBatchHermes(opts) {
  const { hermesPython, hermesCwd, hermesEnvVars } = opts;
  return runBatchCodex({
    ...opts,
    runApplication: (jobOpts) => runApplicationHermes({ ...jobOpts, hermesPython, hermesCwd, hermesEnvVars }),
  });
}
