// Resolve which local Athens-server exposes the agent resume API. Dev setups often
// run lancer-backend on :7979 and Athens-server on :8979 — a wrong ATHENS_SERVER_URL
// makes every AI-resume job fail instantly with "API route not found".

import { CONFIG } from "./config.mjs";

let resolvedUrl = null;
let resolvePromise = null;

async function probeResumeApi(base) {
  const url = `${base.replace(/\/$/, "")}/api/personal/resume-generate/for-agent-job`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.error === "API route not found") return false;
    // Route exists when validation fails (400) or the handler responds normally.
    return res.status === 400 || res.ok || (res.status < 500 && data?.success !== undefined);
  } catch {
    return false;
  }
}

/** Pick the Athens-server base URL that exposes /resume-generate/for-agent-job. */
export async function getAthensServerUrl() {
  if (resolvedUrl) return resolvedUrl;
  if (resolvePromise) return resolvePromise;

  resolvePromise = (async () => {
    const configured = CONFIG.athensServerUrl.replace(/\/$/, "");
    const candidates = [...new Set([
      configured,
      "http://127.0.0.1:8979",
      "http://127.0.0.1:7979",
    ])];

    for (const base of candidates) {
      if (await probeResumeApi(base)) {
        resolvedUrl = base;
        if (base !== configured) {
          console.warn(
            `[connector] ATHENS_SERVER_URL=${configured} does not expose the agent resume API — using ${base}`,
          );
        }
        return base;
      }
    }

    resolvedUrl = configured;
    console.warn(
      `[connector] Could not find /resume-generate/for-agent-job on ${candidates.join(", ")} — using ${configured}`,
    );
    return configured;
  })();

  return resolvePromise;
}
