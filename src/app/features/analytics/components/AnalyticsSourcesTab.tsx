import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ChartTip } from "../../../components/ui";
import { SRC_DATA, SOURCE_RADAR } from "../../../data/analytics";
import { mono } from "../../../lib/utils";
import { AnalyticsChartCard } from "./AnalyticsHeatmap";

export function AnalyticsSourcesTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-foreground mb-1">Applications by Source</h3>
        <p className="text-sm text-muted-foreground mb-5">Volume vs responses — channel quality</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={SRC_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis dataKey="src" tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
            <Bar dataKey="apps" name="Applied" fill="#6c5ce7" opacity={0.7} radius={[4, 4, 0, 0]} />
            <Bar dataKey="responses" name="Responses" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-foreground mb-1">Response Rate by Source</h3>
        <p className="text-sm text-muted-foreground mb-5">Which channels work best for you</p>
        <div className="space-y-5 mt-2">
          {[...SRC_DATA].sort((a, b) => b.rate - a.rate).map((s) => (
            <div key={s.src}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-foreground">{s.src}</span>
                <span className="text-sm font-bold text-foreground" style={mono}>{s.rate}%</span>
              </div>
              <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${(s.rate / 65) * 100}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{s.responses} responses from {s.apps} applications</p>
            </div>
          ))}
        </div>
      </div>
      <AnalyticsChartCard title="Source comparison" subtitle="Multi-dimensional channel quality">
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart data={SOURCE_RADAR} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="rgba(0,0,0,0.08)" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: "#6b6b84", fontSize: 11 }} />
            <Radar name="LinkedIn" dataKey="LinkedIn" stroke="#6c5ce7" fill="#6c5ce7" fillOpacity={0.2} />
            <Radar name="Referral" dataKey="Referral" stroke="#2dd4bf" fill="#2dd4bf" fillOpacity={0.2} />
            <Radar name="Direct" dataKey="Direct" stroke="#f472b6" fill="#f472b6" fillOpacity={0.2} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </RadarChart>
        </ResponsiveContainer>
      </AnalyticsChartCard>
    </div>
  );
}
