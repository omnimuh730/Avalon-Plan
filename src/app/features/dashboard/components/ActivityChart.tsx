import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartTip } from "../../../components/ui";
import { cn } from "../../../lib/utils";
import { AREA_DATA } from "../../../data/analytics";

export function ActivityChart() {
  return (
    <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-bold text-foreground">Application Activity</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Submissions, responses & interviews — 6 month trend
          </p>
        </div>
        <div className="flex items-center gap-1 bg-secondary rounded-xl p-1">
          {["1M", "3M", "6M", "1Y"].map((t, i) => (
            <button
              key={t}
              type="button"
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors min-h-9",
                i === 2 ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={AREA_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            {[["gA", "#6c5ce7"], ["gR", "#2dd4bf"], ["gI", "#f472b6"]].map(([id, c]) => (
              <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.22} />
                <stop offset="100%" stopColor={c} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis dataKey="m" tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTip />} />
          <Area type="monotone" dataKey="apps" name="Applications" stroke="#6c5ce7" strokeWidth={2} fill="url(#gA)" />
          <Area type="monotone" dataKey="responses" name="Responses" stroke="#2dd4bf" strokeWidth={2} fill="url(#gR)" />
          <Area type="monotone" dataKey="interviews" name="Interviews" stroke="#f472b6" strokeWidth={2} fill="url(#gI)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
