import { CONFIG } from './engines/config.mjs';

const BASE = CONFIG.athensServerUrl;

async function athensGet(path, query = {}) {
  const url = new URL(`${BASE}/api${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Athens ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function listProfilesFromAthens() {
  const data = await athensGet('/internal/connector/profiles');
  return data.profiles || [];
}

export async function getProfileFromAthens(id) {
  const data = await athensGet(`/internal/connector/profiles/${id}`);
  return data.profile || null;
}

export async function listPostedJobsFromAthens({ applierId, source, skip = 0, limit = 50 } = {}) {
  const data = await athensGet('/internal/connector/jobs/posted', {
    applierId,
    source,
    skip,
    limit,
  });
  return data.jobs || [];
}
