import React from "react";
import { JobCard } from "./JobCard";
import { cn } from "../../../lib/utils";
import type { Job } from "../../../types";

type JobListViewProps = {
  jobs: Job[];
  layout?: "list" | "grid";
};

export function JobListView({ jobs, layout = "list" }: JobListViewProps) {
  if (jobs.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        No jobs match your filters.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "py-2",
        layout === "grid"
          ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          : "flex flex-col gap-4",
      )}
    >
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
