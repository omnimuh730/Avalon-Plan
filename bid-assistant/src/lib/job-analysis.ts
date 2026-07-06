export type FormAnswerConfidence = 'high' | 'medium' | 'low';

export interface FormAnswerSuggestion {
  question: string;
  suggestedAnswer: string;
  confidence: FormAnswerConfidence;
}

export interface ResumeMatchResult {
  name: string;
  score: number;
  scorePercent: number;
}

export interface UsageSummary {
  model: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number | null;
  savings: number | null;
}

export interface PageAnalysisResult {
  isJobPage: boolean;
  summary: string;
  formAnswers: FormAnswerSuggestion[];
  notJobPageReason?: string;
  pageUrl: string;
  pageTitle: string;
}

export interface SkillAnalysisResult {
  skillProfile: string;
  bestResume: ResumeMatchResult | null;
  topResumes: ResumeMatchResult[];
}

// Traffic-light flags. 'green' = satisfies the applicant's hard constraints
// (effectively remote / no clearance required), 'red' = a disqualifier.
export type FlagStatus = 'green' | 'red';

export interface FlagVerdict {
  status: FlagStatus;
  explanation: string;
}

export type BidFlag = 'remote' | 'clearance';

// Verdicts resolved for the session so far; null = not yet determined.
export interface BidFlagVerdicts {
  remote: FlagVerdict | null;
  clearance: FlagVerdict | null;
}

// A single dedicated request only returns the flags it was asked for.
export type BidFlagsResult = Partial<Record<BidFlag, FlagVerdict>>;

export type AnalysisEvent =
  | { stage: 'status'; message: string }
  | { stage: 'page-context'; pageUrl: string; pageTitle: string }
  | { stage: 'page'; result: PageAnalysisResult; usage: UsageSummary }
  | { stage: 'skills'; result: SkillAnalysisResult; usage: UsageSummary }
  | { stage: 'flags'; result: BidFlagsResult; usage: UsageSummary }
  | { stage: 'done' }
  | { stage: 'error'; error: string };

export const JOB_ANALYSIS_PORT = 'job-analysis';

/**
 * Opens a long-lived port to the service worker and streams analysis stages
 * back as they complete. Returns a function that cancels the run.
 */
export function startJobAnalysis(
  tabId: number,
  onEvent: (event: AnalysisEvent) => void,
): () => void {
  const port = chrome.runtime.connect({ name: JOB_ANALYSIS_PORT });
  let finished = false;
  // Whether the service worker streamed a real terminal event (`done`/`error`).
  // A disconnect before this means the worker died mid-run, not a clean finish.
  let receivedTerminal = false;
  let cancelled = false;

  const finish = (event: AnalysisEvent) => {
    if (finished) return;
    finished = true;
    onEvent(event);
  };

  port.onMessage.addListener((event: AnalysisEvent) => {
    if (event.stage === 'done' || event.stage === 'error') {
      receivedTerminal = true;
      finish(event);
      return;
    }
    onEvent(event);
  });

  port.onDisconnect.addListener(() => {
    if (cancelled || receivedTerminal) return;
    const error = chrome.runtime.lastError?.message;
    finish({
      stage: 'error',
      error:
        error ??
        'Analysis connection closed before finishing. The bridge or extension service worker may have restarted — please try Analyze again.',
    });
  });

  port.postMessage({ type: 'START', tabId });

  return () => {
    cancelled = true;
    finished = true;
    port.disconnect();
  };
}
