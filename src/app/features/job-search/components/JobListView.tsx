import React from "react";
import { Bookmark, Send } from "lucide-react";
import { Badge, Score } from "../../../components/ui";
import { cn } from "../../../lib/utils";
import type { Job, BadgeVariant } from "../../../types";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  saved: "blue",
  applied: "success",
  closed: "subtle",
};

type JobListRowProps = {
  job: Job;
};

export function JobListRow({ job }: JobListRowProps) {
  return (
    <div className="group flex items-center gap-4 px-4 py-3 hover:bg-secondary/40 transition-colors border-b border-border/50 cursor-pointer min-h-[52px]">
      <Score score={job.matchScore} />
      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-1 md:gap-4 items-center">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{job.title}</p>
          <p className="text-xs text-muted-foreground truncate md:hidden">
            {job.company} · {job.location}
          </p>
        </div>
        <p className="text-sm font-semibold text-foreground truncate hidden md:block">{job.company}</p>
        <p className="text-sm text-muted-foreground truncate hidden md:block">{job.location}</p>
        <p className="text-sm text-muted-foreground font-semibold hidden md:block">{job.salary}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-muted-foreground hidden lg:inline">{job.source}</span>
        <Badge v={STATUS_VARIANTS[job.status]}>{job.status}</Badge>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            className="icon-btn text-muted-foreground hover:text-foreground w-9 h-9"
            title="Save"
          >
            <Bookmark className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="icon-btn text-muted-foreground hover:text-primary w-9 h-9"
            title="Apply"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function JobListView({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        No jobs match your filters.
      </div>
    );
  }
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="hidden md:grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-3 bg-secondary/30 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider">
        <span>Match</span>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4">
          <span>Role</span>
          <span>Company</span>
          <span>Location</span>
          <span>Salary</span>
        </div>
        <span>Status</span>
      </div>
      {jobs.map((j) => (
        <JobListRow key={j.id} job={j} />
      ))}
    </div>
  );
}
