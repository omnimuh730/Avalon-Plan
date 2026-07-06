import { useState } from "react";
import { PageShell } from "../../components/layout/PageShell";
import { Pill } from "../../components/ui";
import { TabTransition } from "../../components/overlays";
import { BidMonitorView } from "./BidMonitorView";
import type { BidMonitorSource } from "./types";

const SOURCES: { key: BidMonitorSource; label: string; subtitle: string }[] = [
  {
    key: "cloud",
    label: "Bid records",
    subtitle: "Cloud bid sessions from the shared vendor pipeline",
  },
  {
    key: "local",
    label: "My bid",
    subtitle: "Local bid sessions on this machine",
  },
];

export function VendorMonitorPage() {
  const [source, setSource] = useState<BidMonitorSource>("cloud");
  const active = SOURCES.find((s) => s.key === source) ?? SOURCES[0];

  return (
    <PageShell>
      <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 scroll-row mb-6 w-fit">
        {SOURCES.map((s) => (
          <Pill key={s.key} active={source === s.key} onClick={() => setSource(s.key)}>
            {s.label}
          </Pill>
        ))}
      </div>
      <TabTransition tabKey={source}>
        <BidMonitorView source={active.key} subtitle={active.subtitle} />
      </TabTransition>
    </PageShell>
  );
}
