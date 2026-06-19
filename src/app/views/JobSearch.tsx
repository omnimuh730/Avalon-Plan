import React, { useState } from "react";
import {
  Plus,
  LayoutGrid,
  SlidersHorizontal,
  MoreHorizontal,
  Bookmark,
  Send,
} from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { Pill } from "../components/ui/Pill";
import { Badge } from "../components/ui/Badge";
import { Score } from "../components/ui/Score";
import { cn } from "../lib/utils";
import { JOBS } from "../data/jobs";
import type { BadgeVariant } from "../types";

export function JobSearch() {
  const [mode, setMode] = useState<"table" | "grid">("grid");
  const [filter, setFilter] = useState("all");
  const SB: Record<string, BadgeVariant> = {
    saved: "blue",
    applied: "success",
    closed: "subtle",
  };
  const filtered = filter === "all" ? JOBS : JOBS.filter((j) => j.status === filter);

  return (
    <PageShell>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-1 bg-secondary rounded-xl p-1">
          {["all", "saved", "applied"].map((f) => (
            <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>
              {f}
            </Pill>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setMode("table")}
            className={cn(
              "icon-btn border border-border",
              mode === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
            )}
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
          <button
            onClick={() => setMode("grid")}
            className={cn(
              "icon-btn border border-border",
              mode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
            )}
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
        </div>
      </div>

      {mode === "table" ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                {["Role", "Company", "Location", "Match", "Status", "Salary", ""].map((h) => (
                  <th key={h} className="text-left px-5 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((j, i) => (
                <tr
                  key={j.id}
                  className={cn(
                    "hover:bg-secondary/30 transition-colors cursor-pointer group",
                    i < filtered.length - 1 ? "border-b border-border/50" : ""
                  )}
                >
                  <td className="px-5 py-4">
                    <p className="text-sm font-bold text-foreground">{j.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{j.type} · {j.posted}</p>
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-foreground">{j.company}</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{j.location}</td>
                  <td className="px-5 py-4"><Score score={j.matchScore} /></td>
                  <td className="px-5 py-4"><Badge v={SB[j.status]}>{j.status}</Badge></td>
                  <td className="px-5 py-4 text-sm text-muted-foreground font-semibold">{j.salary}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="icon-btn text-muted-foreground hover:text-foreground w-9 h-9 min-w-9 min-h-9">
                        <Bookmark className="w-4 h-4" />
                      </button>
                      <button className="icon-btn text-muted-foreground hover:text-foreground w-9 h-9 min-w-9 min-h-9">
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((j) => (
            <div
              key={j.id}
              className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all group cursor-pointer shadow-sm"
            >
              <div className="flex items-start justify-between mb-4">
                <Score score={j.matchScore} />
                <Badge v={SB[j.status]}>{j.status}</Badge>
              </div>
              <h3 className="text-base font-bold text-foreground mb-1">{j.title}</h3>
              <p className="text-sm text-muted-foreground mb-1">{j.company}</p>
              <p className="text-sm text-muted-foreground mb-4">{j.location} · {j.source}</p>
              <div className="flex items-end justify-between">
                <p className="text-sm font-semibold text-foreground">{j.salary}</p>
                <div className="flex gap-2">
                  <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-secondary min-h-10">
                    <Bookmark className="w-4 h-4" />
                    Save
                  </button>
                  <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10">
                    <Send className="w-4 h-4" />
                    Apply
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
