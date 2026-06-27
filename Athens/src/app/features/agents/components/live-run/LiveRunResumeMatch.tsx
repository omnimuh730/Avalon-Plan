import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Loader2 } from "lucide-react";
import { mono } from "../../lib/constants";
import { API_BASE } from "@/lib/api-base";
import { agentRunResumeUrl } from "../../../../services/agentApi";
import { fetchUserResume } from "../../../../services/resumeApi";
import type { ResumeMatch } from "./types";

function formatBytes(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

function resolveDirectUrl(
  runId: string,
  resumeMatch: ResumeMatch,
): { url: string; label: string } | null {
  const displayName =
    resumeMatch.submittedFileName
    || resumeMatch.resumeFileName
    || resumeMatch.bestResume?.name
    || "résumé";

  if (resumeMatch.hasRunResume && resumeMatch.resumeFileName && runId) {
    return {
      url: agentRunResumeUrl(runId, resumeMatch.resumeFileName),
      label: displayName,
    };
  }

  if (resumeMatch.generationId) {
    return {
      url: `${API_BASE.replace(/\/$/, "")}/personal/resume-generations/${resumeMatch.generationId}/pdf`,
      label: displayName,
    };
  }

  return null;
}

function isPdfMime(mime?: string | null, name?: string | null) {
  const lower = String(name || "").toLowerCase();
  return mime === "application/pdf" || lower.endsWith(".pdf");
}

export function LiveRunResumeMatch({
  runId,
  profileName,
  resumeMatch,
}: {
  runId: string;
  profileName?: string;
  resumeMatch: ResumeMatch;
}) {
  const direct = useMemo(() => resolveDirectUrl(runId, resumeMatch), [runId, resumeMatch]);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const ownerName = profileName || resumeMatch.profileName || "";
  const displayName =
    resumeMatch.submittedFileName
    || resumeMatch.resumeFileName
    || resumeMatch.bestResume?.name
    || resumeMatch.resumeStack
    || "Résumé";

  const previewMime = resumeMatch.resumeMimeType || (isPdfMime(null, displayName) ? "application/pdf" : null);
  const showPdfPreview = isPdfMime(previewMime, displayName);

  // Fallback: load library résumé by id when no run copy / generation link yet.
  useEffect(() => {
    if (direct?.url || !resumeMatch.resumeId || !ownerName) {
      setBlobUrl(null);
      setFetchError(null);
      setLoading(false);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    setBlobUrl(null);

    void fetchUserResume(resumeMatch.resumeId, ownerName)
      .then((detail) => {
        if (cancelled) return;
        if (!detail.contentBase64) {
          setFetchError("File content is not available for preview.");
          return;
        }
        const mime = detail.mimeType || previewMime || "application/octet-stream";
        const blob = base64ToBlob(detail.contentBase64, mime);
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load résumé file");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [direct?.url, resumeMatch.resumeId, ownerName, previewMime]);

  const previewUrl = direct?.url || blobUrl;
  const openUrl = previewUrl;
  const sizeLabel = formatBytes(resumeMatch.resumeSizeBytes);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <FileText size={12} className="text-violet-500" />
        Submitted résumé
      </p>
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-border bg-secondary/30 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate" title={displayName}>
                {displayName}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {resumeMatch.aiGenerated ? "AI generated for this job" : resumeMatch.resumeStack || "Uploaded résumé"}
                {resumeMatch.bestResume?.scorePercent != null && !resumeMatch.aiGenerated
                  ? ` · ${resumeMatch.bestResume.scorePercent}% stack match`
                  : ""}
                {sizeLabel ? ` · ${sizeLabel}` : ""}
              </p>
            </div>
            {openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:text-violet-900 hover:underline shrink-0"
              >
                Open file
                <ExternalLink size={11} />
              </a>
            )}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
              <Loader2 size={14} className="animate-spin" />
              Loading file preview…
            </div>
          )}

          {!loading && fetchError && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">{fetchError}</p>
          )}

          {!loading && previewUrl && showPdfPreview && (
            <div className="rounded-lg border border-border bg-white overflow-hidden min-h-[220px] max-h-[360px]">
              <iframe
                title={`Résumé preview — ${displayName}`}
                src={previewUrl}
                className="w-full h-[min(360px,50vh)] min-h-[220px]"
              />
            </div>
          )}

          {!loading && previewUrl && !showPdfPreview && (
            <a
              href={openUrl || previewUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/20 px-3 py-8 text-sm text-violet-700 hover:bg-secondary/40 hover:underline"
            >
              <FileText size={16} />
              Preview not supported in-panel — open file
            </a>
          )}

          {!loading && !previewUrl && !fetchError && (
            <p className="text-xs text-muted-foreground py-2">
              File will appear here once the agent materializes the upload.
            </p>
          )}
        </div>

        {(resumeMatch.skillProfile || resumeMatch.jobSkills?.length || resumeMatch.jobDescription) && (
          <details className="group border-t border-border">
            <summary className="flex items-center justify-between gap-2 px-3.5 py-2 cursor-pointer select-none bg-secondary/20 hover:bg-secondary/30 list-none">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                JD skill match
              </span>
              <ChevronDown size={14} className="text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-3.5 py-2.5 space-y-2 border-t border-border/60">
              {resumeMatch.jobSkills && resumeMatch.jobSkills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {resumeMatch.jobSkills.map((s) => (
                    <span key={s} className="text-[11px] text-foreground/80 bg-secondary border border-border rounded-md px-1.5 py-0.5">{s}</span>
                  ))}
                </div>
              )}
              {resumeMatch.skillProfile ? (
                <pre className={`${mono} text-[11px] leading-relaxed text-foreground/75 max-h-36 overflow-auto whitespace-pre`}>
                  {resumeMatch.skillProfile}
                </pre>
              ) : resumeMatch.analysisError ? (
                <p className="text-xs text-amber-700">{resumeMatch.analysisError}</p>
              ) : null}
              {resumeMatch.topResumes && resumeMatch.topResumes.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">Alternatives:</span>
                  {resumeMatch.topResumes.slice(1).map((r) => (
                    <span key={r.name} className="text-xs text-muted-foreground bg-secondary rounded-md px-1.5 py-0.5">
                      {r.name} · {r.scorePercent}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
