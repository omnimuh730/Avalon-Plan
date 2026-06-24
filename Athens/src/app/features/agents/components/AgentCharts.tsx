import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTip } from "../../../components/ui";

export function AgentApplicationsChart({
  data,
  applied7d,
}: {
  data: { day: string; date: string; count: number }[];
  applied7d?: number;
}) {
  return (
    <div className="lg:col-span-3 bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-foreground">7-Day Submissions</h3>
        {applied7d != null && applied7d > 0 && (
          <span className="text-xs text-muted-foreground font-medium bg-secondary border border-border px-2.5 py-1 rounded-full">
            {applied7d} this week
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="agentSubGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6c5ce7" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#6c5ce7" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTip />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="count"
            name="submissions"
            stroke="#6c5ce7"
            strokeWidth={2}
            fill="url(#agentSubGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AgentPipelineChart({ data }: { data: { stage: string; count: number }[] }) {
  return (
    <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-5">Pipeline Stages</h3>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="stage" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTip />} cursor={{ fill: "var(--secondary)" }} />
          <Bar dataKey="count" name="count" fill="#6c5ce7" fillOpacity={0.85} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
