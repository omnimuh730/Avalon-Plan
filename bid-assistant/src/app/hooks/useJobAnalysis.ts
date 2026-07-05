import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startJobAnalysis,
  type BidFlagVerdicts,
  type PageAnalysisResult,
  type SkillAnalysisResult,
  type UsageSummary,
} from '@/lib/job-analysis';
import { BID_SESSION_RESET } from '@/lib/bid-session';

export interface AggregatedUsage {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number | null;
  savings: number | null;
  model: string | null;
}

export interface AnalysisTurn {
  id: string;
  at: string;
  pageTitle: string | null;
  pageUrl: string | null;
  page: PageAnalysisResult | null;
  skills: SkillAnalysisResult | null;
  usage: AggregatedUsage | null;
}

const EMPTY_USAGE: AggregatedUsage = {
  inputTokens: 0,
  cachedTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cost: 0,
  savings: 0,
  model: null,
};

// Analysis history and accumulated usage are stored per tab (matching the
// service worker's tabKey namespacing) so each tab's chat keeps its own record.
const turnsKey = (tabId: number) => `bidAnalysisTurns:${tabId}`;
const usageKey = (tabId: number) => `bidAnalysisUsage:${tabId}`;
const flagsKey = (tabId: number) => `bidSessionFlags:${tabId}`;

const EMPTY_FLAGS: BidFlagVerdicts = { remote: null, clearance: null };

function addUsage(current: AggregatedUsage, next: UsageSummary): AggregatedUsage {
  return {
    inputTokens: current.inputTokens + next.inputTokens,
    cachedTokens: current.cachedTokens + next.cachedTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    totalTokens: current.totalTokens + next.totalTokens,
    cost: current.cost === null || next.cost === null ? null : current.cost + next.cost,
    savings:
      current.savings === null || next.savings === null ? null : current.savings + next.savings,
    model: next.model,
  };
}

function mergeUsage(a: AggregatedUsage, b: AggregatedUsage | null): AggregatedUsage {
  if (!b) return a;
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cost: a.cost === null || b.cost === null ? null : a.cost + b.cost,
    savings: a.savings === null || b.savings === null ? null : a.savings + b.savings,
    model: b.model ?? a.model,
  };
}

interface InFlightTurn {
  pageTitle: string | null;
  pageUrl: string | null;
  page: PageAnalysisResult | null;
  skills: SkillAnalysisResult | null;
  usage: AggregatedUsage | null;
}

const EMPTY_IN_FLIGHT: InFlightTurn = {
  pageTitle: null,
  pageUrl: null,
  page: null,
  skills: null,
  usage: null,
};

export function useJobAnalysis(tabId: number | null) {
  // Completed analyses for the current session — never reset on a new Analyze,
  // only when a new bid session starts.
  const [turns, setTurns] = useState<AnalysisTurn[]>([]);
  const [totalUsage, setTotalUsage] = useState<AggregatedUsage | null>(null);
  const [flags, setFlags] = useState<BidFlagVerdicts>(EMPTY_FLAGS);

  // The Analyze currently in progress.
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<InFlightTurn>(EMPTY_IN_FLIGHT);

  const cancelRef = useRef<(() => void) | null>(null);
  const inFlightRef = useRef<InFlightTurn>(EMPTY_IN_FLIGHT);

  // Restore the bound tab's history and accumulated usage when the panel
  // switches tabs, and clear it when that tab's session starts anew (a
  // tab-scoped BID_SESSION_RESET broadcast from the service worker).
  useEffect(() => {
    if (tabId == null) {
      setTurns([]);
      setTotalUsage(null);
      setFlags(EMPTY_FLAGS);
      return;
    }
    let cancelled = false;

    // Reset the live view so the previous tab's in-flight progress never bleeds
    // into the tab now in view.
    setCurrent(EMPTY_IN_FLIGHT);
    setError(null);
    inFlightRef.current = EMPTY_IN_FLIGHT;

    chrome.storage.local
      .get([turnsKey(tabId), usageKey(tabId), flagsKey(tabId)])
      .then((stored) => {
        if (cancelled) return;
        const storedTurns = stored[turnsKey(tabId)];
        const storedUsage = stored[usageKey(tabId)];
        const storedFlags = stored[flagsKey(tabId)];
        setTurns(Array.isArray(storedTurns) ? (storedTurns as AnalysisTurn[]) : []);
        setTotalUsage(storedUsage ? (storedUsage as AggregatedUsage) : null);
        setFlags(
          storedFlags && typeof storedFlags === 'object'
            ? (storedFlags as BidFlagVerdicts)
            : EMPTY_FLAGS,
        );
      })
      .catch(() => undefined);

    const listener = (message: { type?: string; tabId?: number }) => {
      if (message?.type === BID_SESSION_RESET && message.tabId === tabId) {
        setTurns([]);
        setTotalUsage(null);
        setFlags(EMPTY_FLAGS);
        setCurrent(EMPTY_IN_FLIGHT);
        setError(null);
        inFlightRef.current = EMPTY_IN_FLIGHT;
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [tabId]);

  const persist = useCallback(
    (forTabId: number, nextTurns: AnalysisTurn[], nextUsage: AggregatedUsage | null) => {
      void chrome.storage.local.set({
        [turnsKey(forTabId)]: nextTurns,
        [usageKey(forTabId)]: nextUsage,
      });
    },
    [],
  );

  const analyze = useCallback(() => {
    if (tabId == null) return;
    // Pin the run to the tab it started on, so results persist to the right
    // tab's storage even if the user switches tabs mid-analysis.
    const runTabId = tabId;
    cancelRef.current?.();

    // Reset ONLY the in-progress view — history and accumulated usage persist.
    inFlightRef.current = { ...EMPTY_IN_FLIGHT };
    setCurrent(EMPTY_IN_FLIGHT);
    setLoading(true);
    setStatus('Starting…');
    setError(null);

    const update = (patch: Partial<InFlightTurn>) => {
      inFlightRef.current = { ...inFlightRef.current, ...patch };
      setCurrent(inFlightRef.current);
    };

    cancelRef.current = startJobAnalysis(runTabId, (event) => {
      switch (event.stage) {
        case 'status':
          setStatus(event.message);
          break;
        case 'page-context':
          update({ pageTitle: event.pageTitle, pageUrl: event.pageUrl });
          break;
        case 'page':
          update({
            page: event.result,
            usage: addUsage(inFlightRef.current.usage ?? EMPTY_USAGE, event.usage),
          });
          break;
        case 'skills':
          update({
            skills: event.result,
            usage: addUsage(inFlightRef.current.usage ?? EMPTY_USAGE, event.usage),
          });
          break;
        case 'flags':
          // Merge resolved verdicts live; the service worker has already
          // persisted them to bidSessionFlags for this tab.
          setFlags((prev) => ({
            remote: event.result.remote ?? prev.remote,
            clearance: event.result.clearance ?? prev.clearance,
          }));
          update({
            usage: addUsage(inFlightRef.current.usage ?? EMPTY_USAGE, event.usage),
          });
          break;
        case 'done': {
          const finished = inFlightRef.current;
          if (finished.page) {
            const turn: AnalysisTurn = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              at: new Date().toISOString(),
              pageTitle: finished.pageTitle,
              pageUrl: finished.pageUrl,
              page: finished.page,
              skills: finished.skills,
              usage: finished.usage,
            };
            setTurns((prevTurns) => {
              const nextTurns = [...prevTurns, turn];
              setTotalUsage((prevUsage) => {
                const nextUsage = mergeUsage(prevUsage ?? EMPTY_USAGE, finished.usage);
                persist(runTabId, nextTurns, nextUsage);
                return nextUsage;
              });
              return nextTurns;
            });
          }
          inFlightRef.current = EMPTY_IN_FLIGHT;
          setCurrent(EMPTY_IN_FLIGHT);
          setStatus(null);
          setLoading(false);
          cancelRef.current = null;
          break;
        }
        case 'error':
          setError(event.error);
          setStatus(null);
          setLoading(false);
          cancelRef.current = null;
          break;
        default: {
          const _exhaustive: never = event;
          return _exhaustive;
        }
      }
    });
  }, [persist, tabId]);

  useEffect(() => {
    return () => {
      cancelRef.current?.();
    };
  }, []);

  return {
    loading,
    status,
    error,
    turns,
    current,
    totalUsage,
    flags,
    // JD is "analyzed" as soon as the session has any completed analysis (or one
    // is mid-flight with a page result) — analyzing is itself the answer.
    jdAnalyzed: turns.length > 0 || Boolean(current.page),
    analyze,
  };
}
