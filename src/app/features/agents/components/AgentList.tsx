import React from "react";
import {
  Bot,
  Activity,
  Briefcase,
  Play,
  Pause,
  MoreHorizontal,
  ChevronRight,
} from "lucide-react";
import { cn, mono } from "../../../lib/utils";
import { KPI } from "../../../components/ui";
import { Badge } from "../../../components/ui";
import type { Agent } from "../../../types";

export function AgentList({
  agents,
  onSelect,
  onToggle,
}: {
  agents: Agent[];
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const activeCount = agents.filter((a) => a.status === "active").length;
  const totalMatched = agents.reduce((s, a) => s + a.matched, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPI
          label="Active Agents"
          value={String(activeCount)}
          sub={`of ${agents.length} total`}
          icon={Bot}
          accent="violet"
        />
        <KPI
          label="Tasks Running"
          value="12"
          sub="across all agents"
          icon={Activity}
          accent="blue"
        />
        <KPI
          label="Jobs Matched"
          value={String(totalMatched)}
          sub="in last 24 hours"
          icon={Briefcase}
          accent="emerald"
        />
      </div>

      <div className="space-y-4">
        {agents.map((a) => (
          <div
            key={a.id}
            className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all shadow-sm"
          >
            <div className="flex items-center gap-5">
              <div
                className={cn(
                  "w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0",
                  a.status === "active"
                    ? "bg-emerald-100"
                    : a.status === "complete"
                      ? "bg-blue-100"
                      : "bg-secondary"
                )}
              >
                <Bot
                  className={cn(
                    "w-7 h-7",
                    a.status === "active"
                      ? "text-emerald-600"
                      : a.status === "complete"
                        ? "text-blue-600"
                        : "text-muted-foreground"
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <p className="text-base font-bold text-foreground">{a.name}</p>
                  <Badge
                    v={
                      a.status === "active"
                        ? "success"
                        : a.status === "complete"
                          ? "blue"
                          : "subtle"
                    }
                  >
                    {a.status}
                  </Badge>
                  <span
                    className="text-xs text-muted-foreground ml-auto"
                    style={mono}
                  >
                    {a.model}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{a.task}</p>
                {a.status !== "idle" && (
                  <>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-muted-foreground font-semibold">
                        Progress
                      </span>
                      <span
                        className="text-xs text-foreground font-bold"
                        style={mono}
                      >
                        {a.progress}%
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-700",
                          a.status === "complete"
                            ? "bg-blue-500"
                            : "bg-emerald-500"
                        )}
                        style={{ width: `${a.progress}%` }}
                      />
                    </div>
                    {a.matched > 0 && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {a.matched} jobs matched
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {(a.status === "active" || a.status === "idle") && (
                  <button
                    onClick={() => onToggle(a.id)}
                    className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary border border-border"
                  >
                    {a.status === "active" ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => onSelect(a.id)}
                  className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors min-h-10"
                >
                  Open Monitor
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary border border-border">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
