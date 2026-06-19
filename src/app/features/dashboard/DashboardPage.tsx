import React from "react";
import { PageShell } from "../../components/layout/PageShell";
import { DashboardHero } from "./components/DashboardHero";
import { DashboardKpiGrid } from "./components/DashboardKpiGrid";
import { ActivityChart } from "./components/ActivityChart";
import { FunnelPanel } from "./components/FunnelPanel";
import { ActivityFeed } from "./components/ActivityFeed";
import { SourceChart } from "./components/SourceChart";
import { AiRecommendations } from "./components/AiRecommendations";
import { UpcomingInterviewsPanel } from "./components/UpcomingInterviewsPanel";
import { MiniCalendarStrip } from "./components/MiniCalendarStrip";
import { AgentActivityPanel } from "./components/AgentActivityPanel";
import { useUpcomingInterviews } from "../../hooks/useDashboardMetrics";

export function DashboardPage() {
  const upcoming = useUpcomingInterviews(4);

  return (
    <PageShell>
      <div className="space-y-6">
        <DashboardHero />
        <DashboardKpiGrid />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ActivityChart />
          <div className="space-y-5">
            <UpcomingInterviewsPanel interviews={upcoming} />
            <MiniCalendarStrip />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <FunnelPanel />
          <AgentActivityPanel />
          <SourceChart />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ActivityFeed />
          <div className="lg:col-span-2">
            <AiRecommendations />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
