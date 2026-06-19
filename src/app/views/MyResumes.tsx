import React, { useState } from "react";
import { Search, Filter, Upload, X, Eye, Download, MoreHorizontal, Star } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { Badge } from "../components/ui/Badge";
import { Score } from "../components/ui/Score";
import { RESUMES } from "../data/shared";

export function MyResumes() {
  const [q, setQ] = useState("");
  const filtered = RESUMES.filter(
    (r) =>
      !q ||
      [r.name, ...r.skills].some((x) => x.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <PageShell>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-4 py-2.5 flex-1 max-w-md focus-within:border-primary/40 transition-colors min-h-10">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search resumes or skills..."
            className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none flex-1 min-w-0"
          />
          {q && (
            <button onClick={() => setQ("")} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button className="flex items-center gap-2 bg-secondary border border-border text-muted-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:text-foreground min-h-10">
          <Filter className="w-4 h-4" />
          Filter
        </button>
        <button className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10">
          <Upload className="w-4 h-4" />
          Upload Resume
        </button>
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length} versions</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((r) => (
          <div
            key={r.id}
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
            <p className="text-sm text-muted-foreground mb-4">
              {r.version} · Updated {r.updated}
            </p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {r.skills.map((t) => (
                <Badge key={t} v="subtle">{t}</Badge>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">AI-optimized for frontend roles</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="icon-btn w-9 h-9 min-w-9 min-h-9 text-muted-foreground hover:text-foreground">
                  <Eye className="w-4 h-4" />
                </button>
                <button className="icon-btn w-9 h-9 min-w-9 min-h-9 text-muted-foreground hover:text-foreground">
                  <Download className="w-4 h-4" />
                </button>
                <button className="icon-btn w-9 h-9 min-w-9 min-h-9 text-muted-foreground hover:text-foreground">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
