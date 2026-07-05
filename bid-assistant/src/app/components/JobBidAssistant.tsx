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
      <Icon className="w-4 h-4 text-blue-400" />
      <h3 className="text-sm font-medium text-gray-200 flex-1 text-left">{title}</h3>
      {collapsible && (
        <ChevronDown
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      )}
    </>
  );

  return (
    <section className="rounded-lg border border-gray-800 bg-[#202020] overflow-hidden">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="w-full flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-[#242424] hover:bg-[#2a2a2a]"
          aria-expanded={open}
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-[#242424]">
          {header}
        </div>
      )}
      {open && <div className="p-3 text-sm text-gray-300">{children}</div>}
    </section>
  );
}

function confidenceClass(confidence: string) {
  switch (confidence) {
    case 'high':
      return 'text-green-400 border-green-900/50 bg-green-950/30';
    case 'low':
      return 'text-amber-400 border-amber-900/50 bg-amber-950/30';
    case 'medium':
    default:
      return 'text-blue-400 border-blue-900/50 bg-blue-950/30';
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
      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-gray-800 bg-[#1a1a1a] px-3 py-2">
            <div className="text-xs text-gray-500">{stat.label}</div>
            <div className="text-base font-medium text-gray-100">{stat.value}</div>
            {stat.hint && <div className="text-[11px] text-gray-500">{stat.hint}</div>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-md border border-blue-900/40 bg-blue-950/20 px-3 py-2">
        <span className="text-xs text-gray-400">
          Estimated price{usage.model ? ` · ${usage.model}` : ''}
        </span>
        <span className="text-base font-semibold text-blue-300">{formatCost(usage.cost)}</span>
      </div>
      {usage.cachedTokens > 0 && (
        <p className="mt-2 text-[11px] text-green-400">
          Prompt cache hit — {formatTokens(usage.cachedTokens)} input tokens billed at the discounted
          cached rate
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
    <Section title={`Session recording (${shots.length})`} icon={Camera}>
      <div className="grid grid-cols-2 gap-2">
        {shots.map((shot, index) => (
          <figure
            key={`${shot.at}-${index}`}
            className="rounded-md border border-gray-800 bg-[#1a1a1a] overflow-hidden"
          >
            {shot.screenshot ? (
              <a href={shot.screenshot} target="_blank" rel="noreferrer" title="Open full size">
                <img
                  src={shot.screenshot}
                  alt={shotLabel(shot)}
                  loading="lazy"
                  className="w-full h-24 object-cover object-top hover:opacity-90 transition-opacity"
                />
              </a>
            ) : (
              <div className="w-full h-24 flex items-center justify-center text-[11px] text-gray-600">
                No capture
              </div>
            )}
            <figcaption className="px-2 py-1 text-[11px] text-gray-400 truncate" title={shotLabel(shot)}>
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
    <div className="space-y-4">
      {(pageTitle || pageUrl) && (
        <div className="flex flex-wrap items-center gap-2">
          {page && (
            <Badge
              variant="outline"
              className={
                page.isJobPage
                  ? 'border-green-900/50 text-green-400 bg-green-950/20'
                  : 'border-amber-900/50 text-amber-400 bg-amber-950/20'
              }
            >
              {page.isJobPage ? 'Job page detected' : 'Not a job page'}
            </Badge>
          )}
          <span className="text-xs text-gray-500 truncate" title={pageUrl ?? undefined}>
            {pageTitle || pageUrl}
          </span>
        </div>
      )}

      {sections.summary && page?.summary && (
        <Section title="Summary" icon={FileText} collapsible defaultCollapsed>
          <p className="leading-relaxed whitespace-pre-wrap">{page.summary}</p>
          {!page.isJobPage && page.notJobPageReason && (
            <p className="mt-2 text-gray-500">{page.notJobPageReason}</p>
          )}
        </Section>
      )}

      {sections.skills && skills?.skillProfile && (
        <Section title="Required skills" icon={Target} collapsible defaultCollapsed>
          <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-gray-300 overflow-x-auto">
            {skills.skillProfile}
          </pre>
        </Section>
      )}

      {sections.resume &&
        (recommendedResume ? (
          <Section title="Recommended Resume" icon={Briefcase}>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-100">{recommendedResume.name}</span>
                <Badge variant="outline" className="border-blue-900/50 text-blue-400">
                  {recommendedResume.scorePercent}% match
                </Badge>
              </div>
              {(skills?.topResumes?.length ?? 0) > 1 && (
                <ul className="text-xs text-gray-500 space-y-1 pt-1">
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
          <Section title="Recommended Resume" icon={Briefcase}>
            <p className="text-gray-500 text-sm">
              Could not rank resumes from the skill profile. Re-run Analyze on the job overview page.
            </p>
          </Section>
        ) : null)}

      {sections.forms && formAnswers.length > 0 && (
        <Section title="Suggested form answers" icon={Sparkles}>
          <ul className="space-y-3">
            {formAnswers.map((answer, index) => (
              <li key={`${answer.question}-${index}`} className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-gray-200">{answer.question}</p>
                  <Badge variant="outline" className={confidenceClass(answer.confidence)}>
                    {answer.confidence}
                  </Badge>
                </div>
                <p className="text-gray-400 whitespace-pre-wrap">{answer.suggestedAnswer}</p>
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
    status === 'green' ? 'bg-green-400' : status === 'red' ? 'bg-red-400' : 'bg-gray-600';
  const text =
    status === 'green' ? 'text-green-300' : status === 'red' ? 'text-red-300' : 'text-gray-500';
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-800 bg-[#1a1a1a] px-2.5 py-2">
      <span
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot} ${
          status === 'red' ? 'animate-pulse' : ''
        }`}
      />
      <span className={`text-xs font-medium truncate ${text}`}>{label}</span>
    </div>
  );
}

// Three go/no-go lights summarizing whether a job fits a remote, clearance-free
// applicant. Remote/clearance verdicts come from the dedicated keyword-scan AI
// request; gray means not yet determined this session.
function TrafficLights({ jdAnalyzed, flags }: { jdAnalyzed: boolean; flags: BidFlagVerdicts }) {
  const remoteStatus: LightStatus = flags.remote ? flags.remote.status : 'unknown';
  const clearanceStatus: LightStatus = flags.clearance ? flags.clearance.status : 'unknown';
  const reasons = [
    flags.remote?.status === 'red' ? { label: 'Remote', text: flags.remote.explanation } : null,
    flags.clearance?.status === 'red'
      ? { label: 'No clearance', text: flags.clearance.explanation }
      : null,
  ].filter((entry): entry is { label: string; text: string } => Boolean(entry?.text));

  return (
    <div className="rounded-lg border border-gray-800 bg-[#202020] p-3">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Screening</div>
      <div className="grid grid-cols-3 gap-2">
        <TrafficLight label="JD analyzed" status={jdAnalyzed ? 'green' : 'unknown'} />
        <TrafficLight label="Remote" status={remoteStatus} />
        <TrafficLight label="No clearance" status={clearanceStatus} />
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-1">
          {reasons.map((reason) => (
            <li key={reason.label} className="text-[11px] text-red-300 leading-snug">
              <span className="font-medium">{reason.label}:</span> {reason.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function JobBidAssistant() {
  // The panel follows the active tab; every session/analysis/screenshot hook is
  // keyed by this tabId so switching tabs restores that tab's bid state.
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
    <div className="flex flex-col h-full bg-[#1a1a1a] text-gray-100">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-[#202020]">
        <Briefcase className="w-4 h-4 text-blue-400" />
        <h1 className="font-medium flex-1">Job Bid Assistant</h1>
        <Button
          size="sm"
          variant="outline"
          className="border-gray-700 bg-[#262626] hover:bg-[#2c2c2c] text-gray-100"
          onClick={() => void startSession()}
          disabled={sessionBusy || loading || tabId == null}
        >
          {sessionBusy && !sessionActive ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Start New Session
        </Button>
        <Button size="sm" onClick={analyze} disabled={loading || !sessionActive}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Analyze
            </>
          )}
        </Button>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-[#1e1e1e] text-xs">
        <div className="flex-1 min-w-0">
          {sessionActive ? (
            <span className="inline-flex items-center gap-1.5 text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Session active — Apply / Submit / Next clicks are being recorded
            </span>
          ) : sessionCompleted ? (
            <span className="inline-flex items-center gap-1.5 text-blue-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Session completed — start a new session to bid again
            </span>
          ) : (
            <span className="text-gray-500">
              No session — click Start New Session to enable Analyze and recording.
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-[#262626] px-2 py-1 text-gray-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Completed today: <span className="font-semibold text-gray-100">{completedCount}</span>
          </span>
          <button
            type="button"
            onClick={resetCompleted}
            disabled={completedCount === 0}
            title="Reset today's completed counter to 0"
            className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-[#262626] px-2 py-1 text-gray-400 hover:bg-[#2c2c2c] hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="rounded-lg border border-gray-800 bg-[#202020] p-3 text-sm text-gray-400">
          Open a job posting page, click <strong className="text-gray-300">Start New Session</strong>,
          then <strong className="text-gray-300">Analyze</strong>. When you finish bidding, click{' '}
          <strong className="text-gray-300">Mark as Completed</strong> at the bottom.
        </div>

        {sessionError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{sessionError}</span>
          </div>
        )}

        {(sessionActive || sessionCompleted || jdAnalyzed) && (
          <TrafficLights jdAnalyzed={jdAnalyzed} flags={flags} />
        )}

        <RecordingGallery shots={shots} />

        {loading && status && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-[#202020] p-3 text-sm text-gray-300">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span>{status}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {totalUsage && (
          <UsagePanel usage={totalUsage} title="Session token usage & cost (accumulated)" />
        )}

        {(loading || hasAnalysis) && (
          <div className="rounded-lg border border-blue-900/40 bg-[#1c1f24] p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-blue-300 uppercase tracking-wide">
                {loading ? 'Analyzing…' : 'Session analysis'}
              </div>
              {merged.updates.length > 1 && (
                <span className="text-[10px] text-gray-500">{merged.updates.length} pages analyzed</span>
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
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Page updates</div>
            <ul className="space-y-1">
              {[...merged.updates].reverse().map((update, index) => {
                const labels: string[] = [];
                if (update.sections.forms && update.newFormCount > 0) {
                  labels.push(`+${update.newFormCount} form answers`);
                }
                if (update.sections.summary) labels.push('summary');
                if (update.sections.skills) labels.push('skills');
                if (update.sections.resume) labels.push('resume');
                if (labels.length === 0) labels.push('cached context');

                return (
                  <li
                    key={update.id}
                    className="text-[11px] text-gray-500 flex items-center justify-between gap-2 px-2 py-1 rounded bg-[#1a1a1a] border border-gray-800"
                  >
                    <span className="truncate">
                      #{merged.updates.length - index} · {update.pageTitle || update.pageUrl || 'Page'}
                    </span>
                    <span className="shrink-0 text-gray-600">{labels.join(', ')}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-800 bg-[#202020]">
        <Button
          className="w-full"
          variant={sessionCompleted ? 'secondary' : 'default'}
          onClick={() => void handleComplete()}
          disabled={!sessionActive || sessionBusy || loading}
        >
          {sessionBusy && sessionActive ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              {sessionCompleted ? 'Completed' : 'Mark as Completed'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
