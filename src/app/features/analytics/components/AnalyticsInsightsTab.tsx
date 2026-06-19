import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartTip } from "../../../components/ui";
import { AnalyticsChartCard } from "./AnalyticsHeatmap";
import { DIVERSITY_DATA, COST_DATA, OFFER_SCATTER } from "../../../data/analytics";

export function AnalyticsInsightsTab({ range: _range = "30d" }: { range?: import("../../../hooks/useAnalyticsFilters").DateRange }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <AnalyticsChartCard title="Application diversity" subtitle="Self-reported demographics">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={DIVERSITY_DATA} dataKey="v" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {DIVERSITY_DATA.map((e) => (
                <Cell key={e.name} fill={e.c} />
              ))}
            </Pie>
            <Tooltip content={<ChartTip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-3 mt-2">
          {DIVERSITY_DATA.map((d) => (
            <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full" style={{ background: d.c }} />
              {d.name} {d.v}%
            </span>
          ))}
        </div>
      </AnalyticsChartCard>
      <AnalyticsChartCard title="Cost per application" subtitle="Estimated spend by source ($)">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={COST_DATA} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="src" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="cost" name="Cost ($)" fill="#6c5ce7" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </AnalyticsChartCard>
      <AnalyticsChartCard title="Offer likelihood" subtitle="Match score vs predicted offer probability">
        <ResponsiveContainer width="100%" height={240}>
          <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" />
            <XAxis type="number" dataKey="match" name="Match %" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="number" dataKey="likelihood" name="Likelihood %" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip />} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={OFFER_SCATTER} fill="#2dd4bf" />
          </ScatterChart>
        </ResponsiveContainer>
      </AnalyticsChartCard>
    </div>
  );
}
