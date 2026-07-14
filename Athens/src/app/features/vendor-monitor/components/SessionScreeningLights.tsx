import type { BidFlagVerdicts } from "../types";

type LightStatus = "green" | "red" | "unknown";

function TrafficLight({ label, status }: { label: string; status: LightStatus }) {
  const dot =
    status === "green"
      ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
      : status === "red"
        ? "bg-red-500 animate-pulse"
        : "bg-muted-foreground/40";
  const text =
    status === "green"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "red"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md border border-border/60 bg-muted/20 px-1 py-1 min-w-0">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
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
      <div className="grid grid-cols-3 gap-1">
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
