import { useState } from "react";
import { Cpu, MessageSquare, BarChart3 } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { Collapsible } from "../../../components/shared/Collapsible";
import { Badge } from "../../../components/ui";
import { cn, display, mono } from "../../../lib/utils";
import type { Agent } from "../../../types";

const THROUGHPUT_DATA = [
  { t: "1", v: 120 }, { t: "2", v: 135 }, { t: "3", v: 128 },
  { t: "4", v: 142 }, { t: "5", v: 138 }, { t: "6", v: 145 },
];

const ERROR_DATA = [
  { t: "1", v: 1.8 }, { t: "2", v: 1.5 }, { t: "3", v: 1.4 },
  { t: "4", v: 1.2 }, { t: "5", v: 1.3 }, { t: "6", v: 1.2 },
];

const DEFAULT_CONVERSATION = [
  { id: "c1", role: "system" as const, content: "Agent initialized. Starting workflow run.", timestamp: new Date(Date.now() - 300000).toISOString() },
  { id: "c2", role: "agent" as const, content: "Found 847 listings across LinkedIn and Indeed. Filtering by your target role and location preferences.", timestamp: new Date(Date.now() - 240000).toISOString() },
  { id: "c3", role: "agent" as const, content: "Parsed 312 job descriptions. Extracting skill requirements and seniority signals.", timestamp: new Date(Date.now() - 180000).toISOString() },
  { id: "c4", role: "agent" as const, content: "Matching your resume stack against JD requirements. Top match score: 94% (Vercel — Senior Frontend Engineer).", timestamp: new Date(Date.now() - 60000).toISOString() },
];

type AgentMetricsPanelProps = {
  agent: Agent;
  onOpenResumeSetup?: () => void;
};

export function AgentMetricsPanel({ agent, onOpenResumeSetup }: AgentMetricsPanelProps) {
  const [tab, setTab] = useState<"metrics" | "conversation">("metrics");
  const [creativity, setCreativity] = useState(0.85);
  const messages = agent.conversation ?? DEFAULT_CONVERSATION;

  return (
    <aside className="w-80 border-l border-border bg-card flex flex-col overflow-hidden flex-shrink-0">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5 mb-3">
          <TabBtn active={tab === "metrics"} onClick={() => setTab("metrics")} icon={BarChart3} label="Metrics" />
          <TabBtn active={tab === "conversation"} onClick={() => setTab("conversation")} icon={MessageSquare} label="Chat" />
        </div>
        <h3 className="text-base font-bold text-foreground" style={display}>Agent Flow</h3>
        <p className="text-sm text-muted-foreground mt-0.5">Health and performance</p>
      </div>

      <div className="flex-1 overflow-y-auto subtle-scroll p-4 space-y-4">
        {tab === "metrics" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <SparklineCard label="Throughput" value={agent.throughput} suffix="/min" data={THROUGHPUT_DATA} color="#6c5ce7" />
              <SparklineCard label="Error rate" value={`${agent.errorRate}%`} data={ERROR_DATA} color="#f59e0b" valueClass="text-amber-600" />
            </div>

            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Core AI Model: Stable</p>
                <p className="text-xs text-muted-foreground">{agent.model} · {agent.latencyMs}ms</p>
              </div>
              <Badge v="success">Online</Badge>
            </div>

            <Collapsible title="Normalized Output" defaultOpen>
              <pre className="bg-secondary/70 border border-border rounded-lg p-3 text-xs overflow-x-auto leading-relaxed" style={mono}>
                {agent.normalizedOutput}
              </pre>
            </Collapsible>

            <Collapsible title="Creativity (Tailoring)" defaultOpen>
              <input type="range" min={0.5} max={1} step={0.05} value={creativity} onChange={(e) => setCreativity(parseFloat(e.target.value))} className="w-full accent-primary" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Conservative</span>
                <span className="font-bold text-foreground" style={mono}>{creativity.toFixed(2)}</span>
                <span>Creative</span>
              </div>
            </Collapsible>

            {onOpenResumeSetup && (
              <button type="button" onClick={onOpenResumeSetup} className="w-full text-sm font-semibold text-primary hover:underline text-left">
                Open resume setup →
              </button>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "rounded-xl p-3 text-sm",
                  msg.role === "agent" ? "bg-primary/5 border border-primary/15" : "bg-secondary/50 border border-border",
                )}
              >
                <p className="text-foreground leading-relaxed">{msg.content}</p>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function SparklineCard({
  label,
  value,
  suffix,
  data,
  color,
  valueClass = "text-foreground",
}: {
  label: string;
  value: string | number;
  suffix?: string;
  data: { t: string; v: number }[];
  color: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-secondary/50 border border-border rounded-xl p-3">
      <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-bold mb-2 ${valueClass}`} style={display}>
        {value}
        {suffix && <span className="text-xs font-normal text-muted-foreground ml-1">{suffix}</span>}
      </p>
      <ResponsiveContainer width="100%" height={48}>
        <LineChart data={data}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
