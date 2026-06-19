import React, { useState } from "react";
import {
  Search,
  Filter,
  SlidersHorizontal,
  Plus,
  X,
  Building,
  Eye,
  MoreHorizontal,
} from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import { PageShell } from "../components/layout/PageShell";
import { Av } from "../components/ui/Av";
import { Badge } from "../components/ui/Badge";
import { Score } from "../components/ui/Score";
import { cn, mono } from "../lib/utils";
import {
  APPLICATIONS,
  STAGES,
  STAGE_META,
  RADAR_DATA,
} from "../data/applications";
import type { Application } from "../types";

export function ApplicationsPipeline() {
  const [apps, setApps] = useState<Application[]>(APPLICATIONS);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [sel, setSel] = useState<Application | null>(null);
  const [search, setSearch] = useState("");

  const visible = search
    ? apps.filter(
        (c) =>
          c.company.toLowerCase().includes(search.toLowerCase()) ||
          c.role.toLowerCase().includes(search.toLowerCase()) ||
          c.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : apps;

  const stageApps = (s: string) => visible.filter((c) => c.stage === s);

  return (
    <div className="h-full flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border flex-shrink-0 bg-card/50">
          <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-4 py-2.5 w-64 focus-within:border-primary/40 transition-colors min-h-10">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search applications..."
              className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none flex-1 min-w-0"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button className="flex items-center gap-2 bg-secondary border border-border text-muted-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:text-foreground min-h-10">
            <Filter className="w-4 h-4" />
            Filter
          </button>
          <button className="flex items-center gap-2 bg-secondary border border-border text-muted-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:text-foreground min-h-10">
            <SlidersHorizontal className="w-4 h-4" />
            Sort
          </button>
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {apps.length} applications across {STAGES.length} stages
            </span>
            <button className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm min-h-10">
              <Plus className="w-4 h-4" />
              New Application
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden subtle-scroll">
          <div className="flex gap-4 p-6 h-full" style={{ minWidth: "max-content" }}>
            {STAGES.map((stage) => {
              const meta = STAGE_META[stage];
              const sc = stageApps(stage);
              const isOver = overStage === stage;
              return (
                <div
                  key={stage}
                  className={cn("w-[260px] flex flex-col h-full transition-transform duration-100", isOver && "scale-[1.01]")}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverStage(stage);
                  }}
                  onDragLeave={() => setOverStage(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId) setApps((p) => p.map((c) => (c.id === dragId ? { ...c, stage } : c)));
                    setDragId(null);
                    setOverStage(null);
                  }}
                >
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full flex-shrink-0", meta.dot)} />
                      <span className={cn("text-sm font-bold", meta.text)}>{stage}</span>
                      <span className="text-xs px-2 py-0.5 bg-secondary rounded-md font-bold text-muted-foreground" style={mono}>
                        {sc.length}
                      </span>
                    </div>
                    <button className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary w-8 h-8 min-w-8 min-h-8">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {isOver && <div className="h-0.5 bg-primary/60 rounded-full mb-2" />}

                  <div className="flex-1 overflow-y-auto space-y-3 pb-2 subtle-scroll">
                    {sc.map((c) => (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={(e) => {
                          setDragId(c.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverStage(null);
                        }}
                        onClick={() => setSel(sel?.id === c.id ? null : c)}
                        className={cn(
                          "bg-card border rounded-xl p-4 cursor-grab active:cursor-grabbing transition-all group select-none shadow-sm",
                          dragId === c.id ? "opacity-25 scale-95" : "hover:shadow-md",
                          sel?.id === c.id ? "border-primary/50 shadow-md bg-primary/5" : "border-border"
                        )}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <Av name={c.company} size="sm" />
                          <Score score={c.score} />
                        </div>
                        <p className="text-sm font-bold text-foreground leading-tight">{c.role}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                          <Building className="w-3.5 h-3.5" />
                          {c.company}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-3 mb-3">
                          {c.tags.slice(0, 2).map((t) => (
                            <span key={t} className="text-xs px-2 py-0.5 bg-secondary rounded-md text-muted-foreground font-medium">
                              {t}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{c.time}</span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="icon-btn w-8 h-8 min-w-8 min-h-8 text-muted-foreground hover:text-foreground">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button className="icon-btn w-8 h-8 min-w-8 min-h-8 text-muted-foreground hover:text-foreground">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {sel && (
        <div className="w-72 border-l border-border bg-card flex flex-col overflow-hidden flex-shrink-0 shadow-lg">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <span className="text-sm font-bold text-foreground">Application Details</span>
            <button onClick={() => setSel(null)} className="icon-btn text-muted-foreground hover:text-foreground w-9 h-9 min-w-9 min-h-9">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5 subtle-scroll">
            <div className="flex flex-col items-center text-center pb-5 border-b border-border">
              <Av name={sel.company} size="lg" />
              <h3 className="text-base font-bold text-foreground mt-3">{sel.role}</h3>
              <p className="text-sm text-muted-foreground">{sel.company}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Building className="w-3.5 h-3.5" />
                {sel.location}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Score score={sel.score} />
                <Badge v={sel.stage === "Hired" ? "success" : sel.stage === "Offer" ? "violet" : sel.stage === "Interview" ? "blue" : "default"}>
                  {sel.stage}
                </Badge>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Fit Profile</p>
              <ResponsiveContainer width="100%" height={160}>
                <RadarChart data={RADAR_DATA} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
                  <PolarGrid stroke="rgba(0,0,0,0.08)" radialLines={false} />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: "#6b6b84", fontSize: 10 }} tickLine={false} />
                  <Radar name="You" dataKey="you" stroke="#6c5ce7" strokeWidth={1.5} fill="#6c5ce7" fillOpacity={0.2} />
                  <Radar name="Target" dataKey="target" stroke="#2dd4bf" strokeWidth={1} strokeDasharray="3 2" fill="transparent" />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-bold mb-1">Contact</p>
                <p className="text-foreground" style={mono}>{sel.email}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-bold mb-1">Source</p>
                <p className="text-foreground">{sel.source}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-bold mb-2">Skills Match</p>
                <div className="flex flex-wrap gap-1.5">{sel.tags.map((t) => <Badge key={t} v="subtle">{t}</Badge>)}</div>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-bold mb-2">AI Analysis</p>
                <div className="bg-secondary/50 border border-border rounded-xl p-3 text-sm text-foreground/75 leading-relaxed">
                  Strong fit for this role. Your {sel.tags[0]} experience aligns well. Recommend following up if no response in 7 days.
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-border space-y-2 flex-shrink-0">
            <button className="w-full bg-primary text-white rounded-xl py-3 text-sm font-bold hover:bg-primary/90 transition-colors min-h-10">
              Prep for Interview →
            </button>
            <button className="w-full bg-secondary border border-border text-foreground rounded-xl py-3 text-sm font-semibold hover:bg-muted transition-colors min-h-10">
              Tailor Resume
            </button>
            <button className="w-full text-rose-600 text-sm font-semibold py-2.5 hover:bg-rose-50 rounded-xl transition-colors min-h-10">
              Withdraw Application
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
