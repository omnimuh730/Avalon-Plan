import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  Hash,
  Loader2,
  MousePointerClick,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  Ban,
} from "lucide-react";
import { AthensSelect } from "../../components/forms";
import { ChartTip, KPI } from "../../components/ui";
import { Button } from "../../components/ui/button";
import { DATE_RANGE_OPTIONS, type DateRange } from "../../hooks/useAnalyticsFilters";
import { mono } from "../../lib/utils";
import { useApplier } from "@/context/applier-context";
import { fetchBidResultStats } from "../../api/bidResults";
import type { BidResultStats } from "../bid-management/types";
import { useVendorMonitorAnalytics } from "./hooks/useVendorMonitorAnalytics";
import { useVendorTaskAnalytics } from "./hooks/useVendorTaskAnalytics";
import {
  defaultAnalyticsPeriod,
  periodFromPreset,
  resolveAnalyticsPeriod,
  type AnalyticsPeriod,
} from "./lib/analyticsPeriod";
import { formatCost } from "./utils";

const CHART_COLORS = ["#6c5ce7", "#2dd4bf", "#f59e0b", "#ec4899", "#3b82f6", "#14b8a6", "#f97316", "#8b5cf6"];

const PRESET_OPTIONS = [
  ...DATE_RANGE_OPTIONS,
  { value: "custom", label: "Custom period" },
];

function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatBucketLabel(bucket: string, granularity: "day" | "hour"): string {
  if (granularity === "hour") {
    // bucket: YYYY-MM-DDTHH:00
    const d = new Date(bucket.includes("T") ? `${bucket}:00` : `${bucket}T12:00:00`);
    if (Number.isNaN(d.getTime())) return bucket;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
    });
  }
  const d = new Date(`${bucket}T12:00:00`);
  if (Number.isNaN(d.getTime())) return bucket;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatAvgDuration(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}m`;
}

function formatPercent(rate: number): string {
  if (!Number.isFinite(rate)) return "0%";
  return `${Math.round(rate * 100)}%`;
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <h3 className="text-sm font-bold text-foreground mb-1">{title}</h3>
      {subtitle ? <p className="text-sm text-muted-foreground mb-5">{subtitle}</p> : <div className="mb-5" />}
      {children}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

const inputClass =
  "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground";

export function BidAnalyticsView() {
  const { applier } = useApplier();
  const [draft, setDraft] = useState<AnalyticsPeriod>(() => defaultAnalyticsPeriod("30d"));
  const [applied, setApplied] = useState<AnalyticsPeriod>(() => defaultAnalyticsPeriod("30d"));
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [bidStats, setBidStats] = useState<BidResultStats | null>(null);

  const resolved = useMemo(() => resolveAnalyticsPeriod(applied), [applied]);
  const { loading, error, ready, timezone, granularity, totals, byBucket, byJobSource, refetch } =
    useVendorMonitorAnalytics(resolved);
  const taskAnalytics = useVendorTaskAnalytics(resolved);

  useEffect(() => {
    const name = applier?.name?.trim();
    if (!name || !resolved) {
      setBidStats(null);
      return;
    }
    let cancelled = false;
    void fetchBidResultStats(name, {
      since: resolved.sinceIso,
      until: resolved.untilIso,
    })
      .then((stats) => {
        if (!cancelled) setBidStats(stats);
      })
      .catch(() => {
        if (!cancelled) setBidStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [applier?.name, resolved]);

  const applyDraft = () => {
    const next = resolveAnalyticsPeriod({ ...draft, mode: "custom" });
    if (!next) {
      setPeriodError("Enter a valid From/To date and time (To must be after From).");
      return;
    }
    setPeriodError(null);
    setApplied({ ...draft, mode: "custom" });
  };

  const selectPreset = (value: string) => {
    if (value === "custom") {
      setDraft((prev) => ({ ...prev, mode: "custom" }));
      setPeriodError(null);
      return;
    }
    const next = periodFromPreset(value as DateRange);
    setDraft(next);
    setApplied(next);
    setPeriodError(null);
  };

  const presetValue = draft.mode === "custom" ? "custom" : draft.range;

  const sessionTrend = byBucket.map((row) => ({
    label: formatBucketLabel(row.bucket, granularity),
    sessions: row.sessions,
    completed: row.completed,
  }));
  const costTrend = byBucket.map((row) => ({
    label: formatBucketLabel(row.bucket, granularity),
    cost: Number(row.totalCost.toFixed(6)),
    tokens: row.totalTokens,
  }));
  const activityTrend = byBucket.map((row) => ({
    label: formatBucketLabel(row.bucket, granularity),
    clicks: row.processCount,
    analyses: row.analysisCount,
    resumes: row.resumeUploadCount,
  }));
  const sourceData = byJobSource.slice(0, 8).map((row, i) => ({
    name: row.label || row.host || "Unknown",
    value: row.sessions,
    cost: row.totalCost,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const taskDayTrend = taskAnalytics.byDay.map((row) => ({
    label: formatBucketLabel(row.day, "day"),
    added: row.added,
    done: row.done,
  }));
  const taskSourceData = taskAnalytics.bySource.slice(0, 8).map((row, i) => ({
    name: row.label || row.host || "Unknown",
    value: row.total,
    done: row.done,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const bucketNoun = granularity === "hour" ? "hour" : "day";
  const periodLabel = resolved?.label ?? "selected period";

  const refreshAll = () => {
    void refetch();
    void taskAnalytics.refetch();
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            Bid session analytics for the selected applier
            {ready ? "" : " — select a profile in Settings"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Showing {periodLabel} · buckets by {bucketNoun} in{" "}
            <span className="font-semibold text-foreground">{timezone}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={loading || taskAnalytics.loading || !resolved}>
            {loading || taskAnalytics.loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </Button>
          <AthensSelect
            value={presetValue}
            onChange={selectPreset}
            options={PRESET_OPTIONS}
            className="w-44"
          />
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-border bg-card px-3 py-2.5 flex flex-wrap items-end gap-2 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 pb-1.5">
          <Calendar className="w-3.5 h-3.5" />
          Period
        </div>

        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">From date</span>
          <input
            type="date"
            value={draft.dateFrom}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, mode: "custom", dateFrom: e.target.value }))
            }
            className={inputClass}
          />
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> From time
          </span>
          <input
            type="time"
            value={draft.timeFrom}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, mode: "custom", timeFrom: e.target.value }))
            }
            className={inputClass}
          />
        </label>

        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">To date</span>
          <input
            type="date"
            value={draft.dateTo}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, mode: "custom", dateTo: e.target.value }))
            }
            className={inputClass}
          />
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> To time
          </span>
          <input
            type="time"
            value={draft.timeTo}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, mode: "custom", timeTo: e.target.value }))
            }
            className={inputClass}
          />
        </label>

        <Button size="sm" variant="secondary" onClick={applyDraft}>
          Apply period
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const next = defaultAnalyticsPeriod("30d");
            setDraft(next);
            setApplied(next);
            setPeriodError(null);
          }}
        >
          Reset
        </Button>
      </div>

      {periodError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-3 text-sm mb-4">
          {periodError}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 p-4 text-sm mb-5">
          {error}
        </div>
      ) : null}

      {!ready ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm">
          Select an applier profile in Settings to view analytics.
        </div>
      ) : loading && totals.sessions === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading analytics…
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPI
              label="Sessions"
              value={String(totals.sessions)}
              sub={`${totals.active} live · ${totals.completed} done`}
              icon={Activity}
              accent="blue"
            />
            <KPI
              label="Completion"
              value={formatPercent(totals.completionRate)}
              sub={`${totals.completed} completed`}
              icon={CheckCircle2}
              accent="emerald"
            />
            <KPI
              label="Total cost"
              value={formatCost(totals.totalCost)}
              sub={`${formatTokens(totals.totalTokens)} tokens`}
              icon={Coins}
              accent="violet"
            />
            <KPI
              label="Analyses"
              value={String(totals.analysisCount)}
              sub={`${totals.processCount} clicks`}
              icon={MousePointerClick}
              accent="amber"
            />
            <KPI
              label="Resume uploads"
              value={String(totals.resumeUploadCount)}
              sub="across sessions"
              icon={Hash}
              accent="teal"
            />
            <KPI
              label="Avg duration"
              value={formatAvgDuration(totals.avgDurationMs)}
              sub="completed sessions"
              icon={Timer}
              accent="sky"
            />
          </div>

          {bidStats ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <KPI
                label="Bid reject rate"
                value={formatPercent(bidStats.rejectionRate)}
                sub={`${bidStats.rejected} currently rejected`}
                icon={Ban}
                accent="rose"
              />
              <KPI
                label="Real rejects"
                value={String(bidStats.realRejects)}
                sub="reject + mark fixed"
                icon={Target}
                accent="amber"
              />
              <KPI
                label="Skip→Reject"
                value={String(bidStats.rejectFromSkipped)}
                sub={`${bidStats.rejectFromSubmitted} from submitted`}
                icon={ClipboardList}
                accent="violet"
              />
              <KPI
                label="Resubmits"
                value={String(bidStats.resubmitCount)}
                sub={`${bidStats.rejectCount} reject events`}
                icon={RefreshCw}
                accent="teal"
              />
              <KPI
                label="Avg bid time"
                value={
                  bidStats.avgBiddingDurationSec != null
                    ? formatAvgDuration(bidStats.avgBiddingDurationSec * 1000)
                    : "—"
                }
                sub={`${bidStats.biddingDurationSamples} samples`}
                icon={Clock}
                accent="sky"
              />
              <KPI
                label="Submitted"
                value={String(bidStats.submitted)}
                sub={`${bidStats.skipped} skipped · ${bidStats.reviewed} reviewed`}
                icon={CheckCircle2}
                accent="emerald"
              />
            </div>
          ) : null}

          <ChartCard
            title="Bidder diligence"
            subtitle="How carefully sessions were screened, analyzed, and matched to the recommended resume"
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <div className="rounded-xl border border-border bg-muted/20 px-3 py-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="w-3.5 h-3.5" />
                  Analyzed
                </div>
                <div className="mt-1 text-xl font-bold" style={mono}>
                  {formatPercent(totals.analyzedRate ?? 0)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {totals.analyzedSessions ?? 0} of {totals.sessions} sessions
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 px-3 py-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Target className="w-3.5 h-3.5" />
                  Screening clear
                </div>
                <div className="mt-1 text-xl font-bold" style={mono}>
                  {formatPercent(totals.screeningClearRate ?? 0)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {totals.screeningClearSessions ?? 0} with no red flags
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 px-3 py-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Resume matched
                </div>
                <div className="mt-1 text-xl font-bold" style={mono}>
                  {formatPercent(totals.resumeMatchRate ?? 0)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {totals.resumeMatchedSessions ?? 0} matched recommended
                </div>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent px-3 py-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Requirements met
                </div>
                <div className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300" style={mono}>
                  {formatPercent(totals.requirementsMetRate ?? 0)}
                </div>
                <div className="text-[11px] text-emerald-800/70 dark:text-emerald-200/70">
                  {totals.requirementsMetSessions ?? 0} of {totals.completed} completed
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Requirements met</span> means the bidder
              completed the session after analyzing the JD, kept Remote / No clearance non-red, and
              uploaded a resume whose original filename matches the recommended stack.
            </p>
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard
              title={`Sessions per ${bucketNoun}`}
              subtitle={`Starts in ${timezone}`}
            >
              {sessionTrend.length === 0 ? (
                <EmptyChart message="No sessions in this period." />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={sessionTrend} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="sessions" name="Sessions" fill="#6c5ce7" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="completed" name="Completed" stroke="#2dd4bf" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Cost & tokens" subtitle={`${bucketNoun === "hour" ? "Hourly" : "Daily"} analysis spend`}>
              {costTrend.length === 0 ? (
                <EmptyChart message="No cost data in this period." />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={costTrend} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="cost" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="tokens" orientation="right" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <Area
                      yAxisId="cost"
                      type="monotone"
                      dataKey="cost"
                      name="Cost (USD)"
                      fill="#6c5ce7"
                      stroke="#6c5ce7"
                      fillOpacity={0.2}
                    />
                    <Line
                      yAxisId="tokens"
                      type="monotone"
                      dataKey="tokens"
                      name="Tokens"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard title={`Activity per ${bucketNoun}`} subtitle="Clicks, analyses, and resume uploads">
              {activityTrend.length === 0 ? (
                <EmptyChart message="No activity in this period." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={activityTrend} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="clicks" name="Clicks" stackId="act" fill="#f59e0b" />
                    <Bar dataKey="analyses" name="Analyses" stackId="act" fill="#6c5ce7" />
                    <Bar dataKey="resumes" name="Resumes" stackId="act" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Sessions by job source" subtitle="Where bid sessions started">
              {sourceData.length === 0 ? (
                <EmptyChart message="No job sources in this period." />
              ) : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="55%" height={240}>
                    <PieChart>
                      <Pie
                        data={sourceData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {sourceData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 min-w-0 flex-1">
                    {sourceData.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="text-muted-foreground truncate" title={d.name}>
                          {d.name}
                        </span>
                        <span className="font-bold text-foreground ml-auto tabular-nums" style={mono}>
                          {d.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="pt-2">
            <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              Task pool
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Jobs assigned to this vendor in the selected period (by added date)
            </p>

            {taskAnalytics.error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 p-3 text-sm mb-4">
                {taskAnalytics.error}
              </div>
            ) : null}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <KPI
                label="In pool"
                value={String(taskAnalytics.totals.total)}
                sub={
                  taskAnalytics.totals.stillPosted != null
                    ? `${taskAnalytics.totals.stillPosted} still New`
                    : "assigned jobs"
                }
                icon={ClipboardList}
                accent="blue"
              />
              <KPI
                label="Pool completion"
                value={formatPercent(taskAnalytics.totals.completionRate)}
                sub={`${taskAnalytics.totals.done} done · ${taskAnalytics.totals.active} in session`}
                icon={CheckCircle2}
                accent="emerald"
              />
              <KPI
                label="Pending"
                value={String(taskAnalytics.totals.pending)}
                sub={`${taskAnalytics.totals.skipped} skipped`}
                icon={Timer}
                accent="amber"
              />
              <KPI
                label="Sources"
                value={String(taskAnalytics.bySource.length)}
                sub="job boards in pool"
                icon={Hash}
                accent="violet"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard title="Pool adds per day" subtitle="Tasks added vs completed">
                {taskDayTrend.length === 0 ? (
                  <EmptyChart message="No tasks added in this period." />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={taskDayTrend} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="added" name="Added" fill="#6c5ce7" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="done" name="Done" stroke="#2dd4bf" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Pool by job source" subtitle="Assigned tasks by board">
                {taskSourceData.length === 0 ? (
                  <EmptyChart message="No task sources in this period." />
                ) : (
                  <div className="flex gap-4 items-center">
                    <ResponsiveContainer width="45%" height={220}>
                      <PieChart>
                        <Pie
                          data={taskSourceData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {taskSourceData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 min-w-0 flex-1">
                      {taskSourceData.map((d) => (
                        <div key={d.name} className="flex items-center gap-2 text-xs">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                          <span className="text-muted-foreground truncate" title={d.name}>
                            {d.name}
                          </span>
                          <span className="font-bold text-foreground ml-auto tabular-nums" style={mono}>
                            {d.value}
                            <span className="text-muted-foreground font-medium"> · {d.done} done</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ChartCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
