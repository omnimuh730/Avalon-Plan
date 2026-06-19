import React, { useState } from "react";
import { CheckCircle, Clock, TrendingUp, Briefcase } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { KPI, Pill } from "../../components/ui";
import { AnalyticsOverviewTab } from "./components/AnalyticsOverviewTab";
import { AnalyticsSourcesTab } from "./components/AnalyticsSourcesTab";
import { AnalyticsFunnelTab } from "./components/AnalyticsFunnelTab";

export function AnalyticsPage() {
  const [tab, setTab] = useState("overview");

  return (
    <PageShell>
      <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 w-fit mb-6 scroll-row">
        {["overview", "sources", "funnel", "velocity"].map((t) => (
          <Pill key={t} active={tab === t} onClick={() => setTab(t)}>{t}</Pill>
        ))}
      </div>
      {tab === "overview" && <AnalyticsOverviewTab />}
      {tab === "sources" && <AnalyticsSourcesTab />}
      {tab === "funnel" && <AnalyticsFunnelTab />}
      {tab === "velocity" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI label="Apps / Week" value="5.2" trend="+0.8" icon={Briefcase} accent="violet" />
          <KPI label="Follow-ups Sent" value="18" sub="this month" icon={TrendingUp} accent="blue" />
          <KPI label="Interviews / Month" value="4.5" sub="on track" icon={CheckCircle} accent="emerald" />
          <KPI label="Offer Rate" value="4.3%" sub="2 of 47 apps" icon={Clock} accent="amber" />
        </div>
      )}
    </PageShell>
  );
}
