import React from "react";
import { Activity } from "lucide-react";
import { activityIcon, logStyle } from "../lib/status-styles";
import { mono } from "../lib/constants";
import type { ActivityEntry } from "../../../types/agent";

function ActivityFeedItem({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="flex gap-3 px-5 py-3 hover:bg-secondary/40 transition-colors">
      {activityIcon(entry.type)}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`${mono} text-xs text-muted-foreground`}>{entry.time}</span>
          <span className="text-xs font-semibold text-primary/80">{entry.agentName}</span>
        </div>
        <p className={`text-xs mt-0.5 leading-snug ${logStyle(entry.type)}`}>{entry.event}</p>
      </div>
    </div>
  );
}

export function AgentActivityFeed({ log }: { log: ActivityEntry[] }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col" style={{ maxHeight: 420 }}>
      <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <Activity size={15} className="text-violet-600" />
          Live Feed
        </h4>
        <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
      </div>
      <div className="overflow-y-auto flex-1 divide-y divide-border/60">
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground px-5 py-8 text-center">No activity yet</p>
        ) : (
          log.map((entry) => <ActivityFeedItem key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
