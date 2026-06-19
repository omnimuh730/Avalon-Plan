import React from "react";
import { cn } from "../../../lib/utils";
import { HEATMAP_DATA } from "../../../data/analytics";

const HOURS = ["h6", "h9", "h12", "h15", "h18", "h21"] as const;
const LABELS = ["6a", "9a", "12p", "3p", "6p", "9p"];

function heatColor(v: number): string {
  if (v >= 7) return "bg-violet-600";
  if (v >= 5) return "bg-violet-500/70";
  if (v >= 3) return "bg-violet-400/50";
  if (v >= 1) return "bg-violet-300/40";
  return "bg-secondary";
}

export function AnalyticsHeatmap() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-bold text-foreground mb-4">Activity by weekday & hour</h3>
      <div className="overflow-x-auto">
        <div className="min-w-[320px]">
          <div className="grid grid-cols-[40px_repeat(6,1fr)] gap-1 mb-1">
            <div />
            {LABELS.map((l) => (
              <div key={l} className="text-[10px] text-center text-muted-foreground font-semibold">{l}</div>
            ))}
          </div>
          {HEATMAP_DATA.map((row) => (
            <div key={row.day} className="grid grid-cols-[40px_repeat(6,1fr)] gap-1 mb-1">
              <div className="text-xs text-muted-foreground font-semibold flex items-center">{row.day}</div>
              {HOURS.map((h) => (
                <div
                  key={h}
                  className={cn("h-8 rounded-md", heatColor(row[h]))}
                  title={`${row.day} ${h}: ${row[h]} activities`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}
