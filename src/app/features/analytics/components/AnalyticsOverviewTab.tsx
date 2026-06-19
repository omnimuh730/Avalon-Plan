import React from "react";
import { CheckCircle, Clock, TrendingUp, Briefcase } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, PieChart, Pie, Cell } from "recharts";
import { KPI, ChartTip } from "../../../components/ui";
import { AREA_DATA, ROLE_PIE } from "../../../data/analytics";
import { mono } from "../../../lib/utils";
import { AnalyticsHeatmap } from "./AnalyticsHeatmap";

export function AnalyticsOverviewTab() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Applications YTD" value="47" trend="+18%" sub="vs last year" icon={Briefcase} accent="violet" />
        <KPI label="Response Rate" value="38%" trend="+6pts" icon={CheckCircle} accent="emerald" />
        <KPI label="Interview Rate" value="22%" sub="above avg" icon={TrendingUp} accent="blue" />
        <KPI label="Avg Time to Response" value="4.2d" sub="↓1.3d" icon={Clock} accent="amber" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-1">Application Trend</h3>
          <p className="text-sm text-muted-foreground mb-5">Submissions & responses — Jan to Jun 2026</p>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={AREA_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="m" tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="apps" name="Applied" fill="#6c5ce7" opacity={0.8} radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="responses" name="Responses" stroke="#2dd4bf" strokeWidth={2} dot={{ fill: "#2dd4bf", r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-1">Applications by Role Type</h3>
          <p className="text-sm text-muted-foreground mb-5">Where you're focusing your search</p>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="55%" height={200}>
              <PieChart>
                <Pie data={ROLE_PIE} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="v">
                  {ROLE_PIE.map((e, i) => <Cell key={i} fill={e.c} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {ROLE_PIE.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.c }} />
                  <span className="text-sm text-muted-foreground font-semibold">{d.name}</span>
                  <span className="text-sm font-bold text-foreground ml-auto" style={mono}>{d.v}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <AnalyticsHeatmap />
    </div>
  );
}
