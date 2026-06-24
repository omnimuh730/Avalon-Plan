import React from "react";
import { CalendarCheck, FileText, TrendingUp, Zap } from "lucide-react";
import { KPI } from "../../../components/ui";
import type { ActivityEntry, DashboardData, JobRow, RunSummary } from "../../../types/agent";
import { AgentActivityFeed } from "./AgentActivityFeed";
import { AgentApplicationsChart, AgentPipelineChart } from "./AgentCharts";
import { AgentJobTable } from "./AgentJobTable";

export function AgentDashboardView({
  runs,
  dashboard,
  jobs,
  activity,
}: {
  runs: RunSummary[];
  dashboard: DashboardData | null;
  jobs: JobRow[];
  activity: ActivityEntry[];
}) {
  const runningCount = runs.filter((r) => r.status === "running").length;
  const pipeline = dashboard?.runPipeline;
  const chartData = dashboard?.submissions7d?.length ? dashboard.submissions7d : dashboard?.applications7d ?? [];
  const pipelineChart = pipeline
    ? [
        { stage: "In progress", count: pipeline.inProgress },
        { stage: "Succeeded", count: pipeline.succeeded },
        { stage: "Failed", count: pipeline.failed },
        { stage: "Scheduled", count: pipeline.scheduled },
        { stage: "Review", count: pipeline.review },
      ]
    : [];
  const succeededWeek = pipeline?.succeeded ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Active Runs" value={String(runningCount)} sub={`${runs.length} total runs`} icon={Zap} accent="violet" />
        <KPI label="In Progress" value={String(pipeline?.inProgress ?? 0)} sub="jobs being applied" icon={FileText} accent="amber" />
        <KPI label="Succeeded Today" value={String(dashboard?.succeededToday ?? 0)} sub={`${succeededWeek} total submitted`} icon={TrendingUp} accent="emerald" />
        <KPI label="Scheduled" value={String(pipeline?.scheduled ?? 0)} sub={`${dashboard?.posted ?? 0} posted in queue`} icon={CalendarCheck} accent="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <AgentApplicationsChart data={chartData} applied7d={succeededWeek} />
        <AgentPipelineChart data={pipelineChart} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AgentJobTable jobs={jobs} />
        </div>
        <AgentActivityFeed log={activity} />
      </div>
    </div>
  );
}
