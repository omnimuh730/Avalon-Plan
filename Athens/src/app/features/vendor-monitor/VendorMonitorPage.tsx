import { useState } from "react";
import { PageShell } from "../../components/layout/PageShell";
import { Pill } from "../../components/ui";
import { TabTransition } from "../../components/overlays";
import { BidMonitorView } from "./BidMonitorView";
import { BidAnalyticsView } from "./BidAnalyticsView";
import { TaskPoolView } from "./TaskPoolView";

type VendorMonitorTab = "sessions" | "tasks" | "analytics";

export function VendorMonitorPage() {
  const [tab, setTab] = useState<VendorMonitorTab>("sessions");

  return (
    <PageShell>
      <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 mb-5 w-fit">
        <Pill active={tab === "sessions"} onClick={() => setTab("sessions")}>
          Sessions
        </Pill>
        <Pill active={tab === "tasks"} onClick={() => setTab("tasks")}>
          Tasks
        </Pill>
        <Pill active={tab === "analytics"} onClick={() => setTab("analytics")}>
          Analytics
        </Pill>
      </div>
      <TabTransition tabKey={tab}>
        {tab === "sessions" ? (
          <BidMonitorView subtitle="Bid sessions from the main MongoDB" />
        ) : tab === "tasks" ? (
          <TaskPoolView />
        ) : (
          <BidAnalyticsView />
        )}
      </TabTransition>
    </PageShell>
  );
}
