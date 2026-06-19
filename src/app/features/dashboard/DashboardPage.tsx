import React from "react";
import { PageShell } from "../../components/layout/PageShell";
import { DashboardKpiGrid } from "./components/DashboardKpiGrid";
import { ActivityChart } from "./components/ActivityChart";
import { FunnelPanel } from "./components/FunnelPanel";
import { ActivityFeed } from "./components/ActivityFeed";
import { SourceChart } from "./components/SourceChart";
import { AiRecommendations } from "./components/AiRecommendations";

export function DashboardPage() {
  return (
    <PageShell>
      <div className="space-y-6">
        <DashboardKpiGrid />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ActivityChart />
          <FunnelPanel />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ActivityFeed />
          <SourceChart />
          <AiRecommendations />
        </div>
      </div>
    </PageShell>
  );
}
