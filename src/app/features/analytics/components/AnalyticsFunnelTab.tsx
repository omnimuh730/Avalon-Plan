import React from "react";
import { FunnelBars } from "../../../components/shared/FunnelBars";
import { FUNNEL } from "../../../data/applications";

export function AnalyticsFunnelTab() {
  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm max-w-2xl">
      <h3 className="text-sm font-bold text-foreground mb-1">Your Application Funnel</h3>
      <p className="text-sm text-muted-foreground mb-6">Conversion through each stage</p>
      <FunnelBars items={FUNNEL} barHeight="h-3" valueSize="md" />
    </div>
  );
}
