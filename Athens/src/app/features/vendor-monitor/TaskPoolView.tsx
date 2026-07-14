import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Badge, Pill } from "@/app/components/ui";
import { Button } from "@/app/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { PATHS } from "@/app/config/routes";
import { display } from "@/app/lib/utils";
import { JobSourceChip } from "./components/JobSourceChip";
import { useVendorTaskPool } from "./hooks/useVendorTaskPool";
import type { VendorTask, VendorTaskProgress } from "./types";

function progressBadge(progress: VendorTaskProgress) {
  if (progress === "completed") return { label: "Done", className: "bg-emerald-500/15 text-emerald-700" };
  if (progress === "active") return { label: "In session", className: "bg-amber-500/15 text-amber-800" };
  return { label: "Bid ready", className: "bg-sky-500/15 text-sky-700" };
}

function formatAdded(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function TaskRow({
  task,
  busy,
  onMarkDone,
  onRemove,
}: {
  task: VendorTask;
  busy: boolean;
  onMarkDone: () => void;
  onRemove: () => void;
}) {
  const badge = progressBadge(task.progress);
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border/60 last:border-0 hover:bg-muted/30">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate" style={display}>
            {task.title}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badge.className}`}>
            {badge.label}
          </span>
          {task.jobSource ? <JobSourceChip source={task.jobSource} /> : null}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {task.company || "—"}
          {task.location ? ` · ${task.location}` : ""}
          {typeof task.matchScore === "number" ? ` · match ${task.matchScore}` : ""}
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">
          Added {formatAdded(task.addedAt)}
          {task.sessionMatch?.sessionId
            ? ` · session ${task.sessionMatch.sessionId.slice(0, 8)}…`
            : ""}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {task.applyUrl ? (
          <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
            <a href={task.applyUrl} target="_blank" rel="noreferrer" title="Open job">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        ) : null}
        {task.status !== "done" && task.progress !== "completed" ? (
          <Button variant="ghost" size="sm" className="h-8 px-2" disabled={busy} onClick={onMarkDone} title="Mark done">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-rose-600"
          disabled={busy}
          onClick={onRemove}
          title="Remove — returns job to New"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function TaskPoolView() {
  const [filter, setFilter] = useState<"all" | VendorTaskProgress>("all");
  const pool = useVendorTaskPool();

  const monitored = useMemo(() => {
    if (filter === "all") return pool.tasks;
    return pool.tasks.filter((t) => t.progress === filter);
  }, [filter, pool.tasks]);

  if (!pool.ready) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm">
        Select an applier profile in Settings to manage the vendor task pool.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            All <span className="font-semibold text-foreground">Bid ready</span> jobs for this profile.
            Mark jobs Bid ready from{" "}
            <Link to={PATHS.jobs} className="text-primary font-semibold hover:underline">
              Job Search
            </Link>
            . Removing a task returns it to New.
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge v="subtle">Pool {pool.totals.total}</Badge>
            <Badge v="blue">Pending {pool.totals.pending}</Badge>
            <Badge v="amber">Active {pool.totals.active}</Badge>
            <Badge v="success">Done {pool.totals.done}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void pool.refetch()} disabled={pool.loading}>
            {pool.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </Button>
          {pool.tasks.length > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-rose-600" disabled={pool.mutating}>
                  Clear all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear task pool?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Removes bid-ready status from all {pool.tasks.length} jobs for {pool.profileName}. They return to
                    New in Job Search.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void pool.clearPool()}>Clear pool</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>

      {pool.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 p-3 text-sm mb-4">
          {pool.error}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
            {(
              [
                ["all", "All"],
                ["idle", "Pending"],
                ["active", "In session"],
                ["completed", "Done"],
              ] as const
            ).map(([id, label]) => (
              <Pill key={id} active={filter === id} onClick={() => setFilter(id)}>
                {label}
              </Pill>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{monitored.length} shown</span>
        </div>
        {pool.loading && pool.tasks.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading tasks…</div>
        ) : monitored.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No bid-ready jobs yet. Open{" "}
            <Link to={PATHS.jobs} className="text-primary font-semibold hover:underline">
              Job Search
            </Link>{" "}
            and mark jobs as Bid ready.
          </div>
        ) : (
          monitored.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              busy={pool.mutating}
              onMarkDone={() => void pool.updateStatus(task.id, "done")}
              onRemove={() => void pool.removeTask(task.id, task.jobId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
