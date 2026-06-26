// Cross-mode apply test: run ONE job through a chosen engine with Tracy Nguyen's
// Mongo profile + forked Chrome profile, auto-submit. Modes: claude-cli | claude-mcp
// | codex | plan. Usage: MODE=claude-cli JOB_URL=... JOB_TITLE=... JOB_COMPANY=... node run-mode-test.mjs
import { MongoClient } from "mongodb";
import { transformAutoBidProfile } from "./src/core/profiles.mjs";
import { prepareForkedProfile, persistForkedProfile } from "./src/engines/chrome-profile.mjs";
import { sessionForRun, closeBrowserSession } from "./src/engines/codex-apply.mjs";
import { CONFIG } from "./src/engines/config.mjs";

const MODE = process.env.MODE || "claude-cli";
const URL = process.env.JOB_URL;
const RESUME = "/Users/robin/Desktop/Utils/NextOffer/Athens-server/.local/agent-resumes/2026-06-26T01-40-41/Tracy Nguyen-6a39dae8a1ee00dcb2ba33db.pdf";
if (!URL) { console.error("set JOB_URL"); process.exit(1); }

const c = new MongoClient("mongodb://127.0.0.1:27017");
await c.connect();
const account = await c.db("AthensDB").collection("account_info").findOne({ name: /Tracy/i });
await c.close();

const profile = transformAutoBidProfile(account);
profile.resumePath = RESUME;
profile.resumeFileName = "Tracy Nguyen.pdf";
profile.resumeMimeType = "application/pdf";
profile.resumeStack = "AI Generated";

const model = "deepseek-v4-flash";
const apiKey = account.autoBidProfile.deepseekApiKey;
const job = { title: process.env.JOB_TITLE || "(role)", company: process.env.JOB_COMPANY || "(company)", url: URL };
const runId = "modetest_" + Date.now().toString(36);
const agentName = "Tracy";

const emit = (e) => {
  if (e.type === "step") console.log(`  [${e.level}] ${e.title}${e.detail ? " — " + String(e.detail).slice(0, 160) : ""}`);
  else if (e.type === "status") console.log(`STATUS: ${e.phase} — ${e.message}`);
  else if (e.type === "done") console.log(`\n==> DONE: result=${e.result} | ${e.message}`);
  else if (e.type === "paused") console.log(`PAUSED: ${e.reason}`);
};

const session = sessionForRun(runId, agentName);
let forked = null;
try {
  if (MODE === "plan") {
    const { runApplicationPlan } = await import("./src/engines/plan-apply.mjs");
    forked = prepareForkedProfile({ applierName: "Tracy Nguyen", chromeProfileDir: null, runId });
    const r = await runApplicationPlan({ url: URL, agentName, emit, autoSubmit: true, autoApprove: true, profile, model, apiKey, job, runId, forkedProfile: forked });
    console.log("RESULT:", JSON.stringify({ result: r.result, message: r.message, cost: r.usage?.costLabel }));
  } else if (MODE === "claude-cli" || MODE === "claude-mcp") {
    const { runApplicationClaude } = await import("./src/engines/claude-apply.mjs");
    const engine = MODE === "claude-mcp" ? "mcp" : "cli";
    if (engine === "cli") forked = prepareForkedProfile({ applierName: "Tracy Nguyen", chromeProfileDir: null, runId });
    const r = await runApplicationClaude({
      url: URL, agentName, emit, profile, model, apiKey, job, runId, autoSubmit: true,
      claudeBin: CONFIG.claudeBin, claudeCwd: CONFIG.claudeCwd, claudeMcpCwd: CONFIG.claudeCwd,
      claudeEngine: engine, forkedProfile: forked, chromeProfile: "",
    });
    console.log("RESULT:", JSON.stringify({ result: r.result, message: r.message, cost: r.usage?.costLabel }));
  } else if (MODE === "codex") {
    const { runApplicationCodex } = await import("./src/engines/codex-apply.mjs");
    const { ensureDeepSeekProxy } = await import("./src/engines/proxy-control.mjs");
    forked = prepareForkedProfile({ applierName: "Tracy Nguyen", chromeProfileDir: null, runId });
    const proxyUrl = await ensureDeepSeekProxy();
    const r = await runApplicationCodex({
      url: URL, agentName, emit, profile, model, apiKey, job, runId, autoSubmit: true,
      codexPath: CONFIG.codexBin, proxyUrl, forkedProfile: forked,
    });
    console.log("RESULT:", JSON.stringify({ result: r.result, message: r.message, cost: r.usage?.costLabel }));
  } else { console.error("unknown MODE", MODE); }
} catch (e) {
  console.error("HARNESS ERROR:", e?.stack || e);
} finally {
  if (forked) persistForkedProfile(forked);
  await closeBrowserSession(session).catch(() => {});
}
process.exit(0);
