import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  SkipForward,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Pill } from "@/app/components/ui";
import { Button } from "@/app/components/ui/button";
import { PaginationBar } from "@/app/components/shared/PaginationBar";
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
import { DEFAULT_JOB_FILTERS, type JobSearchFilterState } from "@/app/hooks/useJobSearchFilters";
import { JobSearchFilterPanel } from "@/app/features/job-search/components/JobSearchFilterPanel";
import { JobListView } from "@/app/features/job-search/components/JobListView";
import { useJobsList } from "@/app/features/job-search/hooks/useJobsList";
import { useJobSelection } from "@/app/features/job-search/hooks/useJobSelection";
import type { Job } from "@/app/types";
import { display } from "@/app/lib/utils";
import { JobSourceChip } from "./components/JobSourceChip";
import { useVendorTaskPool } from "./hooks/useVendorTaskPool";
import type { VendorTask, VendorTaskProgress } from "./types";

type PoolMode = "edit" | "monitor";

const POOL_FILTERS: JobSearchFilterState = {
  ...DEFAULT_JOB_FILTERS,
  statusTab: "posted",
  sort: "matchScore",
};

function progressBadge(progress: VendorTaskProgress) {
  if (progress === "completed") return { label: "Done", className: "bg-emerald-500/15 text-emerald-700" };
  if (progress === "active") return { label: "In session", className: "bg-amber-500/15 text-amber-800" };
  if (progress === "skipped") return { label: "Skipped", className: "bg-muted text-muted-foreground" };
  return { label: "Pending", className: "bg-blue-500/15 text-blue-700" };
}

function formatAdded(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function jobPoolKey(job: Pick<Job, "id" | "backendId">) {
  return job.backendId || job.id;
}

function MonitorRow({
  task,
  busy,
  onMarkDone,
  onSkip,
  onReopen,
  onRemove,
}: {
  task: VendorTask;
  busy: boolean;
  onMarkDone: () => void;
  onSkip: () => void;
  onReopen: () => void;
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
        {task.status !== "skipped" ? (
          <Button variant="ghost" size="sm" className="h-8 px-2" disabled={busy} onClick={onSkip} title="Skip">
            <SkipForward className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-8 px-2" disabled={busy} onClick={onReopen} title="Reopen">
            <ListChecks className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-8 px-2 text-rose-600" disabled={busy} onClick={onRemove} title="Remove">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function TaskPoolView() {
  const [mode, setMode] = useState<PoolMode>("edit");
  const [filters, setFilters] = useState<JobSearchFilterState>(POOL_FILTERS);
  const [showScores, setShowScores] = useState(false);
  const [monitorFilter, setMonitorFilter] = useState<"all" | VendorTaskProgress>("all");
  const [pickedById, setPickedById] = useState<Map<string, Job>>(() => new Map());

  const pool = useVendorTaskPool();
  const {
    jobs,
    total,
    loading: jobsLoading,
    page,
    pageSize,
    setPage,
    setPageSize,
    statusCounts,
    removeJobsById,
    refreshStatusCounts,
  } = useJobsList(filters);
  const { selectedIds, selectJob, selectAllOnPage, clearSelection } = useJobSelection(jobs);

  // Keep pool editor locked to not-yet-applied jobs.
  useEffect(() => {
    if (filters.statusTab !== "posted") {
      setFilters((prev) => ({ ...prev, statusTab: "posted" }));
    }
  }, [filters.statusTab]);

  // Sync selection → picked snapshot (survives pagination).
  useEffect(() => {
    setPickedById((prev) => {
      const next = new Map(prev);
      for (const job of jobs) {
        if (selectedIds.has(job.id)) next.set(job.id, job);
        else next.delete(job.id);
      }
      for (const id of [...next.keys()]) {
        if (!selectedIds.has(id)) next.delete(id);
      }
      return next;
    });
  }, [jobs, selectedIds]);

  useEffect(() => {
    clearSelection();
    setPickedById(new Map());
  }, [filters, clearSelection]);

  const pageIds = jobs.map((j) => j.id);
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

  const pickedJobs = useMemo(() => [...pickedById.values()], [pickedById]);
  const selectableJobs = useMemo(
    () => pickedJobs.filter((j) => !pool.poolJobIds.has(jobPoolKey(j))),
    [pickedJobs, pool.poolJobIds],
  );

  const monitored = useMemo(() => {
    if (monitorFilter === "all") return pool.tasks;
    return pool.tasks.filter((t) => t.progress === monitorFilter);
  }, [monitorFilter, pool.tasks]);

  const addSelected = async () => {
    if (!selectableJobs.length) {
      toast.message("Nothing new to add", {
        description: "Select New (not-yet-applied) jobs that are not already in the pool.",
      });
      return;
    }
    try {
      const result = await pool.addJobs(selectableJobs);
      const addedIds = selectableJobs.map((j) => j.id);
      removeJobsById(addedIds);
      void refreshStatusCounts();
      clearSelection();
      setPickedById(new Map());
      toast.success(`Added ${result.addedCount} to task pool`, {
        description: result.skippedCount
          ? `${result.skippedCount} already in pool`
          : "Marked as Bid ready in Job Search",
      });
    } catch {
      /* error surfaced on pool.error */
    }
  };

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
            Assign New jobs to this vendor as tasks. Adding a job permanently marks it{" "}
            <span className="font-semibold text-foreground">Bid ready</span> in Job Search. Use the
            sidebar or Job Search button above to leave this page.
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
          <div className="flex items-center gap-1 bg-secondary rounded-xl p-1">
            <Pill active={mode === "edit"} onClick={() => setMode("edit")}>
              Edit pool
            </Pill>
            <Pill active={mode === "monitor"} onClick={() => setMode("monitor")}>
              Monitor
            </Pill>
          </div>
        </div>
      </div>

      {pool.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 p-3 text-sm mb-4">
          {pool.error}
        </div>
      ) : null}

      {mode === "edit" ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <ClipboardList className="w-3.5 h-3.5" />
              Browsing <span className="font-semibold text-foreground">New</span> (not-yet-applied) jobs only
            </div>
            <JobSearchFilterPanel
              filters={filters}
              onChange={setFilters}
              statusCounts={statusCounts}
              showScoresOnCards={showScores}
              onShowScoresOnCardsChange={setShowScores}
              showStatusTabs={false}
              showSkillsTools={false}
            />

            <div className="sticky top-0 z-20 -mx-1 px-1 mb-3">
              <div className="rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-sm px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
                <label className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={() => selectAllOnPage(pageIds, allOnPageSelected)}
                    className="rounded border-border"
                  />
                  {selectedOnPage}/{pageIds.length} on page
                  {selectedIds.size > 0 ? (
                    <span className="text-muted-foreground">· {selectedIds.size} selected</span>
                  ) : null}
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => void addSelected()}
                    disabled={pool.mutating || selectableJobs.length === 0}
                    className="gap-1.5"
                  >
                    {pool.mutating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add to pool ({selectableJobs.length})
                  </Button>
                </div>
                <PaginationBar
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  pageSizeOptions={[10, 25, 50, 100]}
                  detailed
                  className="py-0 px-0 w-full sm:w-auto"
                />
              </div>
            </div>

            {jobsLoading && jobs.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                Loading jobs…
              </div>
            ) : (
              <JobListView
                jobs={jobs}
                selectedIds={selectedIds}
                onSelectJob={selectJob}
                showScores={showScores}
              />
            )}
          </div>

          <aside className="rounded-xl border border-border bg-card shadow-sm overflow-hidden xl:sticky xl:top-0">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-foreground" style={display}>
                  Task pool
                </h3>
                <p className="text-[11px] text-muted-foreground">{pool.tasks.length} jobs assigned</p>
              </div>
              {pool.tasks.length > 0 ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 text-rose-600" disabled={pool.mutating}>
                      Clear
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear task pool?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Removes all {pool.tasks.length} assigned jobs for {pool.profileName}. This cannot be undone.
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
            <div className="max-h-[70vh] overflow-y-auto">
              {pool.loading && pool.tasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">Loading pool…</div>
              ) : pool.tasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Select jobs on the left and add them to this vendor&apos;s task pool.
                </div>
              ) : (
                pool.tasks.map((task) => {
                  const badge = progressBadge(task.progress);
                  return (
                    <div
                      key={task.id}
                      className="px-3 py-2.5 border-b border-border/50 last:border-0 flex items-start gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-foreground truncate">{task.title}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {task.company || "—"}
                        </div>
                        <span className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-rose-600 shrink-0"
                        disabled={pool.mutating}
                        onClick={() => void pool.removeTask(task.id)}
                        title="Remove from pool"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
              {(
                [
                  ["all", "All"],
                  ["idle", "Pending"],
                  ["active", "In session"],
                  ["completed", "Done"],
                  ["skipped", "Skipped"],
                ] as const
              ).map(([id, label]) => (
                <Pill key={id} active={monitorFilter === id} onClick={() => setMonitorFilter(id)}>
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
              No tasks in this filter. Switch to Edit pool to assign jobs.
            </div>
          ) : (
            monitored.map((task) => (
              <MonitorRow
                key={task.id}
                task={task}
                busy={pool.mutating}
                onMarkDone={() => void pool.updateStatus(task.id, "done")}
                onSkip={() => void pool.updateStatus(task.id, "skipped")}
                onReopen={() => void pool.updateStatus(task.id, "pending")}
                onRemove={() => void pool.removeTask(task.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
