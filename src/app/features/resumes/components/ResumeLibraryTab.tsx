import React, { useCallback, useEffect, useRef, useState } from "react";
import { Filter, Upload, Eye, Download, MoreHorizontal, Star, Files } from "lucide-react";
import { SearchField } from "../../../components/shared/SearchField";
import { Badge, Score } from "../../../components/ui";
import { resumeCatalog, onCatalogChange, setPrimaryResume } from "../../../services/resumeCatalog";
import type { ResumeSummary } from "../../../types/resume";
import { exportDocumentToDocx } from "../lib/exportDocx";

type ResumeLibraryTabProps = {
  onOpenEditor: (opts?: { resumeId?: string }) => void;
};

export function ResumeLibraryTab({ onOpenEditor }: ResumeLibraryTabProps) {
  const [q, setQ] = useState("");
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setResumes(await resumeCatalog.listResumes());
  }, []);

  useEffect(() => {
    void refresh();
    return onCatalogChange(refresh);
  }, [refresh]);

  const filtered = resumes.filter(
    (r) => !q || [r.name, ...r.skills].some((x) => x.toLowerCase().includes(q.toLowerCase()))
  );

  const handleUpload = async (files: FileList | null, bulk = false) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      if (bulk) {
        await resumeCatalog.bulkUpload(Array.from(files));
      } else {
        await resumeCatalog.uploadResume(files[0]);
      }
      await refresh();
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (id: string, name: string) => {
    const doc = await resumeCatalog.getDocument(id);
    if (doc) await exportDocumentToDocx(doc, `${name.replace(/\s+/g, "-")}.docx`);
  };

  const handleSetPrimary = async (id: string) => {
    await setPrimaryResume(id);
    await refresh();
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <SearchField value={q} onChange={setQ} placeholder="Search resumes or skills..." className="flex-1 max-w-md" />
        <button type="button" className="flex items-center gap-2 bg-secondary border border-border text-muted-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:text-foreground min-h-10">
          <Filter className="w-4 h-4" />Filter
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
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} versions</span>
      </div>

      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => void handleUpload(e.target.files)} />
      <input ref={bulkRef} type="file" accept=".pdf,.doc,.docx,.txt" multiple className="hidden" onChange={(e) => void handleUpload(e.target.files, true)} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((r) => (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenEditor({ resumeId: r.id })}
            onKeyDown={(e) => e.key === "Enter" && onOpenEditor({ resumeId: r.id })}
            className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all group cursor-pointer shadow-sm"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Star className="w-6 h-6 text-primary" />
              </div>
              <div className="flex items-center gap-2">
                {r.isPrimary && <Badge v="violet">Primary</Badge>}
                <Score score={r.matchScore} />
              </div>
            </div>
            <p className="text-base font-bold text-foreground mb-1">{r.name}</p>
            <p className="text-sm text-muted-foreground mb-4">{r.version} · Updated {r.updated}</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {r.skills.map((t) => (
                <Badge key={t} v="subtle">{t}</Badge>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Click to open in editor</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenEditor({ resumeId: r.id }); }}
                  className="icon-btn w-9 h-9 min-w-9 min-h-9 text-muted-foreground hover:text-foreground"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleDownload(r.id, r.name); }}
                  className="icon-btn w-9 h-9 min-w-9 min-h-9 text-muted-foreground hover:text-foreground"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleSetPrimary(r.id); }}
                  className="icon-btn w-9 h-9 min-w-9 min-h-9 text-muted-foreground hover:text-foreground"
                  title="Set as primary"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
