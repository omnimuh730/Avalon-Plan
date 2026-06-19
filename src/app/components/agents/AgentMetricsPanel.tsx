import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { cn, display, mono } from "../../lib/utils";
import { Badge } from "../ui/Badge";
import type { Agent } from "../../types";

const THROUGHPUT_DATA = [
  { t: "1", v: 120 },
  { t: "2", v: 135 },
  { t: "3", v: 128 },
  { t: "4", v: 142 },
  { t: "5", v: 138 },
  { t: "6", v: 145 },
];

const ERROR_DATA = [
  { t: "1", v: 1.8 },
  { t: "2", v: 1.5 },
  { t: "3", v: 1.4 },
  { t: "4", v: 1.2 },
  { t: "5", v: 1.3 },
  { t: "6", v: 1.2 },
];

function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary/50 transition-colors"
      >
        {title}
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export function AgentMetricsPanel({ agent }: { agent: Agent }) {
  const [creativity, setCreativity] = useState(0.85);

  return (
    <aside className="w-80 border-l border-border bg-card flex flex-col overflow-y-auto subtle-scroll flex-shrink-0">
      <div className="p-5 border-b border-border">
        <h3 className="text-base font-bold text-foreground" style={display}>
          Agent Flow
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Health and Performance
        </p>
      </div>

      <div className="p-5 space-y-5 flex-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-secondary/50 border border-border rounded-xl p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">
              Throughput
            </p>
            <p className="text-lg font-bold text-foreground mb-2" style={display}>
              {agent.throughput}
              <span className="text-xs font-normal text-muted-foreground ml-1">
                /min
              </span>
            </p>
            <ResponsiveContainer width="100%" height={48}>
              <LineChart data={THROUGHPUT_DATA}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="#6c5ce7"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-secondary/50 border border-border rounded-xl p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">
              Error rate
            </p>
            <p className="text-lg font-bold text-amber-600 mb-2" style={display}>
              {agent.errorRate}%
            </p>
            <ResponsiveContainer width="100%" height={48}>
              <LineChart data={ERROR_DATA}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              Core AI Model: Stable
            </p>
            <p className="text-xs text-muted-foreground">
              {agent.model} · Latency {agent.latencyMs}ms
            </p>
          </div>
          <Badge v="success">Online</Badge>
        </div>

        <Collapsible title="Environment Context" defaultOpen>
          <select className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/40">
            <option>Production</option>
            <option>Sandbox</option>
          </select>
        </Collapsible>

        <Collapsible title="Error Details">
          <p className="text-sm text-muted-foreground">No errors in last 24h</p>
        </Collapsible>

        <Collapsible title="Normalized Output" defaultOpen>
          <pre
            className="bg-secondary/70 border border-border rounded-lg p-3 text-xs text-foreground/80 overflow-x-auto leading-relaxed"
            style={mono}
          >
            {agent.normalizedOutput}
          </pre>
        </Collapsible>

        <Collapsible title="Creativity (Tailoring)" defaultOpen>
          <div className="space-y-2">
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.05}
              value={creativity}
              onChange={(e) => setCreativity(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Conservative</span>
              <span className="font-bold text-foreground" style={mono}>
                {creativity.toFixed(2)}
              </span>
              <span>Creative</span>
            </div>
          </div>
        </Collapsible>

        <Collapsible title="Dependency Tree">
          <div className="space-y-2 text-sm">
            {["match_score", "role_title", "company_name", "priority_level"].map(
              (field) => (
                <div
                  key={field}
                  className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg"
                >
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-mono text-xs text-foreground">{field}</span>
                </div>
              )
            )}
          </div>
        </Collapsible>
      </div>

      <div className="p-5 border-t border-border">
        <button className="w-full bg-primary text-white rounded-xl py-3 text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm min-h-10">
          Apply Normalization
        </button>
      </div>
    </aside>
  );
}
