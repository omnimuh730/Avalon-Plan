import React from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Bot } from "lucide-react";
import { useAgentsContextOptional } from "../../../context/AgentsContext";

const AGENT_ACTIVITY = [
  { h: "6a", t: 2 },
  { h: "9a", t: 8 },
  { h: "12p", t: 12 },
  { h: "3p", t: 6 },
  { h: "6p", t: 4 },
  { h: "9p", t: 1 },
];

type AgentActivityPanelProps = {
  onNavigateAgents?: () => void;
};

export function AgentActivityPanel({ onNavigateAgents }: AgentActivityPanelProps) {
  const agentsCtx = useAgentsContextOptional();
  const agents = agentsCtx?.agents ?? [];
  const activeAgents = agents.filter((a) => a.status === "active");
  const tasksRunning = agents.reduce((s, a) => s + (a.runsToday ?? 0), 0);

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Bot className="w-5 h-5 text-violet-600" />
        <div>
          <h3 className="text-sm font-bold text-foreground">Agent Activity</h3>
          <p className="text-xs text-muted-foreground">
            {tasksRunning} runs today across {activeAgents.length} active agents
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={AGENT_ACTIVITY} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="agentGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6c5ce7" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#6c5ce7" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="t" stroke="#6c5ce7" strokeWidth={2} fill="url(#agentGrad)" />
        </AreaChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {agents.slice(0, 3).map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              agentsCtx?.setSelectedId(a.id, "monitor");
              onNavigateAgents?.();
            }}
            className="bg-secondary/50 rounded-lg py-2 px-1 text-center hover:bg-secondary transition-colors"
          >
            <p className="text-xs font-bold text-foreground truncate">{a.name}</p>
            <p className="text-[10px] text-muted-foreground">{a.runsToday ?? 0} runs</p>
          </button>
        ))}
      </div>
    </div>
  );
}
