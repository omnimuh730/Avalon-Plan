import { DollarSign } from "lucide-react";
import { mono } from "../../lib/constants";
import { formatRunCost } from "../../lib/runUsage";
import type { JobView, RunMeta, RunUsage } from "./types";

function UsageGrid({ usage }: { usage: RunUsage }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div><span className="text-muted-foreground">Input</span><div className={`${mono} font-semibold`}>{usage.inputTokens.toLocaleString()}</div></div>
      <div><span className="text-muted-foreground">Cached</span><div className={`${mono} font-semibold`}>{usage.cachedTokens.toLocaleString()}</div></div>
      <div><span className="text-muted-foreground">Output</span><div className={`${mono} font-semibold`}>{usage.outputTokens.toLocaleString()}</div></div>
      <div><span className="text-muted-foreground">Total</span><div className={`${mono} font-semibold`}>{usage.totalTokens.toLocaleString()}</div></div>
      <div className="col-span-2 pt-1 border-t border-border/60">
        <span className="text-muted-foreground">Cost</span>
        <div className={`${mono} font-bold text-primary`}>{usage.costLabel || formatRunCost(usage.costUsd)}</div>
      </div>
    </div>
  );
}

export function LiveRunUsageCard({
  usage,
  meta,
  jobLabel,
  jobs,
  selectedIndex,
  batchUsage,
  isBatch,
}: {
  usage: RunUsage | null;
  meta: RunMeta;
  jobLabel?: string;
  jobs?: JobView[];
  selectedIndex?: number;
  batchUsage?: RunUsage | null;
  isBatch?: boolean;
}) {
  const model = usage?.model || meta.model || "model";
  const jobsWithUsage = (jobs ?? []).filter((j) => j.usage);

  if (!usage && !jobsWithUsage.length) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <DollarSign size={12} />Token usage · {model}
      </p>

      {usage ? (
        <div className="rounded-xl border border-border bg-secondary/30 px-3.5 py-3 space-y-2">
          {jobLabel && (
            <p className="text-[11px] font-medium text-muted-foreground truncate">{jobLabel}</p>
          )}
          <UsageGrid usage={usage} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground px-1 mb-2">No usage recorded for this job yet.</p>
      )}

      {isBatch && jobsWithUsage.length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-secondary/20 px-3.5 py-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Per job</p>
          <ul className="space-y-1.5">
            {jobsWithUsage.map((job) => {
              const u = job.usage!;
              const isSelected = job.index === selectedIndex;
              const label = job.title || job.company
                ? `Job ${job.index + 1} · ${[job.title, job.company].filter(Boolean).join(" @ ")}`
                : `Job ${job.index + 1}`;
              return (
                <li
                  key={job.index}
                  className={`flex items-start justify-between gap-2 text-xs rounded-lg px-2 py-1.5 ${isSelected ? "bg-primary/10 ring-1 ring-primary/25" : ""}`}
                >
                  <span className={`min-w-0 truncate ${isSelected ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                  <span className={`${mono} shrink-0 font-semibold tabular-nums ${isSelected ? "text-primary" : "text-foreground"}`}>
                    {u.costLabel || formatRunCost(u.costUsd)}
                  </span>
                </li>
              );
            })}
          </ul>

          {batchUsage && (
            <div className="pt-2 mt-1 border-t border-border/60 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Batch total</span>
              <span className={`${mono} text-sm font-bold text-primary tabular-nums`}>
                {batchUsage.costLabel || formatRunCost(batchUsage.costUsd)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
