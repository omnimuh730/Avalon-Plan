import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Filter, Upload, Download, Star, Files, BarChart3, Trash2, Loader2, Sparkles, Eye } from "lucide-react";
import { useApplier } from "@/context/applier-context";
import { SearchField } from "../../../components/shared/SearchField";
import { Badge } from "../../../components/ui";
import {
  bulkUploadUserResumes,
  deleteUserResume,
  fetchUserResume,
  fetchUserResumes,
  fileToBase64,
  setPrimaryUserResume,
  uploadUserResume,
  analyzeUserResume,
} from "../../../services/resumeApi";
import type { UserResumeSummary } from "../../../types/resume";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { AthensInput, FormField } from "../../../components/forms";
import { downloadBlob } from "../lib/buildResumeModel";
import { ResumePreviewDialog } from "./ResumePreviewDialog";

type ResumeLibraryTabProps = {
  onOpenAnalysis?: () => void;
};

type PendingFile = { file: File; techStack?: string; relativePath?: string };

export function ResumeLibraryTab({ onOpenAnalysis }: ResumeLibraryTabProps) {
  const { applier, applierReady } = useApplier();
  const [q, setQ] = useState("");
  const [stackFilter, setStackFilter] = useState<string>("all");
  const [resumes, setResumes] = useState<UserResumeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [techStackInput, setTechStackInput] = useState("");
  const [bulkPending, setBulkPending] = useState<PendingFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [previewResume, setPreviewResume] = useState<UserResumeSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkRef = useRef<HTMLInputElement>(null);

  const ownerId = applier?._id != null ? String(applier._id) : "";
  const ownerName = applier?.name ?? "";

  const refresh = useCallback(async () => {
    if (!ownerName) {
      setResumes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setResumes(await fetchUserResumes(ownerName));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load resumes");
    } finally {
      setLoading(false);
    }
  }, [ownerName]);

  useEffect(() => {
    if (!applierReady) return;
    void refresh();
  }, [applierReady, refresh]);

  const stacks = [...new Set(resumes.map((r) => r.techStack))].sort();

  const filtered = resumes.filter((r) => {
    const matchQ =
      !q ||
      [r.fileName, r.techStack, r.extractedText ?? ""].some((x) => x.toLowerCase().includes(q.toLowerCase()));
    const matchStack = stackFilter === "all" || r.techStack === stackFilter;
    return matchQ && matchStack;
  });

  const handleSingleFilePick = (files: FileList | null) => {
    if (!files?.[0]) return;
    setPendingFile({ file: files[0] });
    setTechStackInput("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const confirmSingleUpload = async () => {
    if (!pendingFile || !ownerName || !ownerId || !techStackInput.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const contentBase64 = await fileToBase64(pendingFile.file);
      await uploadUserResume({
        ownerName,
        ownerId,
        techStack: techStackInput.trim(),
        fileName: pendingFile.file.name,
        mimeType: pendingFile.file.type || "application/octet-stream",
        contentBase64,
      });
      setPendingFile(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleBulkPick = (files: FileList | null) => {
    if (!files?.length) return;
    const items: PendingFile[] = [];
    for (const file of Array.from(files)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = rel.split("/").filter(Boolean);
      if (parts.length < 2) continue;
      const techStack = parts[parts.length - 2];
      items.push({ file, techStack, relativePath: rel });
    }
    if (!items.length) {
      setError("Bulk upload requires a folder with subfolders (tech stack) containing resume files.");
      return;
    }
    setBulkPending(items);
    if (bulkRef.current) bulkRef.current.value = "";
  };

  const confirmBulkUpload = async () => {
    if (!bulkPending?.length || !ownerName || !ownerId) return;
    setUploading(true);
    setError(null);
    try {
      const items = await Promise.all(
        bulkPending.map(async (p) => ({
          techStack: p.techStack!,
          fileName: p.file.name,
          mimeType: p.file.type || "application/octet-stream",
          contentBase64: await fileToBase64(p.file),
        })),
      );
      const result = await bulkUploadUserResumes({ ownerName, ownerId, items });
      if (result.failed.length) {
        setError(`${result.failed.length} file(s) failed to upload.`);
      }
      setBulkPending(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (id: string, fileName: string) => {
    if (!ownerName) return;
    const detail = await fetchUserResume(id, ownerName);
    if (!detail.contentBase64) return;
    const bytes = Uint8Array.from(atob(detail.contentBase64), (c) => c.charCodeAt(0));
    await downloadBlob(new Blob([bytes], { type: detail.mimeType }), fileName);
  };

  const handleSetPrimary = async (id: string) => {
    if (!ownerName) return;
    await setPrimaryUserResume(id, ownerName);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!ownerName || !confirm("Delete this resume?")) return;
    await deleteUserResume(id, ownerName);
    await refresh();
  };

  const handleAnalyze = async (resume: UserResumeSummary) => {
    if (!ownerName) return;
    if (resume.analyzed) {
      const reanalyze = confirm(
        `"${resume.fileName}" is already analyzed. Re-analyze with AI? This will replace skill scores.`,
      );
      if (!reanalyze) return;
    }
    setAnalyzingId(resume.id);
    setError(null);
    try {
      await analyzeUserResume(ownerName, resume.id, { force: resume.analyzed });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzingId(null);
    }
  };

  if (!applierReady || loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading resumes…
      </div>
    );
  }

  if (!ownerName) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Select an applier to manage resumes.
      </div>
    );
  }

  const bulkSummary = bulkPending
    ? Object.entries(
        bulkPending.reduce<Record<string, number>>((acc, p) => {
          acc[p.techStack!] = (acc[p.techStack!] ?? 0) + 1;
          return acc;
        }, {}),
      )
    : [];

  return (
    <>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <SearchField value={q} onChange={setQ} placeholder="Search resumes or tech stacks..." className="flex-1 max-w-md" />
        <select
          value={stackFilter}
          onChange={(e) => setStackFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-border bg-card text-sm"
        >
          <option value="all">All stacks</option>
          {stacks.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="button" className="flex items-center gap-2 bg-secondary border border-border text-muted-foreground px-4 py-2.5 rounded-xl text-sm font-semibold min-h-10">
          <Filter className="w-4 h-4" />{stacks.length} stacks
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={() => bulkRef.current?.click()}
          className="flex items-center gap-2 bg-secondary border border-border text-muted-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:text-foreground min-h-10"
        >
          <Files className="w-4 h-4" />Bulk upload
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10"
        >
          <Upload className="w-4 h-4" />Upload Resume
        </button>
        {onOpenAnalysis && (
          <button type="button" onClick={onOpenAnalysis} className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">
            <BarChart3 className="w-4 h-4" />Analysis
          </button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} files</span>
      </div>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => handleSingleFilePick(e.target.files)} />
      <input ref={bulkRef} type="file" /* @ts-expect-error webkitdirectory */ webkitdirectory="" multiple className="hidden" onChange={(e) => handleBulkPick(e.target.files)} />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center px-4 border border-dashed border-border rounded-xl">
          <Upload className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="font-bold text-foreground">No resumes uploaded yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">Upload a PDF or DOCX, name its tech stack, or bulk-upload a folder of stack subfolders.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all group shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Star className="w-6 h-6 text-primary" />
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {r.isPrimary && <Badge v="violet">Primary</Badge>}
                  {r.analyzed ? (
                    <Badge v="success">Analyzed</Badge>
                  ) : (
                    <Badge v="subtle">Not analyzed</Badge>
                  )}
                  <Badge v="blue">{r.techStack}</Badge>
                </div>
              </div>
              <p className="text-base font-bold text-foreground mb-1 truncate" title={r.fileName}>{r.fileName}</p>
              <p className="text-sm text-muted-foreground mb-4">
                {(r.sizeBytes / 1024).toFixed(0)} KB · {formatDistanceToNow(new Date(r.uploadedAt), { addSuffix: true })}
                {r.analyzed && r.skillCount != null ? ` · ${r.skillCount} skills` : ""}
              </p>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={analyzingId === r.id}
                  onClick={() => void handleAnalyze(r)}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline disabled:opacity-50"
                >
                  {analyzingId === r.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {r.analyzed ? "Re-analyze" : "Analyze"}
                </button>
                <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPreviewResume(r)} className="icon-btn w-9 h-9 text-muted-foreground hover:text-primary" title="Preview">
                  <Eye className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => void handleDownload(r.id, r.fileName)} className="icon-btn w-9 h-9 text-muted-foreground hover:text-foreground" title="Download">
                  <Download className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => void handleSetPrimary(r.id)} className="icon-btn w-9 h-9 text-muted-foreground hover:text-amber-500" title="Set primary">
                  <Star className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => void handleDelete(r.id)} className="icon-btn w-9 h-9 text-muted-foreground hover:text-destructive" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(pendingFile)} onOpenChange={(open) => !open && setPendingFile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name this resume&apos;s tech stack</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            File: <strong>{pendingFile?.file.name}</strong>
          </p>
          <FormField label="Tech stack name">
            <AthensInput
              value={techStackInput}
              onChange={(e) => setTechStackInput(e.target.value)}
              placeholder="e.g. React + TypeScript"
              autoFocus
            />
          </FormField>
          <DialogFooter>
            <button type="button" onClick={() => setPendingFile(null)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold">Cancel</button>
            <button
              type="button"
              disabled={!techStackInput.trim() || uploading}
              onClick={() => void confirmSingleUpload()}
              className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(bulkPending)} onOpenChange={(open) => !open && setBulkPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm bulk upload</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            {bulkPending?.length} files across {bulkSummary.length} tech stack(s):
          </p>
          <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
            {bulkSummary.map(([stack, count]) => (
              <li key={stack}><strong>{stack}</strong> — {count} file(s)</li>
            ))}
          </ul>
          <DialogFooter>
            <button type="button" onClick={() => setBulkPending(null)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold">Cancel</button>
            <button type="button" disabled={uploading} onClick={() => void confirmBulkUpload()} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50">
              {uploading ? "Uploading…" : "Upload all"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResumePreviewDialog
        resumeId={previewResume?.id ?? null}
        ownerName={ownerName}
        fileName={previewResume?.fileName}
        open={Boolean(previewResume)}
        onOpenChange={(open) => !open && setPreviewResume(null)}
      />
    </>
  );
}
