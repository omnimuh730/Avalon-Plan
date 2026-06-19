import { formatDistanceToNow } from "date-fns";
import { CheckCircle, Clock, Coins, Hash } from "lucide-react";
import { KPI, Pill, Badge } from "../../../components/ui";
import { SearchField } from "../../../components/shared/SearchField";
import { cn } from "../../../lib/utils";
import { useResumeHistory } from "../hooks/useResumeHistory";
import { ResumePreview } from "./preview/ResumePreview";
import { BUILTIN_TEMPLATES } from "../../../data/resumes/seedDocument";

export function ResumeHistoryTab() {
  const history = useResumeHistory();
  const { stats, filtered, selected, filters, setFilters, setSelectedId, models, providers, templates } = history;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Completed" value={String(stats.completed)} icon={CheckCircle} accent="emerald" />
        <KPI label="Total tokens" value={stats.totalTokens.toLocaleString()} icon={Hash} accent="violet" />
        <KPI label="Total spend" value={`$${stats.totalSpend.toFixed(4)}`} icon={Coins} accent="blue" />
        <KPI label="In view" value={String(stats.inView)} icon={Clock} accent="amber" />
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm">
        <SearchField
          value={filters.search}
          onChange={(search) => setFilters({ ...filters, search })}
          placeholder="Search job descriptions and resume content…"
          className="max-w-xl"
        />
        <div className="flex flex-wrap gap-2 items-center">
          {(["all", "jd", "resume"] as const).map((t) => (
            <Pill key={t} active={filters.searchTarget === t} onClick={() => setFilters({ ...filters, searchTarget: t })}>
              {t === "all" ? "All" : t.toUpperCase()}
            </Pill>
          ))}
          <div className="w-px h-6 bg-border mx-1" />
          {(["all", "completed", "failed"] as const).map((st) => (
            <Pill key={st} active={filters.status === st} onClick={() => setFilters({ ...filters, status: st })}>
              {st === "all" ? "All runs" : st.charAt(0).toUpperCase() + st.slice(1)}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <FilterSelect label="Model" value={filters.model} onChange={(model) => setFilters({ ...filters, model })} options={["all", ...models]} />
          <FilterSelect label="Provider" value={filters.provider} onChange={(provider) => setFilters({ ...filters, provider })} options={["all", ...providers]} />
          <FilterSelect label="Template" value={filters.templateId} onChange={(templateId) => setFilters({ ...filters, templateId })} options={["all", ...templates]} />
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Sort</label>
            <select
              value={filters.sort}
              onChange={(e) => setFilters({ ...filters, sort: e.target.value as "newest" | "oldest" })}
              className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm min-h-10"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 min-h-[480px]">
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-y-auto max-h-[560px] subtle-scroll">
            {filtered.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No generation runs yet. Use the Editor to generate a tailored resume.</p>
            ) : (
              filtered.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedId(run.id)}
                  className={cn(
                    "w-full text-left p-4 border-b border-border hover:bg-secondary/50 transition-colors",
                    selected?.id === run.id && "bg-primary/5 border-l-2 border-l-primary"
                  )}
                >
                  <p className="text-sm font-bold text-foreground truncate">
                    {run.jobTitle ?? "Untitled role"}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{run.jobDescription}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge v="subtle">{run.model}</Badge>
                    <Badge v="subtle">{run.provider}</Badge>
                    <Badge v="blue">{BUILTIN_TEMPLATES.find((t) => t.id === run.templateId)?.name ?? run.templateId}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}</span>
                    <span>{run.tokens.toLocaleString()} tok</span>
                    <span>${run.costUsd.toFixed(4)}</span>
                    <Badge v={run.status === "completed" ? "success" : run.status === "failed" ? "err" : "warn"}>{run.status}</Badge>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm flex flex-col">
          {selected ? (
            <>
              <div className="p-4 border-b border-border space-y-2 flex-shrink-0">
                <h3 className="text-base font-bold text-foreground">{selected.jobTitle ?? "Generation run"}</h3>
                <p className="text-xs text-muted-foreground line-clamp-3">{selected.jobDescription}</p>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{selected.tokens.toLocaleString()} tokens</span>
                  <span>${selected.costUsd.toFixed(4)}</span>
                  <span>{selected.model} · {selected.provider}</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 subtle-scroll flex justify-center bg-secondary/20">
                <div className="origin-top scale-[0.55] sm:scale-[0.65]">
                  <ResumePreview
                    document={selected.document}
                    template={BUILTIN_TEMPLATES.find((t) => t.id === selected.templateId) ?? BUILTIN_TEMPLATES[0]}
                    theme={{
                      font: "Source Sans 3",
                      bodySizePt: 10.5,
                      nameSizePt: 24,
                      accentColor: "#1f3a5f",
                      textColor: "#0f172a",
                      headerAlign: "center",
                      paperSize: "letter",
                      marginIn: 0.65,
                    }}
                    sections={[
                      { id: "summary", titleSizePt: 12, bodySizePt: 10.5, color: "#0f172a", order: 0 },
                      { id: "experience", titleSizePt: 12, bodySizePt: 10.5, color: "#0f172a", order: 1 },
                      { id: "skills", titleSizePt: 12, bodySizePt: 10.5, color: "#0f172a", order: 2 },
                      { id: "education", titleSizePt: 12, bodySizePt: 10.5, color: "#0f172a", order: 3 },
                    ]}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground">
              <p className="text-sm">Select a run from the list to preview the resume, JD, and usage.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm min-h-10"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o === "all" ? "All" : o}</option>
        ))}
      </select>
    </div>
  );
}
