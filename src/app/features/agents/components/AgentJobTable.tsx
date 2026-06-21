import React, { useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "../../../components/ui";
import { mono } from "../lib/constants";
import { jobStatusStyle } from "../lib/status-styles";
import type { JobRow, JobTabKey } from "../../../types/agent";

function JobBadge({ status }: { status: JobRow["status"] }) {
  const st = jobStatusStyle(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${st.badge} ${st.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {st.label}
    </span>
  );
}

function JobTableRow({ job }: { job: JobRow }) {
  return (
    <tr className="border-b border-border/60 hover:bg-secondary/50 transition-colors">
      <td className="px-5 py-3.5">
        <div className="font-medium text-foreground leading-snug">{job.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{job.company}</div>
        {job.matchPercent != null && (
          <div className="text-[10px] text-violet-600 mt-0.5">
            {job.matchPercent}% match{job.resumeStack ? ` · ${job.resumeStack}` : ""}
          </div>
        )}
      </td>
      <td className="px-4 py-3.5 text-xs text-muted-foreground">{job.source}</td>
      <td className="px-4 py-3.5">
        {job.agentName ? (
          <Badge v="violet">{job.agentName}</Badge>
        ) : (
          <span className={`${mono} text-xs text-muted-foreground`}>—</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        <JobBadge status={job.status} />
      </td>
      <td className={`px-4 py-3.5 ${mono} text-xs text-muted-foreground`}>
        {job.appliedDate ? new Date(job.appliedDate).toLocaleDateString() : "—"}
      </td>
    </tr>
  );
}

export function AgentJobTable({ jobs }: { jobs: JobRow[] }) {
  const [tab, setTab] = useState<JobTabKey>("in_progress");
  const [search, setSearch] = useState("");
  const tabs: { key: JobTabKey; label: string; count: number }[] = [
    { key: "in_progress", label: "In progress", count: jobs.filter((j) => j.status === "in_progress").length },
    { key: "succeeded", label: "Succeeded", count: jobs.filter((j) => j.status === "succeeded").length },
    { key: "failed", label: "Failed", count: jobs.filter((j) => j.status === "failed").length },
    { key: "scheduled", label: "Scheduled", count: jobs.filter((j) => j.status === "scheduled").length },
  ];
  const effectiveTab = jobs.some((j) => j.status === tab) ? tab : tabs.find((t) => t.count > 0)?.key ?? "in_progress";

  const filtered = jobs.filter((j) => {
    if (j.status !== effectiveTab) return false;
    const q = search.toLowerCase();
    if (q && !j.title.toLowerCase().includes(q) && !j.company.toLowerCase().includes(q) && !(j.agentName || "").toLowerCase().includes(q))
      return false;
    return true;
  });

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border gap-3 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                effectiveTab === t.key ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
        <div className="relative shrink-0">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs…"
            className="pl-8 pr-3 py-2 text-sm rounded-xl border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-48"
          />
        </div>
      </div>
      <div className="overflow-auto" style={{ maxHeight: 360 }}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left sticky top-0 bg-card z-10 border-b border-border">
              <th className="px-5 py-3">Job</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((j) => (
              <JobTableRow key={j.id} job={j} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Search size={20} className="opacity-40" />
            <p className="text-sm">No {tabs.find((t) => t.key === effectiveTab)?.label.toLowerCase()} jobs</p>
          </div>
        )}
      </div>
    </div>
  );
}
