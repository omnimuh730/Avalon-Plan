import type { PageAnalysisResult, SkillAnalysisResult } from '@/lib/job-analysis';

export interface FormAnswer {
  question: string;
  suggestedAnswer: string;
  confidence: string;
}

export interface AnalysisSections {
  summary: boolean;
  skills: boolean;
  resume: boolean;
  forms: boolean;
}

export interface TurnUpdate {
  id: string;
  at: string;
  pageTitle: string | null;
  pageUrl: string | null;
  sections: AnalysisSections;
  newFormCount: number;
}

export interface MergedSessionAnalysis {
  pageTitle: string | null;
  pageUrl: string | null;
  page: PageAnalysisResult | null;
  skills: SkillAnalysisResult | null;
  formAnswers: FormAnswer[];
  updates: TurnUpdate[];
}

const ALL_SECTIONS: AnalysisSections = {
  summary: true,
  skills: true,
  resume: true,
  forms: true,
};

function mergeFormAnswers(existing: FormAnswer[], incoming: FormAnswer[]): FormAnswer[] {
  const map = new Map<string, FormAnswer>();
  for (const answer of existing) {
    map.set(answer.question.trim().toLowerCase(), answer);
  }
  for (const answer of incoming) {
    map.set(answer.question.trim().toLowerCase(), answer);
  }
  return [...map.values()];
}

function sectionsForTurn(
  prevPage: PageAnalysisResult | null,
  prevSkills: SkillAnalysisResult | null,
  prevForms: FormAnswer[],
  page: PageAnalysisResult | null,
  skills: SkillAnalysisResult | null,
): AnalysisSections {
  const incomingForms = page?.formAnswers ?? [];
  const newFormCount = countNewForms(prevForms, incomingForms);

  return {
    summary: Boolean(page?.summary && page.summary !== (prevPage?.summary ?? '')),
    skills: Boolean(skills?.skillProfile && skills.skillProfile !== (prevSkills?.skillProfile ?? '')),
    resume: Boolean(
      skills?.bestResume?.name && skills.bestResume.name !== prevSkills?.bestResume?.name,
    ),
    forms: newFormCount > 0,
  };
}

function countNewForms(prev: FormAnswer[], next: FormAnswer[]): number {
  const prevKeys = new Set(prev.map((f) => f.question.trim().toLowerCase()));
  return next.filter((f) => !prevKeys.has(f.question.trim().toLowerCase())).length;
}

interface TurnLike {
  id: string;
  at: string;
  pageTitle: string | null;
  pageUrl: string | null;
  page: PageAnalysisResult | null;
  skills: SkillAnalysisResult | null;
}

export function mergeAnalysisTurns(
  turns: TurnLike[],
  inFlight?: { pageTitle: string | null; pageUrl: string | null; page: PageAnalysisResult | null; skills: SkillAnalysisResult | null } | null,
): MergedSessionAnalysis {
  let mergedPage: PageAnalysisResult | null = null;
  let mergedSkills: SkillAnalysisResult | null = null;
  let mergedForms: FormAnswer[] = [];
  const updates: TurnUpdate[] = [];

  const allTurns = [...turns];
  if (inFlight?.page) {
    allTurns.push({
      id: '__inflight__',
      at: new Date().toISOString(),
      pageTitle: inFlight.pageTitle,
      pageUrl: inFlight.pageUrl,
      page: inFlight.page,
      skills: inFlight.skills,
    });
  }

  for (const turn of allTurns) {
    const page = turn.page;
    const skills = turn.skills;
    const sections = sectionsForTurn(mergedPage, mergedSkills, mergedForms, page, skills);
    const incomingForms = page?.formAnswers ?? [];
    const newFormCount = countNewForms(mergedForms, incomingForms);

    if (turn.id !== '__inflight__') {
      updates.push({
        id: turn.id,
        at: turn.at,
        pageTitle: turn.pageTitle,
        pageUrl: turn.pageUrl,
        sections,
        newFormCount,
      });
    }

    if (page) {
      mergedPage = {
        ...page,
        summary: page.summary || mergedPage?.summary || '',
        formAnswers: mergeFormAnswers(mergedPage?.formAnswers ?? [], page.formAnswers ?? []),
      };
      mergedForms = mergedPage.formAnswers;
    }
    if (skills) {
      mergedSkills = {
        ...skills,
        skillProfile: skills.skillProfile || mergedSkills?.skillProfile || '',
        bestResume: skills.bestResume ?? mergedSkills?.bestResume ?? null,
        topResumes: skills.topResumes.length > 0 ? skills.topResumes : mergedSkills?.topResumes ?? [],
      };
    }
  }

  const last = allTurns[allTurns.length - 1];
  return {
    pageTitle: last?.pageTitle ?? null,
    pageUrl: last?.pageUrl ?? null,
    page: mergedPage,
    skills: mergedSkills,
    formAnswers: mergedForms,
    updates,
  };
}

export function diffAnalysisSections(
  prev: { analysis: AnalysisInfoLike | null; usage: unknown },
  curr: { analysis: AnalysisInfoLike | null; usage: unknown },
): AnalysisSections {
  if (!curr.analysis) return ALL_SECTIONS;
  const prevAnalysis = prev.analysis;
  const currAnalysis = curr.analysis;

  const formsChanged =
    currAnalysis.formAnswers.length > 0 &&
    JSON.stringify(currAnalysis.formAnswers) !== JSON.stringify(prevAnalysis?.formAnswers ?? []);

  return {
    summary: Boolean(currAnalysis.summary && currAnalysis.summary !== prevAnalysis?.summary),
    skills: Boolean(
      currAnalysis.skillProfile && currAnalysis.skillProfile !== prevAnalysis?.skillProfile,
    ),
    resume: Boolean(
      currAnalysis.bestResume?.name &&
        currAnalysis.bestResume.name !== prevAnalysis?.bestResume?.name,
    ),
    forms: formsChanged,
  };
}

interface AnalysisInfoLike {
  summary: string;
  skillProfile: string | null;
  bestResume: { name: string; scorePercent: number | null } | null;
  formAnswers: FormAnswer[];
}

export function hasVisibleSections(sections: AnalysisSections): boolean {
  return sections.summary || sections.skills || sections.resume || sections.forms;
}
