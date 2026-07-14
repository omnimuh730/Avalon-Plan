import { useCallback, useEffect, useRef, useState } from "react";
import { Briefcase, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/app/components/ui";
import { Button } from "@/app/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { detectJobSource } from "@/lib/job-source";
import type { AnalysisInfo, AnalysisTrace, BidRecord, UsageInfo } from "../types";
import { formatCost } from "../utils";
import { JobSourceChip } from "./JobSourceChip";

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_STEP = 0.25;

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function ImageModal({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => {
      const next = clampZoom(s + delta);
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
      else if (e.key === "-" || e.key === "_") zoomBy(-ZOOM_STEP);
      else if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, zoomBy, reset]);

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const zoomed = scale > 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/90" onClick={onClose} onWheel={onWheel}>
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-1.5 py-1 text-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => zoomBy(-ZOOM_STEP)}
          disabled={scale <= ZOOM_MIN}
          className="text-white hover:bg-white/20 disabled:opacity-40 rounded-full"
          title="Zoom out (-)"
        >
          <ZoomOut className="w-5 h-5" />
        </Button>
        <span className="text-xs tabular-nums w-12 text-center select-none">{Math.round(scale * 100)}%</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => zoomBy(ZOOM_STEP)}
          disabled={scale >= ZOOM_MAX}
          className="text-white hover:bg-white/20 disabled:opacity-40 rounded-full"
          title="Zoom in (+)"
        >
          <ZoomIn className="w-5 h-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={reset}
          disabled={!zoomed}
          className="text-white hover:bg-white/20 disabled:opacity-40 rounded-full"
          title="Reset (0)"
        >
          <RotateCcw className="w-5 h-5" />
        </Button>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white bg-black/60 hover:bg-white/20 rounded-full"
        title="Close (Esc)"
      >
        <X className="w-5 h-5" />
      </Button>
      <div className="absolute inset-0 overflow-auto overscroll-contain" onClick={onClose}>
        <div className="flex min-h-full min-w-full items-start justify-center p-4 pt-16 pb-8">
          <img
            src={src}
            alt="Bid screenshot"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={() => (zoomed ? reset() : zoomBy(ZOOM_STEP * 4))}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "top center",
              cursor: zoomed ? (dragRef.current ? "grabbing" : "grab") : "zoom-in",
              touchAction: zoomed ? "none" : "pan-y",
              width: "min(100vw - 2rem, 100%)",
              maxWidth: "100%",
              height: "auto",
            }}
            className="rounded-lg shadow-2xl transition-transform duration-75 select-none"
          />
        </div>
      </div>
    </div>
  );
}

export function Thumb({
  src,
  onOpen,
  label,
}: {
  src: string;
  onOpen: (src: string) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(src)}
      className="relative shrink-0 rounded-md overflow-hidden border border-border hover:ring-2 hover:ring-primary/40 transition"
      title={label || "Open screenshot"}
    >
      <img src={src} alt={label || "screenshot"} loading="lazy" className="h-14 w-24 object-cover object-top" />
    </button>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words rounded-lg bg-neutral-950 text-neutral-200 p-3 max-h-72 overflow-auto border border-neutral-800">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function FormAnswersList({
  answers,
}: {
  answers: { question: string; suggestedAnswer: string; confidence: string }[];
}) {
  if (answers.length === 0) {
    return <p className="text-xs text-muted-foreground">No form answers in this analysis.</p>;
  }
  return (
    <ul className="space-y-2">
      {answers.map((a, i) => (
        <li key={`${a.question}-${i}`} className="rounded-md border border-border p-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium">{a.question}</span>
            <Badge v="subtle">
              <span className="text-[10px] normal-case">{a.confidence}</span>
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{a.suggestedAnswer}</p>
        </li>
      ))}
    </ul>
  );
}

function diffAnalysisSections(prev: AnalysisInfo | null, curr: AnalysisInfo) {
  const newForms = curr.formAnswers.filter(
    (f) => !prev?.formAnswers.some((p) => p.question === f.question),
  );
  return {
    summary: Boolean(curr.summary && curr.summary !== prev?.summary),
    skills: Boolean(curr.skillProfile && curr.skillProfile !== prev?.skillProfile),
    resume: Boolean(curr.bestResume?.name && curr.bestResume.name !== prev?.bestResume?.name),
    forms: newForms.length > 0,
    newFormCount: newForms.length,
  };
}

export function AnalysisPanel({
  record,
  analysis,
  usage,
  prevAnalysis,
}: {
  record: BidRecord;
  analysis: AnalysisInfo;
  usage: UsageInfo | null;
  prevAnalysis: AnalysisInfo | null;
}) {
  const diff = diffAnalysisSections(prevAnalysis, analysis);
  const defaultTab =
    diff.forms && analysis.formAnswers.length > 0
      ? "forms"
      : diff.summary
        ? "summary"
        : "response";

  const requestPayload =
    record.trace?.request ??
    ({
      url: record.url,
      title: record.title,
    } as AnalysisTrace["request"]);

  const responsePayload =
    record.trace?.response ??
    ({
      analysis,
      usage,
    } as Record<string, unknown>);

  const unchangedNote =
    prevAnalysis && !diff.summary && !diff.skills && !diff.resume && !diff.forms;

  return (
    <div className="mt-2 rounded-lg border border-border bg-secondary/30 overflow-hidden min-w-0">
      {unchangedNote && (
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border bg-muted/30">
          Cached context — only token usage differs from previous analysis
        </div>
      )}
      <Tabs defaultValue={defaultTab}>
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-8 px-1 flex-wrap">
          {diff.summary && (
            <TabsTrigger value="summary" className="text-xs h-7 px-2">
              Summary
            </TabsTrigger>
          )}
          {analysis.formAnswers.length > 0 && (
            <TabsTrigger value="forms" className="text-xs h-7 px-2">
              Forms{diff.newFormCount > 0 ? ` (+${diff.newFormCount})` : ""}
            </TabsTrigger>
          )}
          {diff.skills && (
            <TabsTrigger value="skills" className="text-xs h-7 px-2">
              Skills
            </TabsTrigger>
          )}
          <TabsTrigger value="request" className="text-xs h-7 px-2">
            Request
          </TabsTrigger>
          <TabsTrigger value="response" className="text-xs h-7 px-2">
            Response
          </TabsTrigger>
        </TabsList>

        {diff.summary && (
          <TabsContent value="summary" className="p-3 space-y-2 m-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge v={analysis.isJobPage ? "success" : "warn"}>
                <span className="text-[10px] normal-case">
                  {analysis.isJobPage ? "Job page" : "Not a job page"}
                </span>
              </Badge>
              <JobSourceChip source={record.jobSource ?? detectJobSource(record.url)} />
              {usage && <span className="text-xs text-muted-foreground">{formatCost(usage.cost)}</span>}
            </div>
            {analysis.summary && (
              <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">{analysis.summary}</p>
            )}
            {diff.resume && analysis.bestResume && (
              <div className="text-xs flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="font-medium">{analysis.bestResume.name}</span>
                {analysis.bestResume.scorePercent != null && (
                  <span className="text-primary">{analysis.bestResume.scorePercent}%</span>
                )}
              </div>
            )}
            {usage && (
              <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                <span>{usage.model ?? "model n/a"}</span>
                <span>in {usage.inputTokens.toLocaleString()}</span>
                {usage.cachedTokens > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    cached {usage.cachedTokens.toLocaleString()}
                  </span>
                )}
                <span>out {usage.outputTokens.toLocaleString()}</span>
              </div>
            )}
          </TabsContent>
        )}

        <TabsContent value="forms" className="p-3 m-0">
          <FormAnswersList answers={analysis.formAnswers} />
        </TabsContent>

        <TabsContent value="request" className="p-3 m-0">
          <JsonBlock value={requestPayload} />
          {requestPayload?.visibleTextExcerpt && (
            <details className="mt-2">
              <summary className="text-xs cursor-pointer text-muted-foreground">Page text excerpt</summary>
              <pre className="mt-1 text-[10px] leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground max-h-40 overflow-auto">
                {requestPayload.visibleTextExcerpt}
              </pre>
            </details>
          )}
        </TabsContent>

        <TabsContent value="response" className="p-3 m-0">
          <JsonBlock value={responsePayload} />
        </TabsContent>

        {diff.skills && (
          <TabsContent value="skills" className="p-3 space-y-2 m-0">
            {analysis.skillProfile ? (
              <pre className="text-[10px] leading-snug whitespace-pre-wrap font-mono text-muted-foreground bg-card rounded p-2 max-h-48 overflow-auto">
                {analysis.skillProfile}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">No skill profile recorded.</p>
            )}
            {analysis.topResumes.length > 0 && (
              <ul className="text-xs space-y-1">
                {analysis.topResumes.map((r) => (
                  <li key={r.name} className="flex justify-between gap-2">
                    <span>{r.name}</span>
                    <span className="text-muted-foreground">{r.scorePercent ?? "—"}%</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
