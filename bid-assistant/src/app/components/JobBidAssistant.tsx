import { useState, type ComponentType, type ReactNode } from 'react';
import {
  AlertCircle,
  Briefcase,
  Camera,
  CheckCircle2,
  ChevronDown,
  Coins,
  FileText,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react';
import { useJobAnalysis, type AggregatedUsage } from '@/app/hooks/useJobAnalysis';
import type {
  BidFlagVerdicts,
  PageAnalysisResult,
  SkillAnalysisResult,
} from '@/lib/job-analysis';
import { mergeAnalysisTurns } from '@/lib/analysis-merge';
import { useActiveTab } from '@/app/hooks/useActiveTab';
import { useBidSession } from '@/app/hooks/useBidSession';
import { useBidShots } from '@/app/hooks/useBidShots';
import { useCompletedCounter } from '@/app/hooks/useCompletedCounter';
import type { BidShot } from '@/lib/bid-session';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

const PANEL = 'rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden min-w-0';
const PANEL_HEADER =
  'flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-gradient-to-r from-violet-500/5 to-transparent';

function Section({
  title,
  icon: Icon,
  children,
  collapsible = false,
  defaultCollapsed = false,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const open = !collapsible || !collapsed;

  const header = (
    <>
      <Icon className="w-3.5 h-3.5 text-violet-500 shrink-0" />
      <h3 className="text-xs font-bold text-foreground flex-1 text-left truncate">{title}</h3>
      {collapsible && (
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${open ? '' : '-rotate-90'}`}
        />
      )}
    </>
  );

  return (
    <section className={PANEL}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="w-full flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors"
          aria-expanded={open}
        >
          {header}
        </button>
      ) : (
        <div className={`${PANEL_HEADER} border-b border-border/60`}>{header}</div>
      )}
      {open && <div className="p-2.5 text-xs text-muted-foreground leading-relaxed">{children}</div>}
    </section>
  );
}

function confidenceClass(confidence: string) {
  switch (confidence) {
    case 'high':
      return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    case 'low':
      return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    case 'medium':
    default:
      return 'text-violet-400 border-violet-500/30 bg-violet-500/10';
  }
}

function formatTokens(value: number) {
  return value.toLocaleString();
}

function formatCost(cost: number | null) {
  if (cost === null) return 'n/a';
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  return `$${cost.toFixed(4)}`;
}

function UsagePanel({
  usage,
  title = 'Token usage & cost',
}: {
  usage: AggregatedUsage;
  title?: string;
}) {
  const cachedPercent =
    usage.inputTokens > 0 ? Math.round((usage.cachedTokens / usage.inputTokens) * 100) : 0;

  const stats: { label: string; value: string; hint?: string }[] = [
    { label: 'Input', value: formatTokens(usage.inputTokens) },
    {
      label: 'Cached',
      value: formatTokens(usage.cachedTokens),
      hint: usage.inputTokens > 0 ? `${cachedPercent}% of input` : undefined,
    },
    { label: 'Output', value: formatTokens(usage.outputTokens) },
    { label: 'Total', value: formatTokens(usage.totalTokens) },
  ];

  return (
    <Section title={title} icon={Coins}>
      <div className="grid grid-cols-2 gap-1.5">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5"
          >
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{stat.label}</div>
            <div className="text-sm font-semibold text-foreground">{stat.value}</div>
            {stat.hint && <div className="text-[10px] text-muted-foreground">{stat.hint}</div>}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg border border-violet-500/20 bg-violet-500/5 px-2.5 py-1.5">
        <span className="text-[10px] text-muted-foreground">
          Est. price{usage.model ? ` · ${usage.model}` : ''}
        </span>
        <span className="text-sm font-bold text-violet-400">{formatCost(usage.cost)}</span>
      </div>
      {usage.cachedTokens > 0 && (
        <p className="mt-1.5 text-[10px] text-emerald-400">
          Cache hit — {formatTokens(usage.cachedTokens)} tokens at discounted rate
          {usage.savings && usage.savings > 0 ? ` (saved ~${formatCost(usage.savings)})` : ''}.
        </p>
      )}
    </Section>
  );
}

function shotLabel(shot: BidShot): string {
  switch (shot.type) {
    case 'session-start':
      return 'Session start';
    case 'session-complete':
      return 'Completed';
    case 'process':
      return shot.triggerText ? `Click: ${shot.triggerText}` : 'Process step';
    default: {
      const _exhaustive: never = shot.type;
      return _exhaustive;
    }
  }
}

function RecordingGallery({ shots }: { shots: BidShot[] }) {
  if (shots.length === 0) return null;

  return (
    <Section title={`Recording (${shots.length})`} icon={Camera}>
      <div className="grid grid-cols-2 gap-1.5">
        {shots.map((shot, index) => (
          <figure
            key={`${shot.at}-${index}`}
            className="rounded-lg border border-border/60 bg-muted/20 overflow-hidden"
          >
            {shot.screenshot ? (
              <a href={shot.screenshot} target="_blank" rel="noreferrer" title="Open full size">
                <img
                  src={shot.screenshot}
                  alt={shotLabel(shot)}
                  loading="lazy"
                  className="w-full h-20 object-cover object-top hover:opacity-90 transition-opacity"
                />
              </a>
            ) : (
              <div className="w-full h-20 flex items-center justify-center text-[10px] text-muted-foreground">
                No capture
              </div>
            )}
            <figcaption
              className="px-1.5 py-0.5 text-[10px] text-muted-foreground truncate"
              title={shotLabel(shot)}
            >
              {shotLabel(shot)}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

function AnalysisResult({
  pageTitle,
  pageUrl,
  page,
  skills,
  sections = { summary: true, skills: true, resume: true, forms: true },
}: {
  pageTitle: string | null;
  pageUrl: string | null;
  page: PageAnalysisResult | null;
  skills: SkillAnalysisResult | null;
  sections?: {
    summary: boolean;
    skills: boolean;
    resume: boolean;
    forms: boolean;
  };
}) {
  const recommendedResume = skills?.bestResume ?? skills?.topResumes?.[0] ?? null;
  const formAnswers = page?.formAnswers ?? [];

  return (
    <div className="space-y-2">
      {(pageTitle || pageUrl) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {page && (
            <Badge
              variant="outline"
              className={
                page.isJobPage
                  ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px]'
                  : 'border-amber-500/30 text-amber-400 bg-amber-500/10 text-[10px]'
              }
            >
              {page.isJobPage ? 'Job page' : 'Not a job page'}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground truncate min-w-0" title={pageUrl ?? undefined}>
            {pageTitle || pageUrl}
          </span>
        </div>
      )}

      {sections.summary && page?.summary && (
        <Section title="Summary" icon={FileText} collapsible defaultCollapsed>
          <p className="whitespace-pre-wrap text-foreground">{page.summary}</p>
          {!page.isJobPage && page.notJobPageReason && (
            <p className="mt-1.5 text-muted-foreground">{page.notJobPageReason}</p>
          )}
        </Section>
      )}

      {sections.skills && skills?.skillProfile && (
        <Section title="Required skills" icon={Target} collapsible defaultCollapsed>
          <pre className="text-[10px] leading-relaxed whitespace-pre-wrap font-mono text-foreground overflow-x-auto">
            {skills.skillProfile}
          </pre>
        </Section>
      )}

      {sections.resume &&
        (recommendedResume ? (
          <Section title="Recommended resume" icon={Briefcase}>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground truncate">{recommendedResume.name}</span>
                <Badge variant="outline" className="border-violet-500/30 text-violet-400 text-[10px] shrink-0">
                  {recommendedResume.scorePercent}%
                </Badge>
              </div>
              {(skills?.topResumes?.length ?? 0) > 1 && (
                <ul className="text-[10px] text-muted-foreground space-y-0.5 pt-0.5">
                  {skills!.topResumes.slice(1).map((resume) => (
                    <li key={resume.name}>
                      {resume.name} — {resume.scorePercent}%
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        ) : skills?.skillProfile ? (
          <Section title="Recommended resume" icon={Briefcase}>
            <p className="text-muted-foreground">
              Could not rank resumes. Re-run Analyze on the job overview page.
            </p>
          </Section>
        ) : null)}

      {sections.forms && formAnswers.length > 0 && (
        <Section title="Form answers" icon={Sparkles}>
          <ul className="space-y-2">
            {formAnswers.map((answer, index) => (
              <li key={`${answer.question}-${index}`} className="space-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground text-[11px]">{answer.question}</p>
                  <Badge variant="outline" className={`${confidenceClass(answer.confidence)} text-[10px] shrink-0`}>
                    {answer.confidence}
                  </Badge>
                </div>
                <p className="text-muted-foreground whitespace-pre-wrap">{answer.suggestedAnswer}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

type LightStatus = 'green' | 'red' | 'unknown';

function TrafficLight({ label, status }: { label: string; status: LightStatus }) {
  const dot =
    status === 'green'
      ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
      : status === 'red'
        ? 'bg-red-500 animate-pulse'
        : 'bg-muted-foreground/40';
  const text =
    status === 'green'
      ? 'text-emerald-400'
      : status === 'red'
        ? 'text-red-400'
        : 'text-muted-foreground';
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-muted/20 px-1.5 py-1.5 min-w-0">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className={`text-[10px] font-semibold text-center leading-tight ${text}`}>{label}</span>
    </div>
  );
}

function TrafficLights({ jdAnalyzed, flags }: { jdAnalyzed: boolean; flags: BidFlagVerdicts }) {
  const remoteStatus: LightStatus = flags.remote ? flags.remote.status : 'unknown';
  const clearanceStatus: LightStatus = flags.clearance ? flags.clearance.status : 'unknown';
  const reasons = [
    flags.remote?.status === 'red' ? { label: 'Remote', text: flags.remote.explanation } : null,
    flags.clearance?.status === 'red'
      ? { label: 'Clearance', text: flags.clearance.explanation }
      : null,
  ].filter((entry): entry is { label: string; text: string } => Boolean(entry?.text));

  return (
    <div className={PANEL}>
      <div className={PANEL_HEADER}>
        <Target className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Screening</span>
      </div>
      <div className="p-2">
        <div className="grid grid-cols-3 gap-1.5">
          <TrafficLight label="JD" status={jdAnalyzed ? 'green' : 'unknown'} />
          <TrafficLight label="Remote" status={remoteStatus} />
          <TrafficLight label="No clearance" status={clearanceStatus} />
        </div>
        {reasons.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {reasons.map((reason) => (
              <li key={reason.label} className="text-[10px] text-red-300 leading-snug">
                <span className="font-semibold">{reason.label}:</span> {reason.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SessionStatus({
  sessionActive,
  sessionCompleted,
}: {
  sessionActive: boolean;
  sessionCompleted: boolean;
}) {
  if (sessionActive) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        <span className="truncate">Recording Apply / Submit / Next clicks</span>
      </span>
    );
  }
  if (sessionCompleted) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-violet-400 min-w-0">
        <CheckCircle2 className="w-3 h-3 shrink-0" />
        <span className="truncate">Session done — start new to bid again</span>
      </span>
    );
  }
  return (
    <span className="text-[11px] text-muted-foreground truncate">
      No session — start new to enable Analyze
    </span>
  );
}

export function JobBidAssistant() {
  const tabId = useActiveTab();
  const { loading, status, error, turns, current, totalUsage, flags, jdAnalyzed, analyze } =
    useJobAnalysis(tabId);
  const {
    session,
    busy: sessionBusy,
    error: sessionError,
    start: startSession,
    complete: completeSession,
  } = useBidSession(tabId);
  const shots = useBidShots(tabId);
  const { count: completedCount, increment: incrementCompleted, reset: resetCompleted } =
    useCompletedCounter();

  const sessionActive = session.status === 'active';
  const sessionCompleted = session.status === 'completed';

  const merged = mergeAnalysisTurns(turns, loading ? current : null);
  const hasAnalysis = Boolean(merged.page || merged.skills || merged.formAnswers.length > 0);

  const handleComplete = async () => {
    const ok = await completeSession();
    if (ok) incrementCompleted();
  };

  return (
    <div className="flex flex-col h-full min-w-0 bg-background text-foreground">
      {/* Header */}
      <div className={`${PANEL_HEADER} shrink-0 border-b border-border/60`}>
        <Briefcase className="w-4 h-4 text-violet-500 shrink-0" />
        <h1 className="text-sm font-bold flex-1 truncate">Job Bid Assistant</h1>
      </div>

      {/* Action buttons — 2-col grid prevents overflow */}
      <div className="shrink-0 grid grid-cols-2 gap-1.5 px-3 py-2 border-b border-border/60 bg-card">
        <Button
          size="sm"
          variant="outline"
          className="w-full min-w-0 h-8 text-xs"
          onClick={() => void startSession()}
          disabled={sessionBusy || loading || tabId == null}
        >
          {sessionBusy && !sessionActive ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          New Session
        </Button>
        <Button
          size="sm"
          className="w-full min-w-0 h-8 text-xs"
          onClick={analyze}
          disabled={loading || !sessionActive}
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              Analyze
            </>
          )}
        </Button>
      </div>

      {/* Status strip */}
      <div className="shrink-0 px-3 py-1.5 border-b border-border/60 bg-muted/20 space-y-1">
        <SessionStatus sessionActive={sessionActive} sessionCompleted={sessionCompleted} />
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            Today: <span className="font-bold text-foreground">{completedCount}</span>
          </span>
          <button
            type="button"
            onClick={resetCompleted}
            disabled={completedCount === 0}
            title="Reset today's counter"
            className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-card px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto subtle-scroll p-2 space-y-2">
        <p className="text-[11px] text-muted-foreground leading-relaxed px-0.5">
          Open a job page → <strong className="text-foreground font-semibold">New Session</strong> →{' '}
          <strong className="text-foreground font-semibold">Analyze</strong> → fill the form →{' '}
          <strong className="text-foreground font-semibold">Mark Completed</strong>.
        </p>

        {sessionError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-300">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{sessionError}</span>
          </div>
        )}

        {(sessionActive || sessionCompleted || jdAnalyzed) && (
          <TrafficLights jdAnalyzed={jdAnalyzed} flags={flags} />
        )}

        <RecordingGallery shots={shots} />

        {loading && status && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2 text-[11px] text-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500 shrink-0" />
            <span className="truncate">{status}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-300">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {totalUsage && (
          <UsagePanel usage={totalUsage} title="Session usage & cost" />
        )}

        {(loading || hasAnalysis) && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">
                {loading ? 'Analyzing…' : 'Analysis'}
              </div>
              {merged.updates.length > 1 && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {merged.updates.length} pages
                </span>
              )}
            </div>
            <AnalysisResult
              pageTitle={merged.pageTitle}
              pageUrl={merged.pageUrl}
              page={merged.page}
              skills={merged.skills}
            />
          </div>
        )}

        {merged.updates.length > 1 && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-0.5">
              Page updates
            </div>
            <ul className="space-y-0.5">
              {[...merged.updates].reverse().map((update, index) => {
                const labels: string[] = [];
                if (update.sections.forms && update.newFormCount > 0) {
                  labels.push(`+${update.newFormCount} forms`);
                }
                if (update.sections.summary) labels.push('summary');
                if (update.sections.skills) labels.push('skills');
                if (update.sections.resume) labels.push('resume');
                if (labels.length === 0) labels.push('cached');

                return (
                  <li
                    key={update.id}
                    className="text-[10px] text-muted-foreground flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-muted/20 border border-border/60"
                  >
                    <span className="truncate min-w-0">
                      #{merged.updates.length - index} · {update.pageTitle || update.pageUrl || 'Page'}
                    </span>
                    <span className="shrink-0 text-muted-foreground/70">{labels.join(', ')}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="shrink-0 px-3 py-2 border-t border-border/60 bg-card">
        <Button
          className="w-full h-9 text-xs font-bold"
          variant={sessionCompleted ? 'secondary' : 'default'}
          onClick={() => void handleComplete()}
          disabled={!sessionActive || sessionBusy || loading}
        >
          {sessionBusy && sessionActive ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              {sessionCompleted ? 'Completed' : 'Mark as Completed'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
