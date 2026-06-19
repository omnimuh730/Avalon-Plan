import { Search, FileText, Target, Bell, Sparkles } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { PipelineNodeType } from "../../../types";

const PALETTE: { type: PipelineNodeType; label: string; icon: React.ElementType; color: string }[] = [
  { type: "scan", label: "Scan", icon: Search, color: "bg-violet-500/10 text-violet-700" },
  { type: "parse", label: "Parse", icon: FileText, color: "bg-blue-500/10 text-blue-700" },
  { type: "match", label: "Match", icon: Target, color: "bg-emerald-500/10 text-emerald-700" },
  { type: "rank", label: "Rank", icon: Sparkles, color: "bg-amber-500/10 text-amber-700" },
  { type: "notify", label: "Notify", icon: Bell, color: "bg-pink-500/10 text-pink-700" },
];

export function AgentNodePalette({ className }: { className?: string }) {
  return (
    <aside className={cn("w-48 border-r border-border bg-card p-3 space-y-2 flex-shrink-0", className)}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 mb-2">
        Add step
      </p>
      {PALETTE.map((item) => (
        <div
          key={item.type}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/agent-node-type", item.type);
            e.dataTransfer.effectAllowed = "move";
          }}
          className={cn(
            "flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border cursor-grab active:cursor-grabbing hover:shadow-sm transition-all text-sm font-semibold",
            item.color,
          )}
        >
          <item.icon className="w-4 h-4 shrink-0" />
          {item.label}
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground px-1 pt-2">Drag onto canvas or click a node to edit</p>
    </aside>
  );
}
