export const mono = "font-mono tabular-nums";

export const PHASES = ["selecting", "navigating", "planning", "filling", "review", "submitting", "verifying"];

export const PHASE_LABEL: Record<string, string> = {
  starting: "Booting",
  selecting: "Matching résumé",
  navigating: "Navigating",
  planning: "Reading form",
  filling: "Filling",
  review: "Reviewing",
  review_pending: "Review gate",
  submitting: "Submitting",
  verifying: "Verifying",
  paused: "Paused",
};

export function formatAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

export function nowTime(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}
