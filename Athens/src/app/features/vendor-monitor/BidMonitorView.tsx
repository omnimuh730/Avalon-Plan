import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronRight,
  Coins,
  ExternalLink,
  FileUp,
  Filter,
  MousePointerClick,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useApi } from "@/api/useApi";
import { Badge } from "@/app/components/ui";
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
import { useApplier } from "@/context/applier-context";
import { detectJobSource } from "@/lib/job-source";
import { API_BASE } from "@/lib/api-base";
import { display } from "@/app/lib/utils";
import { JobSourceChip } from "./components/JobSourceChip";
import {
  RequirementsMetBadge,
  SessionScreeningLights,
} from "./components/SessionScreeningLights";
import { AnalysisPanel, ImageModal, Thumb } from "./components/VendorMonitorPanels";
import { sessionMeetsAllRequirements } from "./lib/sessionQuality";
import type { AnalysisInfo, BidSessionSummary, SessionDetail } from "./types";
import { durationLabel, formatCost, formatTime, matchUploadToRecommended, RECORD_META } from "./utils";
import { formatVendorMonitorError } from "./api-errors";

function sessionJdAnalyzed(session: BidSessionSummary): boolean {
  return Boolean(session.jdAnalyzed) || session.analysisCount > 0;
}

function ResumeMatchBadge({
  originalName,
  recommendedName,
}: {
  originalName: string;
  recommendedName: string | null | undefined;
}) {
  const match = matchUploadToRecommended(originalName, recommendedName);
  if (match === "unknown") {
    return (
      <span className="text-[10px] text-muted-foreground">
        {recommendedName ? `Recommended: ${recommendedName}` : "No recommended resume yet"}
      </span>
    );
  }
  if (match === "match") {
    return (
      <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
        Matches recommended · {recommendedName}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
      Differs from recommended · {recommendedName}
    </span>
  );
}

interface BidMonitorViewProps {
  subtitle?: string;
}

export function BidMonitorView({ subtitle }: BidMonitorViewProps) {
  const { get, del, request } = useApi(API_BASE);
  const { applier } = useApplier();
  const profileName = applier?.name ?? null;

  const [sessions, setSessions] = useState<BidSessionSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalSrc, setModalSrc] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");

  const buildListQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (profileName) params.set("applierName", profileName);
    params.set("limit", "200");
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    return params.toString();
  }, [profileName, dateFrom, dateTo]);

  const loadSessions = useCallback(async () => {
    if (!profileName) {
      setSessions([]);
      return;
    }
    setLoadingList(true);
    setError(null);
    try {
      const data = (await get(`/vendor/bid-sessions?${buildListQuery()}`)) as {
        success: boolean;
        sessions: BidSessionSummary[];
      };
      setSessions(data.sessions ?? []);
    } catch (err) {
      setError(formatVendorMonitorError(err, "Failed to load bid sessions."));
    } finally {
      setLoadingList(false);
    }
  }, [get, profileName, buildListQuery]);

  const loadDetail = useCallback(
    async (sessionId: string) => {
      setSelectedId(sessionId);
      setLoadingDetail(true);
      setDetail(null);
      try {
        const data = (await get(`/vendor/bid-sessions/${sessionId}`)) as {
          success: boolean;
        } & SessionDetail;
        setDetail({ session: data.session, records: data.records });
      } catch (err) {
        setError(formatVendorMonitorError(err, "Failed to load session detail."));
      } finally {
        setLoadingDetail(false);
      }
    },
    [get],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      setError(null);
      try {
        await del(`/vendor/bid-sessions/${sessionId}`);
        if (selectedId === sessionId) {
          setSelectedId(null);
          setDetail(null);
        }
        await loadSessions();
      } catch {
        setError("Failed to delete session.");
      }
    },
    [del, selectedId, loadSessions],
  );

  const deleteFilteredHistory = useCallback(async () => {
    if (!profileName) return;
    setError(null);
    try {
      const params = new URLSearchParams({ applierName: profileName });
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      await request(`/vendor/bid-sessions?${params.toString()}`, { method: "DELETE" });
      setSelectedId(null);
      setDetail(null);
      await loadSessions();
    } catch {
      setError("Failed to delete history.");
    }
  }, [profileName, dateFrom, dateTo, request, loadSessions]);

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    void loadSessions();
  }, [loadSessions]);

  const totalCost = useMemo(() => sessions.reduce((sum, s) => sum + (s.totalCost ?? 0), 0), [sessions]);
  const totalBids = sessions.length;
  const completed = sessions.filter((s) => s.status === "completed").length;
  const liveCount = totalBids - completed;
  const requirementsMetCount = useMemo(
    () => sessions.filter((s) => sessionMeetsAllRequirements(s)).length,
    [sessions],
  );

  const visibleSessions = useMemo(
    () => (statusFilter === "all" ? sessions : sessions.filter((s) => s.status === statusFilter)),
    [sessions, statusFilter],
  );

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      {(subtitle || profileName) && (
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <p className="text-sm text-muted-foreground">
            {subtitle}
            {profileName ? (
              <>
                {" · "}
                <span className="font-medium text-foreground">{profileName}</span>
              </>
            ) : null}
          </p>
          <Button variant="outline" size="sm" onClick={() => void loadSessions()} className="rounded-xl">
            <RefreshCw className={`w-4 h-4 ${loadingList ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 min-w-0">
        {[
          { label: "Sessions", value: String(totalBids), hint: `${liveCount} live` },
          { label: "Completed", value: String(completed), hint: "marked done" },
          {
            label: "Requirements met",
            value: String(requirementsMetCount),
            hint: "screening + resume",
            accent: true,
          },
          { label: "Total cost", value: formatCost(totalCost), hint: "analysis spend" },
        ].map((s) => (
          <div
            key={s.label}
            className={`relative overflow-hidden rounded-2xl border px-3.5 py-3 min-w-0 ${
              s.accent
                ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-card"
                : "border-border bg-card"
            }`}
          >
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{s.label}</div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-xl font-bold tracking-tight" style={display}>
                {s.value}
              </span>
              {s.accent ? <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" /> : null}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">{s.hint}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 rounded-xl border border-border bg-card px-3 py-2.5 flex flex-wrap items-end gap-2 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <Filter className="w-3.5 h-3.5" />
          Filter
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-secondary/50">
          {(
            [
              { key: "all", label: `All (${totalBids})` },
              { key: "active", label: `Live (${liveCount})` },
              { key: "completed", label: `Completed (${completed})` },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setStatusFilter(opt.key)}
              className={`h-7 px-2.5 rounded-md text-xs transition ${
                statusFilter === opt.key
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" /> From
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          />
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" /> To
          </span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          />
        </label>
        <Button size="sm" variant="secondary" onClick={() => void loadSessions()}>
          Apply
        </Button>
        {(dateFrom || dateTo) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
          >
            Clear dates
          </Button>
        )}
        {profileName && sessions.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" className="ml-auto">
                <Trash2 className="w-3.5 h-3.5" />
                Delete filtered
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete filtered sessions?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes all bid records for {profileName}
                  {dateFrom || dateTo ? " in the selected date range" : ""}. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void deleteFilteredHistory()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {!profileName && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 px-4 py-3 text-sm mb-4">
          Select an applier profile in Settings to view bid records.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 px-4 py-2.5 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] gap-4 min-w-0">
        <div className="rounded-2xl bg-card border border-border overflow-hidden min-w-0 shadow-sm">
          <div className="px-3.5 py-2.5 border-b border-border bg-gradient-to-r from-primary/5 via-transparent to-transparent">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Sessions
              {statusFilter !== "all" && (
                <span className="ml-1 normal-case tracking-normal">
                  · {statusFilter === "active" ? "live" : "completed"}
                </span>
              )}
            </div>
          </div>
          <div className="max-h-[calc(100vh-340px)] overflow-y-auto subtle-scroll p-2 space-y-2">
            {!loadingList && visibleSessions.length === 0 && profileName && (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                {sessions.length === 0
                  ? `No bid sessions for ${profileName} in this range.`
                  : `No ${statusFilter === "active" ? "live" : "completed"} bid sessions in this range.`}
              </div>
            )}
            {visibleSessions.map((s) => {
              const active = s.sessionId === selectedId;
              const jobSource = s.jobSource ?? detectJobSource(s.firstUrl);
              const requirementsMet = sessionMeetsAllRequirements(s);
              return (
                <button
                  key={s.sessionId}
                  type="button"
                  onClick={() => void loadDetail(s.sessionId)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition min-w-0 ${
                    active
                      ? "border-primary/40 bg-primary/5 shadow-sm"
                      : "border-border/70 bg-background/60 hover:border-border hover:bg-secondary/40"
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className={`mt-1.5 h-8 w-1 rounded-full shrink-0 ${
                        requirementsMet
                          ? "bg-emerald-500"
                          : s.status === "active"
                            ? "bg-sky-400"
                            : "bg-border"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs font-semibold truncate flex-1 leading-snug">
                          {s.firstTitle || "Untitled bid"}
                        </span>
                        <ChevronRight
                          className={`w-3.5 h-3.5 mt-0.5 shrink-0 transition ${
                            active ? "text-primary rotate-90" : "text-muted-foreground"
                          }`}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <JobSourceChip source={jobSource} />
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                            s.status === "active"
                              ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {durationLabel(s.startedAt, s.completedAt)}
                        </span>
                        {requirementsMet && <RequirementsMetBadge compact />}
                      </div>
                      <SessionScreeningLights
                        jdAnalyzed={sessionJdAnalyzed(s)}
                        flags={s.flags}
                        className="mt-2"
                      />
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <MousePointerClick className="w-2.5 h-2.5" />
                          {s.processCount}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" />
                          {s.analysisCount}
                        </span>
                        {(s.resumeUploadCount ?? 0) > 0 && (
                          <span className="flex items-center gap-0.5">
                            <FileUp className="w-2.5 h-2.5" />
                            {s.resumeUploadCount}
                          </span>
                        )}
                        <span className="flex items-center gap-0.5">
                          <Coins className="w-2.5 h-2.5" />
                          {formatCost(s.totalCost)}
                        </span>
                        <span className="ml-auto shrink-0">{formatTime(s.startedAt)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 overflow-hidden">
          {!detail && !loadingDetail && (
            <div className="rounded-xl bg-card border border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Select a session to inspect screenshots, analysis request/response, and cost.
            </div>
          )}

          {loadingDetail && (
            <div className="rounded-xl bg-card border border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          )}

          {detail && !loadingDetail && (
            <div className="space-y-3 min-w-0">
              <div className="rounded-2xl bg-card border border-border overflow-hidden min-w-0 shadow-sm">
                <div className="bg-gradient-to-r from-primary/8 via-transparent to-emerald-500/5 px-4 py-3.5 border-b border-border/70">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-semibold text-sm truncate max-w-full" style={display}>
                      {detail.session.firstTitle || "Untitled bid"}
                    </span>
                    <JobSourceChip
                      source={detail.session.jobSource ?? detectJobSource(detail.session.firstUrl)}
                    />
                    {sessionMeetsAllRequirements(detail.session) && <RequirementsMetBadge compact />}
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                      {detail.session.firstUrl && (
                        <a
                          href={detail.session.firstUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open job
                        </a>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                            <AlertDialogDescription>
                              All screenshots and analysis records for this bid will be permanently removed.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void deleteSession(detail.session.sessionId)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{detail.session.applierName}</span>
                    <span>{detail.session.processCount} steps</span>
                    <span>{detail.session.analysisCount} analyses</span>
                    {(detail.session.resumeUploadCount ?? 0) > 0 && (
                      <span>{detail.session.resumeUploadCount} resume uploads</span>
                    )}
                    {detail.session.modelVersion && (
                      <span className="text-[10px] font-mono opacity-80">v{detail.session.modelVersion}</span>
                    )}
                    <span>{formatCost(detail.session.totalCost)}</span>
                    <span>{durationLabel(detail.session.startedAt, detail.session.completedAt)}</span>
                  </div>
                </div>
                <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] gap-3 items-start">
                  <SessionScreeningLights
                    jdAnalyzed={sessionJdAnalyzed(detail.session)}
                    flags={detail.session.flags}
                    showReasons
                  />
                  {sessionMeetsAllRequirements(detail.session) ? (
                    <RequirementsMetBadge />
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground leading-snug">
                      Requirements badge appears when the session is completed, JD is analyzed, Remote & No
                      clearance are not red, and the uploaded resume matches the recommendation.
                    </div>
                  )}
                </div>
              </div>

              {((detail.session.resumeUploads?.length ?? 0) > 0 ||
                detail.records.some((r) => r.type === "resume-upload")) && (
                <div className="rounded-xl bg-card border border-border px-3 py-2.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium mb-2">
                    <FileUp className="w-3.5 h-3.5 text-violet-500" />
                    Resume uploads
                    {detail.session.recommendedResumeName && (
                      <span className="text-[10px] font-normal text-muted-foreground">
                        · Recommended: {detail.session.recommendedResumeName}
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {(detail.session.resumeUploads && detail.session.resumeUploads.length > 0
                      ? detail.session.resumeUploads
                      : detail.records
                          .filter((r) => r.type === "resume-upload")
                          .map((r) => ({
                            originalName: r.originalName || "—",
                            cleanedName: r.cleanedName,
                            renamed: Boolean(r.renamed),
                            source: r.uploadSource,
                            pageUrl: r.url,
                            ts: undefined as number | undefined,
                            recommendedResumeName: r.recommendedResumeName,
                          }))
                    ).map((upload, index) => {
                      const recommended =
                        upload.recommendedResumeName || detail.session.recommendedResumeName;
                      return (
                        <li
                          key={`${upload.originalName}-${upload.cleanedName ?? ""}-${upload.ts ?? index}-${index}`}
                          className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 text-[11px] space-y-1"
                        >
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Original
                          </div>
                          <div
                            className="font-medium text-foreground truncate"
                            title={upload.originalName}
                          >
                            {upload.originalName}
                          </div>
                          {upload.renamed && upload.cleanedName ? (
                            <>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
                                Uploaded as
                              </div>
                              <div
                                className="font-medium text-emerald-600 dark:text-emerald-400 truncate"
                                title={upload.cleanedName}
                              >
                                {upload.cleanedName}
                              </div>
                            </>
                          ) : (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                              Not renamed
                            </div>
                          )}
                          <ResumeMatchBadge
                            originalName={upload.originalName}
                            recommendedName={recommended}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {detail.records.some((r) => r.screenshot) && (
                <div className="rounded-xl bg-card border border-border px-3 py-2 min-w-0 overflow-hidden">
                  <div className="flex gap-2 overflow-x-auto max-w-full pb-1 scroll-row">
                    {detail.records
                      .filter((r) => r.screenshot)
                      .map((r) => (
                        <Thumb
                          key={r.id}
                          src={r.screenshot as string}
                          onOpen={setModalSrc}
                          label={r.triggerText || RECORD_META[r.type].label}
                        />
                      ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-card border border-border divide-y divide-border min-w-0 overflow-hidden">
                {(() => {
                  let prevAnalysis: AnalysisInfo | null = null;
                  return detail.records.map((r) => {
                    const meta = RECORD_META[r.type];
                    const Icon = meta.icon;
                    const panel = r.analysis ? (
                      <AnalysisPanel
                        record={r}
                        analysis={r.analysis}
                        usage={r.usage}
                        prevAnalysis={prevAnalysis}
                      />
                    ) : null;
                    if (r.analysis) {
                      prevAnalysis = r.analysis;
                    }
                    return (
                      <div key={r.id} className="px-3 py-2.5 min-w-0">
                        <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs min-w-0">
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
                              <span className="font-medium shrink-0">{meta.label}</span>
                              {r.triggerText && (
                                <Badge v="subtle">
                                  <span className="text-[10px] normal-case max-w-[120px] truncate block">
                                    {r.triggerText}
                                  </span>
                                </Badge>
                              )}
                              <JobSourceChip source={r.jobSource ?? detectJobSource(r.url)} />
                              <span className="text-[10px] text-muted-foreground shrink-0 ml-auto sm:ml-0 sm:order-last">
                                {formatTime(r.createdAt)}
                              </span>
                            </div>
                            {r.url && r.type !== "resume-upload" && (
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 text-[11px] text-primary hover:underline flex items-center gap-1 min-w-0 max-w-full"
                                title={r.url}
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span className="truncate">{r.title || r.url}</span>
                              </a>
                            )}
                            {r.type === "resume-upload" && r.originalName && (
                              <div className="mt-1.5 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5 text-[11px] space-y-0.5">
                                <div>
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    Original{" "}
                                  </span>
                                  <span className="font-medium text-foreground">{r.originalName}</span>
                                </div>
                                {r.renamed && r.cleanedName ? (
                                  <div>
                                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                      Uploaded as{" "}
                                    </span>
                                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                      {r.cleanedName}
                                    </span>
                                  </div>
                                ) : null}
                                <ResumeMatchBadge
                                  originalName={r.originalName}
                                  recommendedName={
                                    r.recommendedResumeName || detail.session.recommendedResumeName
                                  }
                                />
                                {r.uploadSource && (
                                  <div className="text-[10px] text-muted-foreground uppercase">
                                    via {r.uploadSource}
                                  </div>
                                )}
                              </div>
                            )}
                            {panel}
                          </div>
                          {r.screenshot && (
                            <Thumb
                              src={r.screenshot}
                              onOpen={setModalSrc}
                              label={r.triggerText || meta.label}
                            />
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {modalSrc && <ImageModal src={modalSrc} onClose={() => setModalSrc(null)} />}
    </div>
  );
}
