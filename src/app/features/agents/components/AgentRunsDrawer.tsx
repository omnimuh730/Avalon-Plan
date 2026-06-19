import { formatDistanceToNow } from "date-fns";
import { X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { mono } from "../../../lib/utils";
import type { AgentRunLog } from "../../../types";

const MOCK_LOGS: AgentRunLog[] = [
  { id: "r1", timestamp: new Date(Date.now() - 120000).toISOString(), stepLabel: "Scan Boards", message: "Queried 847 listings from LinkedIn and Indeed" },
  { id: "r2", timestamp: new Date(Date.now() - 90000).toISOString(), stepLabel: "Parse JDs", message: "Extracted requirements from 312 job descriptions", output: '{"parsed": 312}' },
  { id: "r3", timestamp: new Date(Date.now() - 45000).toISOString(), stepLabel: "Match Profile", message: "Compared resume stack against JD requirements", output: '{"matches": 94}' },
  { id: "r4", timestamp: new Date().toISOString(), stepLabel: "Rank Results", message: "Scoring and prioritizing top matches…" },
];

type AgentRunsDrawerProps = {
  open: boolean;
  onClose: () => void;
  agentName: string;
  logs?: AgentRunLog[];
};

export function AgentRunsDrawer({ open, onClose, agentName, logs = MOCK_LOGS }: AgentRunsDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l border-border shadow-xl flex flex-col h-full animate-in slide-in-from-right">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-base font-bold text-foreground">Run logs</h3>
            <p className="text-xs text-muted-foreground">{agentName}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-btn text-muted-foreground hover:text-foreground w-9 h-9">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 subtle-scroll">
          {logs.map((log) => (
            <div key={log.id} className="bg-secondary/40 border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-foreground">{log.stepLabel}</span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{log.message}</p>
              {log.output && (
                <pre className="mt-2 text-[10px] bg-card border border-border rounded-lg p-2 overflow-x-auto" style={mono}>
                  {log.output}
                </pre>
              )}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-border">
          <Button variant="outline" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
