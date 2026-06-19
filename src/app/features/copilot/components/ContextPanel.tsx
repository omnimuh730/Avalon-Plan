import React from "react";
import { ChevronRight } from "lucide-react";
import { Av } from "../../../components/ui";
import { ToggleSwitch } from "../../../components/shared/ToggleSwitch";
import { mono } from "../../../lib/utils";
import { APPLICATIONS } from "../../../data/applications";
import { COPILOT_QUICK_ACTIONS, COPILOT_WORKFLOWS, TOP_APPLICATION_IDS } from "../../../data/copilot";

export function ContextPanel() {
  return (
    <div className="w-60 border-l border-border flex-shrink-0 overflow-y-auto p-5 space-y-5 bg-secondary/20 subtle-scroll">
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Target Role</p>
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <p className="text-sm font-bold text-foreground">Senior Frontend Engineer</p>
          <p className="text-sm text-muted-foreground">Vercel · Remote</p>
          <p className="text-xs text-muted-foreground mt-1">94% match · $160k–$200k</p>
          <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full w-[94%] bg-primary rounded-full" />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Strong fit — apply soon</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Top Applications</p>
        <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm">
          {APPLICATIONS.filter((c) => TOP_APPLICATION_IDS.includes(c.id)).map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <Av name={c.company} size="xs" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{c.company}</p>
                <p className="text-xs text-muted-foreground" style={mono}>{c.score}% match</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="space-y-1">
          {COPILOT_QUICK_ACTIONS.map((a) => (
            <button key={a} type="button" className="w-full text-left text-sm font-semibold text-muted-foreground hover:text-foreground flex items-center gap-2 py-2.5 px-3 rounded-xl hover:bg-secondary transition-colors min-h-10">
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
              {a}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Workflow</p>
        <div className="space-y-2">
          {COPILOT_WORKFLOWS.map((w) => (
            <div key={w.n} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-semibold">{w.n}</span>
              <ToggleSwitch on={w.on} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
