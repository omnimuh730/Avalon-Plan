import { CONFIG } from './config.mjs';

/** Point codex-rs at unified-ai-server Responses API (no local proxy process). */
export function deepseekProxyUrl() {
  return `${CONFIG.unifiedAiUrl}/v1`;
}

export async function ensureDeepSeekProxy() {
  try {
    const r = await fetch(`${CONFIG.unifiedAiUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`unified-ai-server unhealthy (${r.status})`);
    return deepseekProxyUrl();
  } catch (err) {
    throw new Error(`unified-ai-server not reachable at ${CONFIG.unifiedAiUrl}: ${err?.message || err}`);
  }
}

export function stopDeepSeekProxy() {
  /* no-op — unified-ai-server is external */
}
