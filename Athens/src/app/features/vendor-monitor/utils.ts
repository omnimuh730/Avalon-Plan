import {
  Activity,
  CheckCircle2,
  MousePointerClick,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { BidRecord } from "./types";

export function formatCost(cost: number | null | undefined): string {
  if (cost === null || cost === undefined) return "n/a";
  if (cost === 0) return "$0";
  if (cost < 0.01) return `$${cost.toFixed(5)}`;
  return `$${cost.toFixed(4)}`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function durationLabel(start: string, end: string | null): string {
  if (!end) return "live";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${sec % 60}s`;
}

export const RECORD_META: Record<
  BidRecord["type"],
  { label: string; icon: LucideIcon; color: string }
> = {
  "session-start": { label: "Start", icon: Activity, color: "text-emerald-500" },
  process: { label: "Click", icon: MousePointerClick, color: "text-amber-500" },
  analysis: { label: "Analysis", icon: Sparkles, color: "text-blue-500" },
  "session-complete": { label: "Done", icon: CheckCircle2, color: "text-indigo-500" },
};
