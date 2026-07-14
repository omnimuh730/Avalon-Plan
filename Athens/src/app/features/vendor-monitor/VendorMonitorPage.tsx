import { useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { Pill } from "../../components/ui";
import { Button } from "../../components/ui/button";
import { TabTransition } from "../../components/overlays";
import { PATHS, normalizeTab } from "../../config/routes";
import { BidMonitorView } from "./BidMonitorView";
import { BidAnalyticsView } from "./BidAnalyticsView";
import { TaskPoolView } from "./TaskPoolView";

const VENDOR_TABS = ["sessions", "tasks", "analytics"] as const;
type VendorMonitorTab = (typeof VENDOR_TABS)[number];

export function VendorMonitorPage() {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();
  const tab = normalizeTab(tabParam, VENDOR_TABS, "sessions");

  const setTab = (next: VendorMonitorTab) => {
    navigate(`${PATHS.vendorMonitor}/${next}`, { replace: true });
  };

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 w-fit">
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
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate(PATHS.jobs)}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Job Search
        </Button>
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
