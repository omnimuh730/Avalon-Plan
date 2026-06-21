import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, Save, Sparkles, Star } from "lucide-react";
import { useApplier } from "@/context/applier-context";
import { Badge, KPI, Score } from "../../../components/ui";
import { AthensTextarea, FormField } from "../../../components/forms";
import { analyzeResumeMatch, fetchUserResumes } from "../../../services/resumeApi";
import type { ResumeAnalysisResult, UserResumeSummary } from "../../../types/resume";
import { useResumeStacks } from "../hooks/useResumeStacks";
import { ResumeRadarChart } from "./analysis/ResumeRadarChart";

export function ResumeAnalysisTab() {
  const { applier, applierReady } = useApplier();
  const stacks = useResumeStacks();
  const [uploaded, setUploaded] = useState<UserResumeSummary[]>([]);
  const [jd, setJd] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ResumeAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!applier?.name) return;
    void fetchUserResumes(applier.name).then(setUploaded).catch(() => setUploaded([]));
  }, [applier?.name]);

  const featuredSkills = useMemo(() => {
    if (!stacks.featuredStack || !stacks.catalog[stacks.featuredStack]) return [];
    return Object.entries(stacks.catalog[stacks.featuredStack]).map(([skill, score]) => ({
      dim: skill,
      primary: score * 10,
    }));
  }, [stacks.catalog, stacks.featuredStack]);

  const runAnalysis = useCallback(async () => {
    if (!applier?.name || !jd.trim()) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await analyzeResumeMatch(applier.name, jd.trim());
      setAnalysis(result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [applier?.name, jd]);

  const handleSaveStacks = async () => {
    const ok = await stacks.save();
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  if (!applierReady || stacks.loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading analysis…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Stacks" value={String(stacks.stats.stackCount)} icon={BarChart3} accent="violet" />
        <KPI label="Skills" value={String(stacks.stats.skillEntries)} icon={Sparkles} accent="blue" />
        <KPI label="Uploaded" value={String(uploaded.length)} icon={Star} accent="emerald" />
        <KPI label="Avg skills/stack" value={String(stacks.stats.avgSkillsPerStack)} icon={BarChart3} accent="amber" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Resume stack catalog</h3>
            <button type="button" onClick={() => void handleSaveStacks()} disabled={stacks.saving || !stacks.valid} className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />
              {stacks.saving ? "Saving…" : saved ? "Saved" : "Save to MongoDB"}
            </button>
          </div>
          <p className="text-sm text-muted-foreground">Skill profiles per stack variant — stored on your account in MongoDB.</p>
          <AthensTextarea
            value={stacks.jsonText}
            onChange={(e) => stacks.setJsonText(e.target.value)}
            onBlur={() => stacks.validate()}
            rows={12}
            className="font-mono text-xs"
          />
          {stacks.error && <p className="text-sm text-destructive">{stacks.error}</p>}
          {stacks.updatedAt && <p className="text-xs text-muted-foreground">Last saved: {new Date(stacks.updatedAt).toLocaleString()}</p>}
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <h3 className="text-base font-bold text-foreground mb-4">Stack radar</h3>
          {featuredSkills.length ? (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {stacks.stackNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => stacks.setFeaturedStack(name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${stacks.featuredStack === name ? "bg-primary text-white border-primary" : "border-border text-muted-foreground"}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <ResumeRadarChart data={featuredSkills} series={[{ key: "primary", label: stacks.featuredStack ?? "Stack", color: "#6c5ce7" }]} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Add a valid stack catalog JSON to see radar charts.</p>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-foreground">Job description match</h3>
        <FormField label="Paste job description">
          <AthensTextarea value={jd} onChange={(e) => setJd(e.target.value)} rows={6} placeholder="Paste a JD to rank your stacks and uploaded resumes…" />
        </FormField>
        <button
          type="button"
          onClick={() => void runAnalysis()}
          disabled={analyzing || !jd.trim()}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
        >
          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Analyze match
        </button>
        {analysisError && <p className="text-sm text-destructive">{analysisError}</p>}

        {analysis && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-border">
            <div>
              <h4 className="text-sm font-bold mb-3">Ranked stacks</h4>
              <div className="space-y-2">
                {analysis.rankedStacks.map((r) => (
                  <div key={r.name} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <span className="text-sm font-semibold">{r.name}</span>
                    <Score score={Math.round(r.score * 100)} />
                  </div>
                ))}
                {!analysis.rankedStacks.length && <p className="text-sm text-muted-foreground">No stacks in catalog.</p>}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-bold mb-3">Ranked uploaded resumes</h4>
              <div className="space-y-2">
                {analysis.rankedUploads.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{r.fileName}</p>
                      <Badge v="blue">{r.techStack}</Badge>
                    </div>
                    <Score score={Math.round(r.score * 100)} />
                  </div>
                ))}
                {!analysis.rankedUploads.length && <p className="text-sm text-muted-foreground">No uploaded resumes.</p>}
              </div>
            </div>
            {analysis.skillProfileText && (
              <div className="lg:col-span-2">
                <h4 className="text-sm font-bold mb-2">JD skill profile</h4>
                <pre className="text-xs bg-secondary/50 p-4 rounded-xl overflow-x-auto whitespace-pre-wrap font-mono">{analysis.skillProfileText}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
