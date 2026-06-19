import { Bot, FileText, MessageSquare, Search } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { AgentTemplate } from "../../../types";

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "tpl-scout",
    name: "Job Scout",
    description: "Scan boards, parse JDs, match your profile, and notify on top fits.",
    model: "Claude 3.5",
    nodes: [
      { id: "n1", label: "Scan Boards", description: "Query job boards", status: "draft", x: 80, y: 120, type: "scan" },
      { id: "n2", label: "Parse JDs", description: "Extract requirements", status: "draft", x: 300, y: 80, type: "parse" },
      { id: "n3", label: "Match Profile", description: "Compare resume", status: "draft", x: 520, y: 120, type: "match" },
      { id: "n4", label: "Notify You", description: "Push matches", status: "draft", x: 740, y: 80, type: "notify" },
    ],
    edges: [
      { from: "n1", to: "n2", label: "Scan", color: "#6c5ce7" },
      { from: "n2", to: "n3", label: "Parse", color: "#2dd4bf" },
      { from: "n3", to: "n4", label: "Match", color: "#f59e0b" },
    ],
  },
  {
    id: "tpl-tailor",
    name: "Resume Tailor",
    description: "Parse resume, gap-analyze against JD, rewrite bullets, export PDF.",
    model: "Claude 3.5",
    nodes: [
      { id: "n1", label: "Parse Resume", description: "Extract data", status: "draft", x: 80, y: 100, type: "parse" },
      { id: "n2", label: "Compare to JD", description: "Gap analysis", status: "draft", x: 300, y: 140, type: "match" },
      { id: "n3", label: "Tailor Content", description: "Rewrite bullets", status: "draft", x: 520, y: 100, type: "rank" },
      { id: "n4", label: "Export PDF", description: "Generate resume", status: "draft", x: 740, y: 140, type: "notify" },
    ],
    edges: [
      { from: "n1", to: "n2", label: "Parse", color: "#6c5ce7" },
      { from: "n2", to: "n3", label: "Analyze", color: "#2dd4bf" },
      { from: "n3", to: "n4", label: "Export", color: "#f472b6" },
    ],
  },
  {
    id: "tpl-prep",
    name: "Interview Prep Bot",
    description: "Research company, generate questions, run mock session, feedback report.",
    model: "GPT-4o",
    nodes: [
      { id: "n1", label: "Research", description: "Company intel", status: "draft", x: 80, y: 120, type: "scan" },
      { id: "n2", label: "Generate Qs", description: "Question bank", status: "draft", x: 300, y: 80, type: "parse" },
      { id: "n3", label: "Mock Session", description: "Simulated interview", status: "draft", x: 520, y: 120, type: "match" },
      { id: "n4", label: "Feedback", description: "Performance report", status: "draft", x: 740, y: 80, type: "rank" },
    ],
    edges: [
      { from: "n1", to: "n2", label: "Research", color: "#6c5ce7" },
      { from: "n2", to: "n3", label: "Practice", color: "#2dd4bf" },
      { from: "n3", to: "n4", label: "Review", color: "#f59e0b" },
    ],
  },
];

const ICONS = [Search, FileText, MessageSquare];

type AgentTemplatesGalleryProps = {
  onSelect: (template: AgentTemplate) => void;
};

export function AgentTemplatesGallery({ onSelect }: AgentTemplatesGalleryProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Start from template</h3>
        <span className="text-xs text-muted-foreground">{AGENT_TEMPLATES.length} workflows</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {AGENT_TEMPLATES.map((tpl, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(tpl)}
              className="text-left bg-card border border-border rounded-xl p-4 hover:shadow-md hover:border-primary/30 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/15">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-bold text-foreground">{tpl.name}</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tpl.description}</p>
              <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                <Bot className="w-3 h-3" />
                {tpl.model} · {tpl.nodes.length} steps
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
