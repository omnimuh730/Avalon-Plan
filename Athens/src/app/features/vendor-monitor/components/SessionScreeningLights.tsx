import { CheckCircle2, ShieldCheck } from "lucide-react";
import type { BidFlagVerdicts } from "../types";

type LightStatus = "green" | "red" | "unknown";

function TrafficLight({ label, status }: { label: string; status: LightStatus }) {
  const shell =
    status === "green"
      ? "border-emerald-500/35 bg-emerald-500/10"
      : status === "red"
        ? "border-red-500/40 bg-red-500/10"
        : "border-border/70 bg-muted/30";
  const dot =
    status === "green"
      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]"
      : status === "red"
        ? "bg-red-500 animate-pulse"
        : "bg-muted-foreground/35";
  const text =
    status === "green"
      ? "text-emerald-700 dark:text-emerald-400"
      : status === "red"
        ? "text-red-700 dark:text-red-400"
        : "text-muted-foreground";
  return (
    <div className={`flex flex-col items-center gap-1 rounded-xl border px-1.5 py-1.5 min-w-0 ${shell}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className={`text-[9px] font-semibold text-center leading-tight ${text}`}>{label}</span>
    </div>
  );
}

interface SessionScreeningLightsProps {
  jdAnalyzed: boolean;
  flags?: BidFlagVerdicts | null;
  /** Show red-flag explanations under the lights (detail panel). */
  showReasons?: boolean;
  className?: string;
}

/** Compact JD / Remote / No clearance traffic lights — mirrors bid-assistant Screening. */
export function SessionScreeningLights({
  jdAnalyzed,
  flags,
  showReasons = false,
  className = "",
}: SessionScreeningLightsProps) {
  const remoteStatus: LightStatus = flags?.remote ? flags.remote.status : "unknown";
  const clearanceStatus: LightStatus = flags?.clearance ? flags.clearance.status : "unknown";
  const reasons = showReasons
    ? [
        flags?.remote?.status === "red"
          ? { label: "Remote", text: flags.remote.explanation }
          : null,
        flags?.clearance?.status === "red"
          ? { label: "Clearance", text: flags.clearance.explanation }
          : null,
      ].filter((entry): entry is { label: string; text: string } => Boolean(entry?.text))
    : [];

  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-1.5">
        <TrafficLight label="JD" status={jdAnalyzed ? "green" : "unknown"} />
        <TrafficLight label="Remote" status={remoteStatus} />
        <TrafficLight label="No clearance" status={clearanceStatus} />
      </div>
      {reasons.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {reasons.map((reason) => (
            <li key={reason.label} className="text-[10px] text-red-600 dark:text-red-300 leading-snug">
              <span className="font-semibold">{reason.label}:</span> {reason.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Shown when completed session passes screening + matched recommended resume. */
export function RequirementsMetBadge({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 to-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 ${className}`}
        title="Completed with screening clear and matching resume"
      >
        <ShieldCheck className="w-3 h-3 shrink-0" />
        Requirements met
      </span>
    );
  }

  return (
    <div
      className={`rounded-xl border border-emerald-500/35 bg-gradient-to-br from-emerald-500/12 via-teal-500/8 to-transparent px-3 py-2.5 ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            All requirements kept
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-emerald-800/80 dark:text-emerald-200/75">
            Analyzed, completed, screening clear (no red flags), and resume matches the recommendation.
          </p>
        </div>
      </div>
    </div>
  );
}
