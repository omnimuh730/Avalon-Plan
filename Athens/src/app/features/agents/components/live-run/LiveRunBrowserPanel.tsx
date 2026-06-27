import { Terminal } from "lucide-react";
import type { JobView, ResumeMatch, RunField, RunMeta, RunUsage, Screenshot } from "./types";
import { LiveRunScreenshot } from "./LiveRunScreenshot";
import { LiveRunResumeMatch } from "./LiveRunResumeMatch";
import { LiveRunFieldsList } from "./LiveRunFieldsList";
import { LiveRunUsageCard } from "./LiveRunUsageCard";

export function LiveRunBrowserPanel({ runId, profileName, shot, resumeMatch, fields, usage, meta, jobLabel, jobs, selectedIndex, batchUsage, isBatch }: {
  runId: string;
  profileName?: string;
  shot: Screenshot | null;
  resumeMatch: ResumeMatch | null;
  fields: RunField[];
  usage: RunUsage | null;
  meta: RunMeta;
  jobLabel?: string;
  jobs?: JobView[];
  selectedIndex?: number;
  batchUsage?: RunUsage | null;
  isBatch?: boolean;
}) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="px-5 py-2.5 border-b border-border flex items-center gap-2 shrink-0">
        <Terminal size={14} className="text-primary" />
        <h4 className="text-sm font-semibold text-foreground">{shot ? shot.label : "Live browser"}</h4>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <LiveRunScreenshot shot={shot} />
        {resumeMatch && (
          <LiveRunResumeMatch runId={runId} profileName={profileName || meta.profileName} resumeMatch={resumeMatch} />
        )}
        <LiveRunFieldsList fields={fields} />
        <LiveRunUsageCard
          usage={usage}
          meta={meta}
          jobLabel={jobLabel}
          jobs={jobs}
          selectedIndex={selectedIndex}
          batchUsage={batchUsage}
          isBatch={isBatch}
        />
      </div>
    </div>
  );
}
