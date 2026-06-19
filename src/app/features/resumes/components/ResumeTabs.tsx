import React, { useState } from "react";
import { Filter, Upload, Eye, Download, MoreHorizontal, Star } from "lucide-react";
import { SearchField } from "../../../components/shared/SearchField";
import { Badge, Score } from "../../../components/ui";
import { RESUMES, RESUME_TEMPLATES } from "../../../data/resumes";

export function ResumeLibraryTab() {
  const [q, setQ] = useState("");
  const filtered = RESUMES.filter(
    (r) => !q || [r.name, ...r.skills].some((x) => x.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <SearchField value={q} onChange={setQ} placeholder="Search resumes or skills..." className="flex-1 max-w-md" />
        <button type="button" className="flex items-center gap-2 bg-secondary border border-border text-muted-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:text-foreground min-h-10">
          <Filter className="w-4 h-4" />
          Filter
        </button>
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} versions</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((r) => (
          <div key={r.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all group cursor-pointer shadow-sm">
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
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" className="icon-btn w-9 h-9 text-muted-foreground hover:text-foreground"><Eye className="w-4 h-4" /></button>
              <button type="button" className="icon-btn w-9 h-9 text-muted-foreground hover:text-foreground"><Download className="w-4 h-4" /></button>
              <button type="button" className="icon-btn w-9 h-9 text-muted-foreground hover:text-foreground"><MoreHorizontal className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResumeUploadTab() {
  const [file, setFile] = useState<string | null>(null);
  return (
    <div className="max-w-2xl">
      <div
        className="border-2 border-dashed border-border rounded-2xl p-12 text-center hover:border-primary/40 transition-colors cursor-pointer bg-secondary/20"
        onClick={() => setFile("Jordan_Doe_Resume.pdf")}
      >
        <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-base font-bold text-foreground">Drop resume here or click to browse</p>
        <p className="text-sm text-muted-foreground mt-1">PDF, DOCX up to 10MB</p>
      </div>
      {file && (
        <div className="mt-5 bg-card border border-border rounded-xl p-5">
          <p className="text-sm font-bold text-foreground mb-3">Parsed preview — {file}</p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {["React", "TypeScript", "Node.js", "AWS", "PostgreSQL"].map((s) => (
              <Badge key={s} v="blue">{s}</Badge>
            ))}
          </div>
          <button type="button" className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10">Save to library</button>
        </div>
      )}
    </div>
  );
}

export function ResumeBulkUploadTab() {
  const [queue] = useState([
    { name: "resume_frontend.pdf", status: "done", skills: 12 },
    { name: "resume_fullstack.pdf", status: "parsing", skills: 0 },
    { name: "resume_ml.pdf", status: "queued", skills: 0 },
  ]);
  return (
    <div className="max-w-2xl space-y-3">
      <div className="border-2 border-dashed border-border rounded-2xl p-8 text-center bg-secondary/20">
        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-bold text-foreground">Upload multiple resumes</p>
      </div>
      {queue.map((f) => (
        <div key={f.name} className="flex items-center gap-4 bg-card border border-border rounded-xl p-4">
          <p className="text-sm font-semibold text-foreground flex-1">{f.name}</p>
          <Badge v={f.status === "done" ? "success" : f.status === "parsing" ? "warn" : "subtle"}>{f.status}</Badge>
          {f.skills > 0 && <span className="text-xs text-muted-foreground">{f.skills} skills extracted</span>}
        </div>
      ))}
    </div>
  );
}

export function ResumeTemplatesTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="border-2 border-dashed border-border rounded-2xl p-8 bg-secondary/20">
        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-bold text-foreground text-center">Upload & save as template</p>
        <input placeholder="Template name" className="mt-4 w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary/40 min-h-10" />
        <button type="button" className="mt-3 w-full bg-primary text-white py-2.5 rounded-xl text-sm font-bold min-h-10">Save template</button>
      </div>
      <div className="space-y-3">
        {RESUME_TEMPLATES.map((t) => (
          <div key={t.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">{t.name}</p>
              <p className="text-xs text-muted-foreground">Updated {t.updated} · {t.uses} uses</p>
            </div>
            <button type="button" className="text-sm text-primary font-bold hover:underline">Use</button>
          </div>
        ))}
      </div>
    </div>
  );
}
