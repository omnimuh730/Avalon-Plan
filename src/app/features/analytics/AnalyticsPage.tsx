import React from "react";
import { PageShell } from "../../components/layout/PageShell";
import { Pill } from "../../components/ui";
import { useAnalyticsFilters, DATE_RANGE_OPTIONS } from "../../hooks/useAnalyticsFilters";
import { AnalyticsOverviewTab } from "./components/AnalyticsOverviewTab";
import { AnalyticsSourcesTab } from "./components/AnalyticsSourcesTab";
import { AnalyticsFunnelTab } from "./components/AnalyticsFunnelTab";
import { AnalyticsVelocityTab } from "./components/AnalyticsVelocityTab";
import { AnalyticsInsightsTab } from "./components/AnalyticsInsightsTab";

const TABS = ["overview", "sources", "funnel", "velocity", "insights"] as const;

export function AnalyticsPage() {
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("overview");
  const { range, setRange } = useAnalyticsFilters();

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 scroll-row">
          {TABS.map((t) => (
            <Pill key={t} active={tab === t} onClick={() => setTab(t)}>
              {t}
            </Pill>
          ))}
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as typeof range)}
          className="bg-secondary border border-border rounded-xl px-4 py-2 text-sm font-semibold outline-none focus:border-primary/40 min-h-10"
        >
          {DATE_RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {tab === "overview" && <AnalyticsOverviewTab />}
      {tab === "sources" && <AnalyticsSourcesTab />}
      {tab === "funnel" && <AnalyticsFunnelTab />}
      {tab === "velocity" && <AnalyticsVelocityTab />}
      {tab === "insights" && <AnalyticsInsightsTab />}
    </PageShell>
  );
}
