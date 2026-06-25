function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

function normalizeConfiguredApiBase(raw: string): string {
  if (!/^https?:\/\//i.test(raw)) {
    return trimTrailingSlashes(raw) || "/api";
  }
  const u = new URL(raw);
  const path = trimTrailingSlashes(u.pathname) || "/";
  if (path === "/" || path === "") {
    u.pathname = "/api";
  }
  return trimTrailingSlashes(u.toString());
}

/**
 * REST base including `/api` suffix.
 * - `SERVER_API_URL` / `VITE_API_URL`: full URL to Athens-server, e.g. `http://127.0.0.1:8979/api`
 * - Dev proxy: set `VITE_DEV_RELATIVE_API=1` and use same-origin `/api` (see vite.config.ts)
 */
export function resolveApiBase(): string {
  const server = import.meta.env.SERVER_API_URL?.trim();
  const vite = import.meta.env.VITE_API_URL?.trim();
  const raw = server || vite;
  if (raw) {
    return normalizeConfiguredApiBase(raw);
  }
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_RELATIVE_API === "1") {
    return "/api";
  }
  if (import.meta.env.DEV) {
    const port = import.meta.env.VITE_BACKEND_PORT ?? "8979";
    return `http://127.0.0.1:${port}/api`;
  }
  return "/api";
}

export const API_BASE = resolveApiBase();
