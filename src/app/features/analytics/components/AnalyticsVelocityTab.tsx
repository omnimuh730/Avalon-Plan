import React from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartTip } from "../../../components/ui";
import { AnalyticsChartCard } from "./AnalyticsHeatmap";
import { VELOCITY_SERIES, COHORT_DATA } from "../../../data/analytics";

export function AnalyticsVelocityTab() {
  return (
    <div className="space-y-5">
      <AnalyticsChartCard title="Time-to-response trend" subtitle="Days from application to first reply">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={VELOCITY_SERIES}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis dataKey="w" tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip />} />
            <Line type="monotone" dataKey="response" name="Response (days)" stroke="#6c5ce7" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </AnalyticsChartCard>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <AnalyticsChartCard title="Stage duration" subtitle="Average days per stage">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={VELOCITY_SERIES}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="w" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="interview" name="To interview" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
              <Bar dataKey="offer" name="To offer" fill="#f472b6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </AnalyticsChartCard>
        <AnalyticsChartCard title="Cohort conversion" subtitle="Applied → screening → interview">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={COHORT_DATA}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="m" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Line type="monotone" dataKey="c2" name="Screening %" stroke="#2dd4bf" strokeWidth={2} />
              <Line type="monotone" dataKey="c3" name="Interview %" stroke="#6c5ce7" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsChartCard>
      </div>
    </div>
  );
}
