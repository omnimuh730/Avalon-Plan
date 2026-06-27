// PLAN MODE — a cost-optimized alternative to the codex per-command loop.
//
// codex bills one LLM request per command (snapshot→fill→snapshot→fill…), and each
// request re-sends the whole conversation (cached), so a job costs ~$0.1–0.3 regardless
// of model — the spend is cached re-reads, where deepseek and gpt-mini price the same.
//
// Plan mode calls the LLM only ONCE PER PAGE: snapshot → plan (JSON list of steps) →
// [approve] → a DETERMINISTIC runner executes the playwright-cli commands one-by-one with
// ZERO LLM tokens → re-snapshot → re-plan. ~5 LLM calls/job instead of ~100 → ~$0.01–0.02.
// The LLM still reads the live snapshot and plans generically (no hardcoded selectors).

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sessionForRun, closeBrowserSession } from "./codex-apply.mjs";
import { isDeepSeekModel, DEEPSEEK_BASE_URL } from "../core/models.mjs";
import { costFromUsage, formatUsd, emptyUsage, mergeUsage } from "../core/pricing.mjs";
import { PATHS, CONFIG } from "./config.mjs";
import { awaitHumanResume, wasStopped, isAwaitingHuman } from "./human-handoff.mjs";
import { sessionFileFor } from "./mcp-session.mjs";
import { prepareForkedProfile, persistForkedProfile, forkedOpenArgs } from "./chrome-profile.mjs";
import { startBrowserMonitor } from "./browser-monitor.mjs";
import { attachRunResumeFields } from "./run-resume.mjs";

const SECRET_FIELDS = ["openaiApiKey", "deepseekApiKey", "ecomagentApiKey", "gmailAppPassword", "defaultPassword"];
const OTP_SCRIPT = PATHS.gmailOtp;
const MAX_PAGES = 24; // safety ceiling on plan→execute cycles per job

function profileForPrompt(profile) {
  const safe = { ...profile };
  for (const f of SECRET_FIELDS) delete safe[f];
  return safe;
}

// --- playwright-cli runner (deterministic, no LLM) ---------------------------
// ROOT-CAUSE FIX (silent dropdown/required-field failures): playwright-cli ALWAYS exits 0,
// even when an action hard-fails (e.g. `select` on a non-<select> → "Element is not a <select>
// element", or a stale "Ref … not found"). It signals failure ONLY by emitting a `### Error`
// section in its output, never via the exit code. So a plain `code === 0` success check is a
// FALSE POSITIVE on every failed verb — which is exactly why `select` on a React-Select combobox
// (Greenhouse citizenship dropdown etc.) was reported "→ Yes" yet never committed, leaving the
// required field blank and blocking submit forever. Treat the `### Error` marker as failure too.
const PW_ERROR_MARKER = /^###\s*Error\b/m;
function pw(session, args, { timeout = 60000, env = {} } = {}) {
  return new Promise((resolve) => {
    let out = "", err = "";
    let done = false;
    const finish = (code) => { if (!done) { done = true; resolve({ ok: code === 0 && !PW_ERROR_MARKER.test(out + "\n" + err), code, out, err }); } };
    try {
      const child = spawn("playwright-cli", args, {
        cwd: PATHS.agentRuntime,
        env: { ...process.env, PLAYWRIGHT_CLI_SESSION: session, ...env },
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

// Generic DOM enumeration used ONLY when the accessibility snapshot is empty (some sites —
// e.g. Ashby behind a consent overlay — render the form but expose an empty a11y tree, so any
// snapshot-based agent is blind). Not vendor-specific: it lists whatever interactive elements
// exist, with stable CSS-selector "refs" the planner targets exactly like aria refs.
const DOM_FIELDS_JS = `async page => { return await page.evaluate(() => {
  const css = (el) => el.id ? '#' + CSS.escape(el.id) : (el.getAttribute('name') ? el.tagName.toLowerCase() + '[name="' + el.getAttribute('name') + '"]' : '');
  const label = (el) => el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('placeholder') || el.getAttribute('name') || (el.innerText || '').trim();
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const out = []; let i = 0;
  for (const el of document.querySelectorAll('input,textarea,select,button,[role=button],[role=combobox],a[href]')) {
    const tag = el.tagName.toLowerCase(); const type = (el.getAttribute('type') || tag).toLowerCase();
    if (type === 'hidden') continue; if (!vis(el)) continue;
    let ref = css(el); if (!ref) { ref = '[data-aa="f' + i + '"]'; el.setAttribute('data-aa', 'f' + i); } i++;
    const role = tag === 'select' ? 'combobox' : (type === 'checkbox' || type === 'radio') ? type : (tag === 'button' || type === 'button' || type === 'submit' || el.getAttribute('role') === 'button') ? 'button' : (tag === 'a') ? 'link' : 'textbox';
    const opts = tag === 'select' ? [...el.options].map((o) => (o.text || '').trim()).filter(Boolean).slice(0, 25) : null;
    out.push({ ref, role, name: (label(el) || '').replace(/\\s+/g, ' ').trim().slice(0, 70), value: (el.value || '').slice(0, 40), opts });
  }
  return out;
}); }`;

async function domFallbackSnapshot(session) {
  const r = await pw(session, ["run-code", DOM_FIELDS_JS, "--raw"]);
  let list;
  try {
    const m = (r.out || "").match(/\[[\s\S]*\]/);
    list = m ? JSON.parse(m[0]) : null;
  } catch { list = null; }
  if (!Array.isArray(list) || !list.length) return "";
  const lines = list.map((f) => {
    const opts = f.opts && f.opts.length ? `  options: ${f.opts.join(", ")}` : "";
    const val = f.value ? ` value="${f.value}"` : "";
    return `- ${f.role} "${f.name}" [ref=${f.ref}]${val}${opts}`;
  });
  return `DOM FALLBACK — the accessibility tree was empty, so target elements by these CSS-selector refs (use them exactly in "ref"):\n${lines.join("\n")}`;
}

// Robust résumé upload: set the file directly on the <input type=file> (works for hidden /
// custom drag-drop zones where `playwright-cli upload`'s native chooser silently no-ops, which
// left forms stuck on "Missing required field: Resume"). Generic — not vendor-specific.
async function uploadResumeFile(session, file) {
  if (!file) return { ok: false, info: "no résumé file" };
  // Try setInputFiles on the hidden <input> first — works when NO native chooser is
  // open (the common case) and never pops an OS dialog.
  const js = `async page => {
    const p = ${JSON.stringify(file)};
    let inputs = page.locator('input[type=file]');
    let n = await inputs.count();
    if (!n) { try { await page.getByText(/upload|attach|résumé|resume|\\bcv\\b|drag.*drop/i).first().click({ timeout: 2500 }); } catch {} inputs = page.locator('input[type=file]'); n = await inputs.count(); }
    if (!n) return { ok: false, error: 'no file input' };
    try { await inputs.first().setInputFiles(p); return { ok: true, inputs: n }; }
    catch (e) { return { ok: false, error: String(e.message).slice(0, 80) }; }
  }`;
  const r = await pw(session, ["run-code", js, "--raw"], { timeout: 30000 });
  let info = {};
  try { info = JSON.parse((r.out || "").match(/\{[\s\S]*\}/)?.[0] || "{}"); } catch {}
  if (info.ok) return { ok: true, info };

  // setInputFiles failed — usually because the agent clicked an Attach/Upload button
  // and a file chooser is now PENDING (Playwright intercepts it; page.evaluate is
  // blocked, so run-code returns nothing). `playwright-cli upload` fulfils exactly
  // that pending chooser, so try it as the fallback.
  const up = await pw(session, ["upload", file], { timeout: 30000 });
  if (up.ok) return { ok: true, info: { via: "filechooser" } };
  return { ok: false, info: info.error ? info : { error: (up.err || up.out || "upload failed").slice(0, 80) } };
}

// ROOT-CAUSE FIX (re-fill loops): the accessibility snapshot does NOT reliably expose the
// COMMITTED value of a custom combobox (React-Select etc. render the chosen text in a
// sibling node, and our lean filter drops non-control text). Blind to committed state, the
// planner re-opens/re-fills fields it already set → infinite dropdown loops + wasted tokens.
// This generic probe reads the LIVE value of every visible control (native value/checked/
// selected option + the displayed text of custom select widgets) so we can tell the planner
// exactly what is ALREADY SET. Not vendor-specific: it reads whatever the DOM exposes.
const FIELD_VALUES_JS = `async page => { return await page.evaluate(() => {
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const nameOf = (el) => {
    let n = el.getAttribute('aria-label') || '';
    if (!n && el.labels && el.labels[0]) n = el.labels[0].innerText;
    if (!n) { const lb = el.getAttribute('aria-labelledby'); if (lb) n = lb.split(/\\s+/).map((id) => { const e = document.getElementById(id); return e ? e.innerText : ''; }).join(' '); }
    if (!n) n = el.getAttribute('placeholder') || el.getAttribute('name') || '';
    return norm(n).slice(0, 60);
  };
  const out = []; const seen = new Set();
  const push = (name, val) => { name = norm(name); val = norm(val); if (!name || !val) return; const k = name + '=' + val; if (seen.has(k)) return; seen.add(k); out.push(name + ': ' + JSON.stringify(val.slice(0, 60))); };
  for (const el of document.querySelectorAll('input,textarea,select')) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || tag).toLowerCase();
    if (type === 'hidden' || !vis(el)) continue;
    if (tag === 'select') { const o = el.options[el.selectedIndex]; const v = o ? norm(o.text) : ''; if (v && !/^(select|choose|--)/i.test(v)) push(nameOf(el), v); continue; }
    if (type === 'checkbox' || type === 'radio') { if (el.checked) push(nameOf(el), 'checked'); continue; }
    if (type === 'file') { const f = el.files && el.files[0]; if (f) push(nameOf(el) || 'File', f.name); continue; }
    const v = norm(el.value); if (v) push(nameOf(el), v);
  }
  // Custom select widgets: the chosen value is the displayed text inside the control. The
  // de-facto convention across select libraries is a "*single-value*/*multi-value*" node;
  // fall back to a short control innerText that is not a placeholder.
  for (const el of document.querySelectorAll('[role=combobox],[aria-haspopup=listbox]')) {
    if (!vis(el)) continue;
    // Find the wrapping control, NOT the input itself: React-Select's input carries class
    // "select__input", so a combined [class*=select] match resolves to the input (which has no
    // value child) and the committed "single-value" sibling is never found. Prefer the *control*
    // wrapper, then a generic container, so the displayed value is actually read.
    const host = el.closest('[class*="control"]') || el.closest('[class*="container"]') || el.parentElement || el;
    let val = '';
    const sv = host.querySelector && host.querySelector('[class*="singleValue"],[class*="single-value"],[class*="multiValue"],[class*="multi-value"]');
    if (sv) val = norm(sv.innerText);
    if (!val) { const t = norm(host.innerText); if (t && t.length <= 50 && !/^(select|choose|search|type|start typing|\\.\\.\\.)/i.test(t)) val = t; }
    if (val) push(nameOf(el) || nameOf(host), val);
  }
  return out;
}); }`;

async function readFieldValues(session) {
  const r = await pw(session, ["run-code", FIELD_VALUES_JS, "--raw"], { timeout: 15000 });
  let list = [];
  try { const m = (r.out || "").match(/\[[\s\S]*\]/); list = m ? JSON.parse(m[0]) : []; } catch {}
  return Array.isArray(list) ? list : [];
}

// PARADIGM FIX (the #1 loop/cost sink): selecting a custom combobox used to cost the planner
// click(reveal) → re-snapshot → click(option) — three LLM-bearing cycles per dropdown, and
// the re-snapshot churn is exactly where the re-fill loops compounded. This deterministic
// routine commits ANY single-choice control (native <select> OR custom listbox/React-Select)
// in ONE zero-LLM action: open → (type to filter) → pick the best-matching visible option.
// Generic: it matches options by visible text, no vendor selectors or hardcoded values.
// The desired option text is passed as a real argument to page.evaluate (via JSON.stringify),
// so no string interpolation can break the generated browser code or inject anything.
function pickOptionJs(value) {
  return `async page => { return await page.evaluate((want) => {
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  want = norm(want);
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const nodes = [...document.querySelectorAll('[role=option],li[role=option],[class*="option"],[class*="menu"] li,[class*="listbox"] li')].filter(vis);
  if (!nodes.length) return { ok: false, reason: 'no visible options' };
  let best = null, score = -1;
  for (const o of nodes) {
    const t = norm(o.innerText);
    if (!t) continue;
    let sc = 0;
    if (t === want) sc = 4; else if (t.startsWith(want)) sc = 3; else if (want && t.includes(want)) sc = 2; else if (want && want.includes(t)) sc = 1;
    if (sc > score) { score = sc; best = o; }
  }
  if (!best || score <= 0) return { ok: false, reason: 'no option matched' };
  best.scrollIntoView({ block: 'center' });
  best.click();
  return { ok: true, picked: norm(best.innerText) };
}, ${JSON.stringify(String(value ?? ""))}); }`;
}

// Generic "did the value actually commit?" probe — reads the LIVE state of every control
// (native <select> selected option + the displayed single/multi-value of custom widgets) and
// returns true if any now shows the wanted text. We trust THIS, not the CLI exit code, to
// decide whether a combobox is set. No vendor selectors or hardcoded option values.
function comboboxCommittedJs(value) {
  return `async page => page.evaluate((want) => {
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  want = norm(want);
  if (!want) return false;
  const hit = (t) => { t = norm(t); return !!t && !/^(select|choose|--|\\.\\.\\.)/.test(t) && (t === want || t.includes(want) || want.includes(t)); };
  for (const s of document.querySelectorAll('select')) { const o = s.options[s.selectedIndex]; if (o && hit(o.text)) return true; }
  for (const el of document.querySelectorAll('[role=combobox],[aria-haspopup=listbox]')) {
    const ctrl = el.closest('[class*=control]') || el.closest('[class*=container]') || el.parentElement;
    if (!ctrl) continue;
    const sv = ctrl.querySelector('[class*=single-value],[class*=singleValue],[class*=multi-value],[class*=multiValue]');
    if (sv && hit(sv.innerText)) return true;
  }
  return false;
}, ${JSON.stringify(String(value ?? ""))})`;
}

async function comboboxCommitted(session, value) {
  const r = await pw(session, ["run-code", comboboxCommittedJs(value), "--raw"], { timeout: 12000 });
  return /\btrue\b/.test(r.out || "");
}

async function selectCombobox(session, ref, value) {
  if (!ref) return { ok: false, reason: "no ref" };
  const want = String(value ?? "");
  // Native <select> commits directly — no popup to drive. But playwright-cli exits 0 even when
  // the element is NOT a <select> (a custom combobox), so a "successful" exit is not enough —
  // confirm the value actually landed before trusting it; otherwise fall through to the widget path.
  const native = await pw(session, ["select", ref, want], { timeout: 20000 });
  if (native.ok && (await comboboxCommitted(session, want))) return { ok: true, picked: want, via: "native" };
  // Custom widget: open it, type to filter the list, then click the matching option.
  await pw(session, ["click", ref], { timeout: 20000 });
  await pw(session, ["run-code", "--filename=scripts/wait_stable.js"]).catch(() => {});
  await pw(session, ["type", want], { timeout: 15000 }).catch(() => {});
  await pw(session, ["run-code", "--filename=scripts/wait_stable.js"]).catch(() => {});
  const r = await pw(session, ["run-code", pickOptionJs(value), "--raw"], { timeout: 15000 });
  let info = {};
  try { info = JSON.parse((r.out || "").match(/\{[\s\S]*\}/)?.[0] || "{}"); } catch {}
  if (!info.ok) { await pw(session, ["press", "Escape"]).catch(() => {}); } // close stray popup so it doesn't block other fields
  // VERIFY the commit from the live page rather than trusting the click — a clicked option that
  // didn't register (or a closed/empty menu) would otherwise be reported as set and block submit.
  const committed = await comboboxCommitted(session, want);
  if (committed) return { ok: true, picked: info.picked || want, via: info.ok ? "custom" : "verified" };
  return { ok: false, reason: info.reason || "value did not commit" };
}

// Slim the a11y snapshot to the lines a form-planner actually needs. Greenhouse/Workday/
// Ashby etc. put a [ref=…] on EVERY node (incl. job-description prose in `paragraph`/`text`
// and structural `generic` containers), so a "has ref" rule keeps everything. Instead we
// ALLOWLIST interactive/labelled roles (the actual form controls + headings + alerts) and
// drop prose/structure even when it carries a ref. This is the single biggest cache-MISS
// cost per page and typically shrinks a form page ~3–6× (a JD page far more).
const KEEP_ROLE = /\b(textbox|combobox|listbox|option|checkbox|radio|switch|button|menuitem|menuitemcheckbox|menuitemradio|tab|tablist|slider|spinbutton|searchbox|heading|alert|status|dialog|form|link)\b/i;
function leanSnapshot(tree) {
  if (!tree) return tree;
  const lines = tree.split("\n");
  if (lines.length < 60) return tree; // already small — don't bother
  const kept = [];
  for (const line of lines) {
    // Keep only lines that expose an interactive/labelled control, a heading, or an
    // alert/validation message. Everything else (generic/paragraph/img/text/list noise)
    // is dropped — the planner targets controls by ref, so structural prose isn't needed.
    if (KEEP_ROLE.test(line)) kept.push(line);
  }
  const out = kept.join("\n");
  // If filtering nuked almost everything (unexpected format / empty tree), keep the raw tree.
  return out.length > 120 ? out : tree;
}

async function snapshotPage(session, runDir, n) {
  const file = path.join(runDir, `${String(n).padStart(2, "0")}-snap.yml`);
  let tree = "";
  // SPAs (Ashby, Workday, Lever…) render slowly and some expose an empty a11y tree. Each
  // round: settle → try the a11y snapshot → if empty, try a generic DOM read → else wait and
  // retry (up to ~70s). A page that never renders (e.g. bot-blocked) returns empty → the
  // planner will mark it skip rather than hang.
  for (let attempt = 0; attempt < 6; attempt++) {
    await pw(session, ["run-code", "--filename=scripts/wait_stable.js"], { timeout: 20000 }).catch(() => {});
    const r = await pw(session, ["snapshot", "--filename", file, "--depth", "14"]);
    tree = r.out || "";
    try { if (fs.existsSync(file)) tree = fs.readFileSync(file, "utf8"); } catch {}
    if (tree.length > 300 && /ref=|textbox|combobox|button|heading|link/i.test(tree)) break;
    const dom = await domFallbackSnapshot(session).catch(() => "");
    if (dom) return dom.slice(0, 12000);
    await new Promise((res) => setTimeout(res, 3000));
  }
  return leanSnapshot(tree).slice(0, 12000);
}

/** Map one plan step → a playwright-cli argv. Returns null for non-browser actions. */
function stepToArgs(step, { resumePath }) {
  const ref = step.ref || step.selector;
  switch (step.action) {
    case "fill": return ["fill", ref, String(step.value ?? "")];
    case "select": return ["select", ref, String(step.value ?? "")];
    // Atomic single-choice commit (native <select> OR custom listbox/React-Select). Handled
    // by selectCombobox in the executor — this marker just lets the step survive filtering
    // and render in the approval/preview as a single command.
    case "selectOption": return ["selectOption", ref, String(step.value ?? "")];
    case "check": return ["check", ref];
    case "uncheck": return ["uncheck", ref];
    case "click": return ["click", ref];
    case "type": return ["type", String(step.value ?? "")];
    case "press": return ["press", String(step.value ?? "Enter")];
    case "upload": return ["upload", step.file === "resume" ? resumePath : (step.file || resumePath)];
    case "goto": return ["goto", String(step.value || "")];
    default: return null;
  }
}

// --- LLM planner -------------------------------------------------------------
function llmConfig(model, apiKey) {
  const deepseek = isDeepSeekModel(model);
  return {
    base: deepseek ? DEEPSEEK_BASE_URL : "https://api.openai.com/v1",
    key: apiKey || "",
    model: model || "deepseek-v4-flash",
  };
}

const PLAN_SCHEMA = `Return ONLY a JSON object:
{
  "summary": "<one line: what this page/section is>",
  "steps": [
    {"action":"fill|selectOption|check|uncheck|click|type|press|upload","ref":"<exact ref from the snapshot, e.g. e23>","value":"<value if needed>","label":"<field name>","reveals":<true ONLY for a click that adds rows / opens a non-dropdown section that needs a re-snapshot>}
  ],
  "next": "resnapshot | submit | done | human | otp | skip | login",
  "otp_refs": ["<refs of the security/verification code boxes, only when next=otp>"],
  "human_reason": "<only when next=human: the interactive captcha / id check you cannot do>",
  "skip_reason": "<only when next=skip: e.g. job expired / no longer accepting applications / error page>",
  "needs_account_creation": <true only when next=login AND this is a NEW-account signup that needs email confirmation you cannot complete>,
  "flagged": [{"field":"<name>","why":"<why you could not fill it>"}]
}`;

const PLAN_RULES = `Rules:
- Use ONLY refs that appear in the snapshot. Plan ONLY actions valid on the CURRENT snapshot.
- FIELDS ALREADY SET (CRITICAL — the #1 cause of failure is re-touching set fields): the prompt includes a "FIELDS ALREADY SET" list of controls whose committed value was read live from the page. NEVER re-fill, re-select, or re-open any field whose value there already matches what you'd enter. Act ONLY on fields that are still empty, required-and-blank, or showing an error. If everything required is already set, go straight to submit/done — do NOT re-issue fills you already did.
- DROPDOWNS / COMBOBOXES — ONE action, no reveal cycle: for ANY single-choice control (native <select> OR a custom combobox/listbox/React-Select), emit a SINGLE step {"action":"selectOption","ref":"<the combobox/select ref>","value":"<exact option label>","label":"<field>"}. The runner opens it, filters, and clicks the matching option deterministically — so do NOT click to reveal, do NOT set "reveals", and do NOT plan a separate re-snapshot just to pick the option. One selectOption per dropdown. Checkbox/radio → "check".
- Resume upload: use action "upload" with "file":"resume" — this attaches the file directly to the hidden input. Do NOT click/​press the "Attach"/"Upload"/"Choose file"/"Add résumé" button yourself: clicking it opens a file-chooser that blocks the page. If a file-chooser is already open (a prior step clicked such a button), still just emit the "upload" action with "file":"resume" — the runner fulfils the open chooser.
- EEO / voluntary self-id → choose decline / "prefer not to say". Marketing/SMS consent → No. Never invent data; if a value isn't derivable, omit the step and add it to "flagged".
- COOKIE / PRIVACY CONSENT BANNER FIRST: if the page shows a cookie / privacy / consent banner or dialog (text like "This website stores cookies", "We use cookies", "Privacy"), your FIRST step must be to dismiss it — click its "Accept" / "Accept All" / "Agree" / "I Accept" / "Got it" / "Allow all" control (it may be a button or link). A consent overlay blocks clicks on the real page (e.g. the Apply button), so it must be cleared before anything else. Then "next":"resnapshot".
- START APPLICATION / APPLY MENU: if this is a job DESCRIPTION page (not the form yet) with an "Apply" / "Apply Now" / "Start Your Application" button, click it ONCE → "next":"resnapshot". Clicking Apply often reveals an application-method choice (e.g. "Autofill with Resume", "Apply Manually", "Use My Last Application") or a sign-in. ALWAYS PREFER "Autofill with Resume" / "Apply with Resume" / "Use a résumé" when offered (common on Workday): select it, then upload the résumé (action "upload", file "resume") so the form auto-populates, then review/fill anything missing. Only "Apply Manually" if no autofill/résumé option exists.
- ANTI-LOOP (critical): read "ALREADY DONE" — NEVER repeat the same click you just made. If you clicked a button and the page still looks the same, that click already opened a menu/section, a sign-in, or a new view — act on the NEW thing (choose the Autofill/Apply-method option, sign in, scroll, etc.), do NOT click the same button again. If you have clicked the same control ~2 times with no progress, treat the posting as not reachable: "next":"skip" with skip_reason.
- SIGN-IN / CREATE-ACCOUNT page (email + password fields, common on Workday/iCIMS): fill the email field with the applicant's email (in the profile), and fill the password field with the LITERAL token "$PASSWORD" (NEVER a real password — the runner substitutes it). Use the same email+password to register or sign in. After clicking the sign-in/register button, "next":"resnapshot". If it's a brand-new signup that will require email confirmation you can't do, set "next":"login" and "needs_account_creation":true.
- EXPIRED / UNAVAILABLE / ERROR / WRONG PAGE: set "next":"skip" with a short "skip_reason" and fill nothing — when the posting is gone ("no longer accepting applications", "position closed", 404, "job not found") OR the page is NOT this job's application and offers no path to it (a generic careers/job-listing page, a marketing/landing page, the wrong page). BUT a job-description page that HAS an Apply / Apply Now / Start-application button is NOT this case — click Apply and continue (see the START APPLICATION rule). Skipped jobs are marked handled and won't be retried.
- AUTO-SUBMIT: when AUTO_SUBMIT is "yes" and every required field on the page is filled (or already filled from a prior step), you MUST locate the real submit control in the snapshot (a button named "Submit application" / "Submit" / "Apply" / "Send application") and return "next":"submit" with a CLICK on that button as the LAST step. Do NOT return "done" while AUTO_SUBMIT is "yes" unless a REQUIRED field genuinely can't be filled (then "flagged" it). Optional EEO / voluntary self-id are NOT a reason to stop — decline them and submit. If the submit button isn't visible yet (e.g. revealed after the last field), set "next":"resnapshot" to continue. When AUTO_SUBMIT is "no", fill everything then "next":"done".
- FIX VALIDATION ERRORS BEFORE RE-SUBMIT: if the snapshot shows a validation/error banner (e.g. "Your form needs corrections", "Missing entry for required field: X", a field marked required/invalid) OR the Submit button is still present after a submit attempt, the form did NOT submit. Find ONLY the offending/errored field and fix it — for a dropdown use one "selectOption" (not a plain fill); a required upload needs the résumé attached. Do NOT re-do fields already in "FIELDS ALREADY SET". Fix the error, then "next":"submit" again. Do NOT report done.
- Security/verification CODE field (8 boxes etc.): "next":"otp" and put the box refs in "otp_refs".
- Interactive image CAPTCHA / government-id you cannot solve: "next":"human" with "human_reason".`;

async function planPage({ model, apiKey, snapshot, fieldValues = [], profile, job, autoSubmit, resumePath, history }) {
  const cfg = llmConfig(model, apiKey);
  // CACHE-OPTIMIZED MESSAGE LAYOUT — DeepSeek/OpenAI cache the longest IDENTICAL
  // prefix of the request, billing those tokens ~50× cheaper (DeepSeek hit vs miss).
  // So we order from most-stable → most-variable:
  //   [system]  instructions + rules + schema  → identical every call & every job (cached globally)
  //   [user]    job + profile context          → identical across all pages of THIS job (cached after page 1)
  //   [user]    history + page snapshot         → the ONLY cache-MISS tokens each page
  // Previously rules/schema sat AFTER the variable snapshot, so they were a full-price
  // miss on every page. This layout turns the bulk of the prompt into cache hits.
  const sys = [
    "You are a job-application form planner. Given an accessibility snapshot of the current page and the applicant profile, output a precise, minimal plan of browser actions to fill THIS page, as strict JSON. Do not chat.",
    PLAN_RULES,
    PLAN_SCHEMA,
  ].join("\n\n");
  const jobContext = [
    `JOB: ${job?.title || ""}${job?.company ? " @ " + job.company : ""}`,
    `AUTO_SUBMIT: ${autoSubmit ? "yes" : "no"}`,
    `RESUME FILE: ${resumePath || "(none)"}`,
    `APPLICANT PROFILE (only source of truth):\n${JSON.stringify(profileForPrompt(profile))}`,
  ].join("\n");
  const pageContext = [
    history?.length ? `ALREADY DONE (don't repeat): ${history.slice(-8).join("; ")}` : "",
    fieldValues?.length
      ? `FIELDS ALREADY SET (committed values read live from the page — do NOT re-fill, re-select, or re-open any of these; act ONLY on empty / required / errored fields):\n${fieldValues.map((v) => `- ${v}`).join("\n")}`
      : "",
    `ACCESSIBILITY SNAPSHOT (refs like e12 are how you target elements):\n${snapshot}`,
  ].filter(Boolean).join("\n\n");

  // DeepSeek occasionally returns a transient network error / empty body. Retry a few times
  // with backoff so one flaky call doesn't error the whole job.
  let data = null;
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
    try {
      const res = await fetch(`${cfg.base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: sys },
            { role: "user", content: jobContext },
            { role: "user", content: pageContext },
          ],
        }),
      });
      if (!res.ok) { lastErr = `planner ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`; continue; }
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) { lastErr = "empty planner response"; continue; }
      data = json;
      break;
    } catch (e) { lastErr = String(e?.message || e).slice(0, 120); }
  }
  if (!data) throw new Error(lastErr || "planner failed");
  const plan = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  const u = data.usage || {};
  const usage = costFromUsage(model, {
    prompt_tokens: u.prompt_tokens ?? 0,
    completion_tokens: u.completion_tokens ?? 0,
    total_tokens: u.total_tokens ?? 0,
    prompt_cache_hit_tokens: u.prompt_tokens_details?.cached_tokens ?? u.prompt_cache_hit_tokens ?? 0,
    prompt_cache_miss_tokens: u.prompt_cache_miss_tokens,
    prompt_tokens_details: { cached_tokens: u.prompt_tokens_details?.cached_tokens ?? u.prompt_cache_hit_tokens ?? 0 },
  });
  return { plan, usage };
}

/**
 * STRICT, generic submission check — ask the LLM whether the post-submit page is a real
 * success/confirmation (no hardcoded ATS strings). Prevents false "submitted" reports.
 */
async function verifySubmission({ model, apiKey, snapshot, job }) {
  const cfg = llmConfig(model, apiKey);
  const sys = "You verify whether a job application was actually submitted. Look at the page snapshot for an explicit success/confirmation (e.g. a thank-you/confirmation heading or 'application received/submitted' message). A visible Submit button or an unchanged form means NOT submitted. Respond ONLY with JSON.";
  const user = `JOB: ${job?.title || ""}${job?.company ? " @ " + job.company : ""}\n\nPAGE SNAPSHOT:\n${snapshot}\n\nReturn {"submitted": true|false, "reason": "<short evidence from the page>"}`;
  try {
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, temperature: 0, response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: user }] }),
    });
    if (!res.ok) return { submitted: false, reason: `verify ${res.status}` };
    const data = await res.json();
    return JSON.parse(data.choices?.[0]?.message?.content || '{"submitted":false}');
  } catch (e) {
    return { submitted: false, reason: String(e?.message || e).slice(0, 80) };
  }
}

// --- OTP (reuse the python fetcher) -----------------------------------------
function fetchOtp({ profile, job }) {
  return new Promise((resolve) => {
    const args = [OTP_SCRIPT, "--limit", "10", "--company", job?.company || "", "--job", job?.title || "", "--to", profile.email || ""];
    const child = spawn("python3", args, {
      env: { ...process.env, GMAIL_ADDRESS: profile.email || "", GMAIL_APP_PASSWORD: profile.gmailAppPassword || "",
        OTP_LLM_API_KEY: profile.deepseekApiKey || profile.openaiApiKey || "",
        OTP_LLM_BASE_URL: profile.deepseekApiKey ? DEEPSEEK_BASE_URL : "https://api.openai.com/v1",
        OTP_LLM_MODEL: profile.deepseekApiKey ? "deepseek-chat" : "gpt-4o-mini" },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} resolve(null); }, 45000);
    child.stdout.on("data", (d) => { out += String(d); });
    child.on("exit", () => { clearTimeout(t); try { resolve(JSON.parse(out.trim().split("\n").pop())); } catch { resolve(null); } });
    child.on("error", () => { clearTimeout(t); resolve(null); });
  });
}

// --- the loop ----------------------------------------------------------------
/**
 * Apply to one job via the plan→approve→execute→replan loop.
 * Emits dashboard events; gates on approval unless autoApprove.
 */
export async function runApplicationPlan({ url, agentName, emit, autoSubmit, autoApprove, profile, model, apiKey, job, runId, forkedProfile = null }) {
  const step = (level, title, detail) => emit({ type: "step", level, title, detail });
  const session = sessionForRun(runId, agentName);
  const runDir = path.join(PATHS.agentRuntime, "logs", "runs", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
  try { fs.mkdirSync(runDir, { recursive: true }); } catch {}
  let total = emptyUsage();
  const finalUsage = () => ({ ...total, costLabel: formatUsd(total.costUsd) });
  // Emit each page's usage as a DELTA — the dashboard SUMS usage events, so emitting
  // the running cumulative here would double-count. `total` is kept for the done event.
  const emitUsageDelta = (u) => emit({
    type: "usage", model,
    inputTokens: u.inputTokens, cachedTokens: u.cachedTokens, outputTokens: u.outputTokens,
    totalTokens: u.totalTokens, costUsd: u.costUsd, priced: u.priced, costLabel: formatUsd(u.costUsd),
  });
  const history = [];

  const gate = async (kind, payload) => {
    if (autoApprove) return true;
    emit({ type: kind, ...payload });
    emit({ type: "paused", reason: kind === "plan" ? "Approve the plan to continue" : "Approve the commands to run" });
    const note = await awaitHumanResume(runId);
    if (wasStopped(runId) || note === "__stopped__") return false;
    return true;
  };

  const finish = (result, message) => { emit({ type: "done", result, message, usage: finalUsage() }); return { result, message, usage: finalUsage() }; };

  // Credentials substituted at EXECUTION time only — the real password never enters the
  // planner prompt, the plan JSON, or the logs (the planner uses the literal token $PASSWORD).
  const creds = { EMAIL: profile.email || "", PASSWORD: profile.defaultPassword || "", APPLICANT_PASSWORD: profile.defaultPassword || "" };
  const subst = (v) => String(v ?? "").replace(/\$(EMAIL|PASSWORD|APPLICANT_PASSWORD)\b/g, (_, k) => creds[k] ?? "");
  const mask = (v) => String(v ?? "").replace(/\$(PASSWORD|APPLICANT_PASSWORD)\b/g, "••••");

  emit({ type: "status", phase: "navigating", message: "Opening the page" });
  // Open already-signed-in when possible:
  //   1. A forked REAL Chrome profile → launch real Chrome (channel "chrome", NOT
  //      "Chrome for Testing") from the per-run copy.
  //   2. Else a legacy saved storage-state → state-load it.
  //   3. Else a fresh browser.
  const savedSession = sessionFileFor(profile.fullName);
  if (forkedProfile) {
    await pw(session, forkedOpenArgs(forkedProfile, url), { timeout: 120000 });
    step("info", "Browser session", "Forked real Chrome profile — applying signed-in");
  } else if (fs.existsSync(savedSession)) {
    await pw(session, ["open", "--headed"], { timeout: 90000 });
    await pw(session, ["state-load", savedSession]).catch(() => {});
    await pw(session, ["goto", url], { timeout: 90000 });
    step("info", "Browser session", "Loaded saved Chrome session — applying logged-in");
  } else {
    await pw(session, ["open", url, "--headed"], { timeout: 90000 });
  }

  let submitAttempts = 0;
  let doneNudges = 0;
  let stall = 0;
  let lastFingerprint = "\u0000";
  for (let page = 0; page < MAX_PAGES; page++) {
    if (wasStopped(runId)) return finish("stopped", "Stopped by user");

    emit({ type: "status", phase: "planning", message: `Reading & planning page ${page + 1}` });
    const snapshot = await snapshotPage(session, runDir, page);
    // Read the COMMITTED value of every control so the planner can avoid re-touching
    // already-set fields (the root cause of the dropdown re-fill loops). One zero-LLM probe
    // per page, reused for both the planner context and the stall fingerprint below.
    const fieldValues = await readFieldValues(session);

    let plan, usage;
    try {
      ({ plan, usage } = await planPage({ model, apiKey, snapshot, fieldValues, profile, job, autoSubmit, resumePath: profile.resumePath, history }));
    } catch (e) {
      return finish("error", `Planner failed: ${String(e?.message || e).slice(0, 160)}`);
    }
    const pageDelta = { inputTokens: usage.inputTokens, cachedTokens: usage.cachedTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens, costUsd: usage.costUsd, priced: usage.priced };
    total = mergeUsage(total, pageDelta);
    emitUsageDelta(pageDelta); // per-page delta (dashboard accumulates), real-time + kill-resilient
    step("ai", "Plan", `${plan.summary || "(page)"} — ${(plan.steps || []).length} steps → ${plan.next}`);

    // OTP gate: fetch the code and fill the boxes (no LLM per box).
    if (plan.next === "otp") {
      emit({ type: "status", phase: "verifying", message: "Fetching the email security code" });
      let otp = null;
      for (let tryN = 0; tryN < 5 && !otp?.found; tryN++) {
        if (tryN) await new Promise((r) => setTimeout(r, 12000));
        otp = await fetchOtp({ profile, job });
      }
      if (!otp?.found || !otp.code) return finish("error", "Could not fetch the email verification code");
      step("info", "Security code", `Fetched ${otp.code.length}-char code`);
      const chars = String(otp.code).split("");
      const refs = plan.otp_refs || [];
      for (let i = 0; i < chars.length && i < refs.length; i++) await pw(session, ["fill", refs[i], chars[i]]);
      history.push(`entered verification code into ${Math.min(chars.length, refs.length)} boxes`);
      continue; // re-snapshot → plan the submit
    }
    // Expired / unavailable / error posting → skip (don't hang on it during a batch).
    if (plan.next === "skip") {
      return finish("skipped", plan.skip_reason || "Job posting unavailable / expired");
    }
    // New-account signup that needs email confirmation we can't do → pause for the human.
    if (plan.next === "login" && plan.needs_account_creation) {
      step("warn", "Account creation needed", "Sign-up requires email confirmation — a human must create the account, then resume.");
      emit({ type: "paused", reason: "Create the account in the open browser (it needs email confirmation), then resume." });
      const note = await awaitHumanResume(runId, { timeoutMs: CONFIG.handoffTimeoutMs });
      if (wasStopped(runId) || note === "__stopped__") return finish("stopped", "Stopped by user");
      if (note === "__timeout__") return finish("skipped", `Auto-abandoned: no human created the account within ${Math.round(CONFIG.handoffTimeoutMs / 60000)}m`);
      history.push("human created the account");
      continue;
    }
    if (plan.next === "human") {
      step("warn", "Human action needed", plan.human_reason || "Manual step required");
      emit({ type: "paused", reason: plan.human_reason || "A human must complete a step in the browser" });
      const note = await awaitHumanResume(runId, { timeoutMs: CONFIG.handoffTimeoutMs });
      if (wasStopped(runId) || note === "__stopped__") return finish("stopped", "Stopped by user");
      if (note === "__timeout__") return finish("skipped", `Auto-abandoned: no human action within ${Math.round(CONFIG.handoffTimeoutMs / 60000)}m (e.g. CAPTCHA/ID check)`);
      history.push("human completed a manual step");
      continue;
    }

    // Convergence guard: if the COMMITTED field state stops changing across consecutive
    // planning cycles while the planner keeps asking to re-snapshot, we're in a loop (e.g. a
    // dropdown that never commits). Bail instead of burning every page of MAX_PAGES.
    const fingerprint = fieldValues.join("||");
    if (fingerprint === lastFingerprint && plan.next === "resnapshot") stall++; else stall = 0;
    lastFingerprint = fingerprint;
    if (stall >= 3) {
      step("warn", "No progress", "Committed form state stopped changing across cycles — stopping to avoid a loop.");
      return finish(
        fieldValues.length ? "review_pending" : "skipped",
        fieldValues.length
          ? "Stuck: a required field could not be committed after several attempts — left for human review."
          : "Stuck: the page never produced a fillable form.",
      );
    }

    const steps = (plan.steps || []).filter((s) => (s.action === "selectOption" ? !!(s.ref || s.selector) : stepToArgs(s, { resumePath: profile.resumePath })));
    if (!(await gate("plan", { steps, summary: plan.summary, next: plan.next, page: page + 1, flagged: plan.flagged || [] }))) {
      return finish("stopped", "Stopped by user");
    }
    const commands = steps.map((s) => ({ s, args: stepToArgs(s, { resumePath: profile.resumePath }) }));
    if (!(await gate("commands", { commands: commands.map((c) => `playwright-cli ${c.args.map(mask).join(" ")}`), page: page + 1 }))) {
      return finish("stopped", "Stopped by user");
    }

    emit({ type: "status", phase: "filling", message: `Running ${commands.length} commands` });
    let revealed = false;
    for (const { s, args } of commands) {
      if (wasStopped(runId)) return finish("stopped", "Stopped by user");
      let r;
      if (s.action === "upload") {
        // Use setInputFiles, not the native chooser, so the résumé actually attaches.
        const file = s.file === "resume" ? profile.resumePath : (s.file || profile.resumePath);
        r = await uploadResumeFile(session, file);
        step(r.ok ? "success" : "warn", "upload résumé", r.ok ? `attached ${path.basename(file)}` : `failed: ${JSON.stringify(r.info).slice(0, 80)}`);
      } else if (s.action === "selectOption") {
        // Deterministic open→filter→pick — commits the dropdown without any LLM re-snapshot.
        const info = await selectCombobox(session, s.ref, subst(String(s.value ?? "")));
        r = { ok: !!info.ok };
        step(info.ok ? "action" : "warn", "playwright", `selectOption ${s.ref}="${mask(s.value).slice(0, 30)}"${info.ok ? ` → ${info.picked || "ok"}` : ` → ${(info.reason || "failed").slice(0, 60)}`}`);
        // A committed selectOption does NOT need a reveal/replan — the value is already set.
        history.push(`selectOption ${s.label || s.ref}=${mask(s.value).slice(0, 30)}${info.ok ? " (committed)" : " (FAILED)"}`);
        continue;
      } else {
        r = await pw(session, args.map(subst));            // real creds only at exec time
        step(r.ok ? "action" : "warn", "playwright", `${args.map(mask).join(" ").slice(0, 120)}${r.ok ? "" : " → " + (r.err || r.out || "failed").slice(0, 80)}`);
      }
      history.push(`${s.action} ${s.label || s.ref}${s.value ? "=" + mask(s.value).slice(0, 30) : ""}`);
      if (s.reveals) { revealed = true; break; } // DOM mutated → refs stale → replan
    }
    await pw(session, ["run-code", "--filename=scripts/wait_stable.js"]).catch(() => {});

    if (revealed) continue;             // re-snapshot to see revealed options
    if (plan.next === "submit") {
      // STRICT: an LLM must confirm a real success page before we report "submitted".
      emit({ type: "status", phase: "verifying", message: "Verifying the submission" });
      const after = await snapshotPage(session, runDir, `${page}-after`);
      const v = await verifySubmission({ model, apiKey, snapshot: after, job });
      if (v.submitted) {
        step("success", "Submission confirmed", String(v.reason || "").slice(0, 140));
        return finish("submitted", `Submitted — confirmed: ${String(v.reason || "").slice(0, 120)}`);
      }
      // Submit didn't confirm — almost always a validation error (a required field, a custom
      // combobox not committed). Don't give up: re-plan so the planner sees the error and the
      // still-visible Submit button, fixes the field, and submits again.
      submitAttempts++;
      step("warn", `Submit not confirmed (attempt ${submitAttempts})`, String(v.reason || "").slice(0, 130));
      if (submitAttempts >= 3) return finish("submitted_unconfirmed", `Submit clicked but no confirmation after ${submitAttempts} tries: ${String(v.reason || "").slice(0, 100)}`);
      history.push(`SUBMIT attempt ${submitAttempts} did NOT go through — likely a required field is missing/invalid; check the form for errors and fix before submitting again`);
      continue;
    }
    if (plan.next === "done") {
      // The planner thinks the job is finished. With auto-submit ON, "done" should mean a
      // real confirmation page — VERIFY it rather than blindly reporting review_pending (the
      // old bug that mislabelled confirmed Greenhouse submits). When auto-submit is OFF,
      // "done" legitimately means "form filled, awaiting human submit".
      if (!autoSubmit) return finish("review_pending", "Form filled; stopped before submit");
      emit({ type: "status", phase: "verifying", message: "Verifying the page" });
      const after = await snapshotPage(session, runDir, `${page}-done`);
      const v = await verifySubmission({ model, apiKey, snapshot: after, job });
      if (v.submitted) {
        step("success", "Submission confirmed", String(v.reason || "").slice(0, 140));
        return finish("submitted", `Submitted — confirmed: ${String(v.reason || "").slice(0, 120)}`);
      }
      // auto-submit but no confirmation: the planner stopped early. Nudge it to find and click
      // the real Submit (bounded, and the stall guard above is the ultimate backstop).
      doneNudges++;
      if (doneNudges >= 2) return finish("review_pending", `Planner reported done but no confirmation page: ${String(v.reason || "").slice(0, 100)}`);
      history.push("You returned next=done, but AUTO_SUBMIT is ON and this is NOT a confirmation page — locate the real Submit button and submit, or flag the exact required field you cannot fill.");
      continue;
    }
    // next === resnapshot → loop again
  }
  return finish("error", `Gave up after ${MAX_PAGES} pages`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Batch wrapper mirroring runBatchCodex; closes the browser when the run ends. */
export async function runBatchPlan(opts) {
  const { jobs, source, agentName, emit, markApplied, runId, autoApprove } = opts;
  const session = sessionForRun(runId, agentName);
  const applierName = opts.profile.fullName || opts.profile.accountName;
  const resumeTempDir = path.join(os.tmpdir(), "nextoffer-runs", String(runId || "batch"));
  // Fork the chosen REAL Chrome profile ONCE per batch (all jobs share one browser).
  const forked = opts.chromeProfile
    ? prepareForkedProfile({ applierName, chromeProfileDir: opts.chromeProfile, runId })
    : null;
  const jobIndexRef = { current: 0 };
  const monitor = startBrowserMonitor({ runId, session, emit, getJobIndex: () => jobIndexRef.current });
  try {
    emit({ type: "batch", total: jobs.length, source, agentName, generateResumeByAi: !!opts.generateResumeByAi });
    let submitted = 0;
    const results = [];
    for (let i = 0; i < jobs.length; i++) {
      if (wasStopped(runId)) { emit({ type: "done", result: "stopped", message: `Stopped after ${i}/${jobs.length}`, submitted, total: jobs.length }); return; }
      const job = jobs[i];
      jobIndexRef.current = i;
      emit({ type: "job", index: i, total: jobs.length, jobId: job.id, title: job.title, company: job.company, url: job.url, source: job.source });
      const jobEmit = (e) => {
        if (e.type === "done") return emit({ ...e, type: "jobDone", jobIndex: i });
        if (e.type === "paused" || e.type === "usage" || e.type === "step" || e.type === "screenshot") return emit({ ...e, jobIndex: i });
        return emit(e);
      };

      let jobProfile = opts.profile;
      if (opts.generateResumeByAi) {
        const destDir = path.join(resumeTempDir, String(i));
        // Name the upload after the applicant ("Eli Taylor.pdf"), not "resume-<id>".
        const resumeBaseName = String(applierName || "Resume").replace(/[^\w.\-()+ ]+/g, "_").trim() || "Resume";
        const destFilePath = path.join(destDir, `${resumeBaseName}.pdf`);
        fs.mkdirSync(destDir, { recursive: true });
        jobEmit({
          type: "resumeMatch",
          jobIndex: i,
          jobTitle: job.title,
          jobCompany: job.company,
          bestResume: { name: "AI Generated (per job)", scorePercent: 100 },
          resumeStack: "AI Generated",
          aiGenerated: true,
        });
        jobProfile = {
          ...opts.profile,
          resumeStack: "AI Generated",
          resumePath: destFilePath,
          resumeMimeType: "application/pdf",
          resumeFileName: path.basename(destFilePath),
        };
      }

      // Generate the per-job résumé FIRST so the file exists before the apply's upload
      // step (the old Promise.all raced the upload). If generation fails, fall back to the
      // applicant's uploaded résumé instead of breaking the whole application.
      if (opts.generateResumeByAi) {
        try {
          const { ensureAgentJobResumeFile } = await import("./agent-resume-gen.mjs");
          const gen = await ensureAgentJobResumeFile({ applierName, job, destFilePath: jobProfile.resumePath, emit: jobEmit, jobIndex: i, model: opts.model, apiKey: opts.apiKey });
          jobEmit({
            type: "resumeMatch",
            jobIndex: i,
            jobTitle: job.title,
            jobCompany: job.company,
            bestResume: { name: gen.techStack || "AI Generated", scorePercent: 100 },
            resumeStack: gen.techStack || "AI Generated",
            aiGenerated: true,
            generationId: gen.generationId || null,
            resumeId: gen.resumeId || null,
            ...attachRunResumeFields({
              runId: opts.runId,
              jobIndex: i,
              sourcePath: jobProfile.resumePath,
              profileName: applierName,
              resumeId: gen.resumeId,
              generationId: gen.generationId,
              aiGenerated: true,
              resumeFileName: gen.fileName,
            }),
          });
        } catch (e) {
          jobEmit({ type: "step", level: "warn", jobIndex: i, title: "AI résumé failed — using uploaded résumé", detail: String(e?.message || e).slice(0, 160) });
          jobProfile = opts.profile; // fall back to the applicant's existing résumé
        }
      } else if (jobProfile.resumePath) {
        jobEmit({
          type: "resumeMatch",
          jobIndex: i,
          jobTitle: job.title,
          jobCompany: job.company,
          resumeStack: jobProfile.resumeStack || "",
          bestResume: {
            name: jobProfile.resumeStack || path.basename(jobProfile.resumePath),
            scorePercent: 100,
          },
          resumeId: jobProfile.resumeId || null,
          ...attachRunResumeFields({
            runId: opts.runId,
            jobIndex: i,
            sourcePath: jobProfile.resumePath,
            profileName: applierName,
            resumeId: jobProfile.resumeId,
            resumeFileName: jobProfile.resumeFileName,
          }),
        });
      }

      let r;
      try {
        r = await runApplicationPlan({
          url: job.url, agentName, emit: jobEmit, autoSubmit: opts.autoSubmit, autoApprove,
          profile: jobProfile, model: opts.model, apiKey: opts.apiKey, job, runId,
          forkedProfile: forked || null,
        });
      } catch (e) { jobEmit({ type: "done", result: "error", message: String(e?.message || e).slice(0, 200) }); r = { result: "error" }; }
      results.push({ jobId: job.id, title: job.title, result: r.result });
      // Mark both submitted AND skipped as handled so they leave the posted queue
      // (skipped = no apply path / expired / wrong page → don't retry it).
      if (r.result === "submitted" || r.result === "skipped") {
        if (r.result === "submitted") submitted++;
        if (job.id && markApplied) await markApplied(job.id).catch(() => {});
      }
      if (i < jobs.length - 1) await sleep(1200);
    }
    emit({ type: "done", result: "batch_complete", message: `Batch complete — ${submitted}/${jobs.length} submitted`, submitted, total: jobs.length, results });
  } finally {
    monitor.stop();
    // Carry any new logins back into the master, then tear the browser down.
    if (forked) persistForkedProfile(forked);
    await closeBrowserSession(session);
  }
}
