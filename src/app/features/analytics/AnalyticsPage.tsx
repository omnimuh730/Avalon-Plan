import React from "react";
import { PageShell } from "../../components/layout/PageShell";
import { Pill } from "../../components/ui";
import { TabTransition } from "../../components/overlays";
import { AthensSelect } from "../../components/forms";
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
        <AthensSelect
          value={range}
          onChange={(v) => setRange(v as typeof range)}
          options={DATE_RANGE_OPTIONS}
          className="w-44"
        />
      </div>
      <TabTransition tabKey={tab}>
        {tab === "overview" && <AnalyticsOverviewTab range={range} />}
        {tab === "sources" && <AnalyticsSourcesTab range={range} />}
        {tab === "funnel" && <AnalyticsFunnelTab range={range} />}
        {tab === "velocity" && <AnalyticsVelocityTab range={range} />}
        {tab === "insights" && <AnalyticsInsightsTab range={range} />}
      </TabTransition>
    </PageShell>
  );
}
