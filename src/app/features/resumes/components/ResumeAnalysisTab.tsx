import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, GitCompare, Sparkles, Star } from "lucide-react";
import { Badge, KPI, Score } from "../../../components/ui";
import { cn } from "../../../lib/utils";
import { onCatalogChange, resumeCatalog } from "../../../services/resumeCatalog";
import { useResumeStacks } from "../hooks/useResumeStacks";
import {
  computeCompetencyRadar,
  computeResumeStats,
  computeStackCoverage,
  mergeRadarSeries,
} from "../lib/resumeAnalysis";
import { ResumeRadarChart } from "./analysis/ResumeRadarChart";
import type { ResumeDocument, ResumeSummary } from "../../../types/resume";

const SERIES_PRIMARY = { key: "primary", label: "Selected", color: "#6c5ce7" };
const SERIES_COMPARE = { key: "compare", label: "Compare", color: "#2dd4bf" };

type ResumeAnalysisTabProps = {
  initialResumeId?: string;
};

export function ResumeAnalysisTab({ initialResumeId }: ResumeAnalysisTabProps) {
  const stacks = useResumeStacks();
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialResumeId ?? null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, ResumeDocument>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await resumeCatalog.listResumes();
    setResumes(list);
    if (!selectedId && list.length) {
      setSelectedId(initialResumeId ?? list.find((r) => r.isPrimary)?.id ?? list[0].id);
    }
    setLoading(false);
  }, [selectedId, initialResumeId]);

  useEffect(() => {
    void refresh();
    return onCatalogChange(refresh);
  }, [refresh]);

  useEffect(() => {
    if (initialResumeId) setSelectedId(initialResumeId);
  }, [initialResumeId]);

  const loadDoc = useCallback(async (id: string) => {
    let cached: ResumeDocument | undefined;
    setDocs((prev) => {
      cached = prev[id];
      return prev;
    });
    if (cached) return cached;

    const doc = await resumeCatalog.getDocument(id);
    if (doc) {
      setDocs((prev) => (prev[id] ? prev : { ...prev, [id]: doc }));
      return doc;
    }
    return null;
  }, []);

  useEffect(() => {
    const ids = [selectedId, compareId].filter(Boolean) as string[];
    ids.forEach((id) => void loadDoc(id));
  }, [selectedId, compareId, loadDoc]);

  const selectedSummary = resumes.find((r) => r.id === selectedId);
  const compareSummary = resumes.find((r) => r.id === compareId);
  const selectedDoc = selectedId ? docs[selectedId] : null;
  const compareDoc = compareId ? docs[compareId] : null;

  const competencyData = useMemo(() => {
    if (!selectedDoc) return [];
    const primary = computeCompetencyRadar(selectedDoc);
    const compare = compareDoc ? computeCompetencyRadar(compareDoc) : undefined;
    return mergeRadarSeries(primary, compare).map((p) => ({
      dim: p.dim,
      primary: p.primary,
      ...(compare ? { compare: p.compare ?? 0 } : {}),
    }));
  }, [selectedDoc, compareDoc]);

  const stackCoverageData = useMemo(() => {
    if (!selectedDoc || !stacks.valid) return [];
    const primary = computeStackCoverage(selectedDoc, stacks.catalog);
    const compare = compareDoc ? computeStackCoverage(compareDoc, stacks.catalog) : undefined;
    return mergeRadarSeries(primary, compare).map((p) => ({
      dim: p.dim,
      primary: p.primary,
      ...(compare ? { compare: p.compare ?? 0 } : {}),
    }));
  }, [selectedDoc, compareDoc, stacks.catalog, stacks.valid]);

  const stats = selectedDoc ? computeResumeStats(selectedDoc) : null;
  const radarSeries = compareDoc ? [SERIES_PRIMARY, SERIES_COMPARE] : [SERIES_PRIMARY];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading resume analysis…
      </div>
    );
  }

  if (resumes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-4">
        <BarChart3 className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <p className="text-base font-bold text-foreground">No registered resumes</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Upload resumes in the Library tab to unlock radar analysis, stack coverage, and comparison views.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[520px]">
      <aside className="w-full lg:w-64 flex-shrink-0 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Registered resumes</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-2">Select a resume to analyze. Optionally pick a second to compare.</p>
        <div className="space-y-2 max-h-[420px] overflow-y-auto subtle-scroll pr-1">
          {resumes.map((r) => (
            <ResumePickerRow
              key={r.id}
              resume={r}
              selected={selectedId === r.id}
              comparing={compareId === r.id}
              onSelect={() => {
                setSelectedId(r.id);
                if (compareId === r.id) setCompareId(null);
              }}
              onCompare={() => {
                if (r.id === selectedId) return;
                setCompareId(compareId === r.id ? null : r.id);
              }}
            />
          ))}
        </div>
      </aside>

      <div className="flex-1 min-w-0 space-y-5">
        {selectedSummary && (
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-bold text-foreground">{selectedSummary.name}</h2>
            {selectedSummary.isPrimary && <Badge v="violet">Primary</Badge>}
            <Score score={selectedSummary.matchScore} />
            {compareSummary && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-2.5 py-1 rounded-full">
                <GitCompare className="w-3.5 h-3.5" />
                vs {compareSummary.name}
              </span>
            )}
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI label="Total skills" value={String(stats.totalSkills)} icon={BarChart3} accent="violet" />
            <KPI label="Strongest" value={stats.strongestCategory} icon={Sparkles} accent="blue" />
            <KPI label="Experience" value={`${stats.yearsExperience}y`} icon={Star} accent="emerald" />
            <KPI
              label="Education"
              value={String(stats.educationCount)}
              sub="entries"
              icon={BarChart3}
              accent="amber"
            />
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-foreground mb-1">Competency profile</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Breadth across languages, frameworks, infra, experience, and education
            </p>
            {!selectedDoc ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                Loading document…
              </div>
            ) : (
              <ResumeRadarChart data={competencyData} series={radarSeries} height={280} />
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-foreground mb-1">Stack coverage</h3>
            <p className="text-xs text-muted-foreground mb-4">
              How well this resume matches each skill stack in your catalog
            </p>
            {!stacks.valid || !stackCoverageData.length ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                Configure skill stacks in Setup to enable stack coverage analysis.
              </div>
            ) : (
              <ResumeRadarChart data={stackCoverageData} series={radarSeries} height={280} />
            )}
          </div>
        </div>

        {selectedDoc && (
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-foreground mb-4">Skill breakdown</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(
                [
                  ["Languages", selectedDoc.skills.languages],
                  ["Frameworks", selectedDoc.skills.frameworks],
                  ["Databases", selectedDoc.skills.databases],
                  ["Cloud / DevOps", selectedDoc.skills.cloudDevOps],
                ] as const
              ).map(([label, items]) => (
                <div key={label}>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.length ? (
                      items.map((skill) => (
                        <Badge key={skill} v="subtle">
                          {skill}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">None listed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResumePickerRow({
  resume,
  selected,
  comparing,
  onSelect,
  onCompare,
}: {
  resume: ResumeSummary;
  selected: boolean;
  comparing: boolean;
  onSelect: () => void;
  onCompare: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-all cursor-pointer",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : comparing
            ? "border-emerald-400/50 bg-emerald-50/50 dark:bg-emerald-950/20"
            : "border-border bg-card hover:border-primary/30 hover:shadow-sm",
      )}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-sm font-bold text-foreground truncate">{resume.name}</p>
          <span className="text-xs font-mono text-muted-foreground shrink-0">{resume.matchScore}</span>
        </div>
        <p className="text-xs text-muted-foreground">{resume.version} · {resume.updated}</p>
        {resume.isPrimary && (
          <Badge v="violet" className="mt-2">
            Primary
          </Badge>
        )}
      </button>
      {!selected && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCompare();
          }}
          className={cn(
            "mt-2 w-full text-xs font-semibold py-1.5 rounded-lg border transition-colors",
            comparing
              ? "bg-emerald-500/10 border-emerald-300 text-emerald-700"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary",
          )}
        >
          {comparing ? "Comparing ✓" : "Compare"}
        </button>
      )}
    </div>
  );
}
