import type {
  EditorDraft,
  RefinementPipeline,
  RefinementStep,
  ResumeDocument,
  ResumeStackCatalog,
  ResumeSummary,
  ResumeTemplateRef,
  ResumeTheme,
  SectionLayoutConfig,
} from "../../types/resume";

export const DEFAULT_IDENTITY = {
  fullName: "Jordan Doe",
  location: "San Francisco, CA",
  email: "jordan.doe@email.com",
  phone: "(555) 123-4567",
  linkedin: "linkedin.com/in/jordandoe",
};

export const DEFAULT_THEME: ResumeTheme = {
  font: "Source Sans 3",
  bodySizePt: 10.5,
  nameSizePt: 24,
  accentColor: "#1f3a5f",
  textColor: "#0f172a",
  headerAlign: "center",
  paperSize: "letter",
  marginIn: 0.65,
};

export const DEFAULT_SECTIONS: SectionLayoutConfig[] = [
  { id: "summary", titleSizePt: 12, bodySizePt: 10.5, color: "#0f172a", order: 0 },
  { id: "experience", titleSizePt: 12, bodySizePt: 10.5, color: "#0f172a", order: 1 },
  { id: "skills", titleSizePt: 12, bodySizePt: 10.5, color: "#0f172a", order: 2 },
  { id: "education", titleSizePt: 12, bodySizePt: 10.5, color: "#0f172a", order: 3 },
];

export const BUILTIN_TEMPLATES: ResumeTemplateRef[] = [
  { id: "tpl-standard", name: "Standard", layout: "standard", description: "Reverse-chronological — ATS default", source: "builtin" },
  { id: "tpl-two-column", name: "Two-Column", layout: "two-column", description: "Sidebar for skills & education", source: "builtin" },
  { id: "tpl-classic", name: "Classic", layout: "classic", description: "Single column, left-aligned header", source: "builtin" },
  { id: "tpl-centered", name: "Centered", layout: "centered", description: "Centered header, clean sections", source: "builtin" },
  { id: "tpl-minimal", name: "Minimal", layout: "minimal", description: "Whitespace-forward, subtle dividers", source: "builtin" },
  { id: "tpl-compact", name: "Compact", layout: "compact", description: "High-density for long histories", source: "builtin" },
  { id: "tpl-modern", name: "Modern", layout: "modern", description: "Accent bar, sans-serif tech look", source: "builtin" },
  { id: "tpl-bold", name: "Bold", layout: "bold", description: "Strong headings, visual hierarchy", source: "builtin" },
];

export const DEFAULT_REFINEMENT_STEPS: RefinementStep[] = [
  {
    id: "step-1",
    title: "Experience — fine-tune 1",
    section: "experience",
    mode: "fine-tune",
    prompt:
      "Rewrite each experience bullet: starts with a past-tense action verb (not bolded), no first person, 24–28 words. Describes one IC engineer's real work: specific feature logic, system behavior.",
  },
  {
    id: "step-2",
    title: "Experience — final",
    section: "experience",
    mode: "final",
    prompt:
      "Vary sentence shape. Kill parallel 'Verb X using Y to achieve Z' rhythm — that's the AI tell. No two bullets should lean on the same technology in the same way.",
    outputSchema: JSON.stringify(
      {
        type: "object",
        properties: {
          experiences: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                bullets: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      null,
      2
    ),
  },
];

export const DEFAULT_PIPELINE: RefinementPipeline = {
  id: "pipeline-default",
  name: "Default refinement",
  steps: DEFAULT_REFINEMENT_STEPS,
  isDefault: true,
};

export const SEED_STACK_CATALOG: ResumeStackCatalog = {
  "React + TypeScript": {
    React: 10,
    TypeScript: 10,
    "Node.js": 8,
    "Design Systems": 9,
    Performance: 8,
    Testing: 7,
  },
  "Full Stack — Startup": {
    React: 9,
    Go: 8,
    AWS: 8,
    Docker: 7,
    PostgreSQL: 8,
    "System Design": 7,
  },
  "Python — Scripting": {
    Python: 10,
    Scripting: 9,
    "Data Processing": 8,
    "Big Data": 7,
    Automation: 9,
    Scraping: 8,
  },
};

function makeDocument(
  id: string,
  overrides: Partial<Pick<ResumeDocument, "summary">> & { identity?: Partial<ResumeDocument["identity"]> } = {}
): ResumeDocument {
  return {
    id,
    identity: { ...DEFAULT_IDENTITY, ...overrides.identity },
    summary:
      overrides.summary ??
      "Senior software engineer with 8+ years building scalable web applications. Expert in React, TypeScript, and Node.js with a track record of delivering high-impact features at fast-growing startups.",
    experiences: [
      {
        id: "exp-1",
        company: "TechCorp Inc.",
        role: "Senior Software Engineer",
        location: "San Francisco, CA",
        startDate: "Jan 2021",
        endDate: "Present",
        bullets: [
          "Led migration of monolithic React app to micro-frontend architecture serving 2M+ daily active users",
          "Reduced page load time by 40% through code splitting, lazy loading, and CDN optimization strategies",
          "Mentored team of 4 junior engineers; established code review standards and testing best practices",
        ],
      },
      {
        id: "exp-2",
        company: "StartupXYZ",
        role: "Software Engineer",
        location: "Remote",
        startDate: "Mar 2018",
        endDate: "Dec 2020",
        bullets: [
          "Built real-time collaboration features using WebSockets and Redis pub/sub for 50K concurrent users",
          "Designed and implemented RESTful APIs handling 10M+ requests per day with 99.9% uptime",
          "Collaborated with product and design teams to ship 15+ features across 3 major product releases",
        ],
      },
    ],
    skills: {
      languages: ["TypeScript", "JavaScript", "Python", "Go"],
      frameworks: ["React", "Next.js", "Node.js", "Express"],
      databases: ["PostgreSQL", "Redis", "MongoDB"],
      cloudDevOps: ["AWS", "Docker", "Kubernetes", "CI/CD"],
    },
    education: [
      {
        id: "edu-1",
        school: "University of California, Berkeley",
        degree: "B.S. Computer Science",
        location: "Berkeley, CA",
        graduationDate: "May 2017",
      },
    ],
  };
}

export const SEED_DOCUMENTS: { summary: ResumeSummary; document: ResumeDocument }[] = [
  {
    summary: {
      id: "r1",
      name: "Software Engineer — General",
      version: "v3.2",
      updated: "2 days ago",
      matchScore: 88,
      skills: ["React", "TypeScript", "Node.js", "PostgreSQL"],
      isPrimary: true,
      documentId: "doc-r1",
    },
    document: makeDocument("doc-r1"),
  },
  {
    summary: {
      id: "r2",
      name: "Frontend Specialist",
      version: "v2.1",
      updated: "1 week ago",
      matchScore: 94,
      skills: ["React", "TypeScript", "Performance", "Design Systems"],
      isPrimary: false,
      documentId: "doc-r2",
    },
    document: makeDocument("doc-r2", {
      summary:
        "Frontend specialist focused on React performance, design systems, and accessible UI. 6+ years crafting pixel-perfect interfaces used by millions.",
      identity: { fullName: "Jordan Doe" },
    }),
  },
  {
    summary: {
      id: "r3",
      name: "Full Stack — Startup",
      version: "v1.4",
      updated: "2 weeks ago",
      matchScore: 82,
      skills: ["React", "Go", "AWS", "Docker"],
      isPrimary: false,
      documentId: "doc-r3",
    },
    document: makeDocument("doc-r3", {
      summary:
        "Full-stack engineer comfortable across the stack — from React frontends to Go microservices on AWS. Thrives in early-stage startup environments.",
    }),
  },
];

export function createDefaultEditorDraft(): EditorDraft {
  const doc = makeDocument("draft-" + Date.now());
  return {
    document: doc,
    templateId: "tpl-standard",
    theme: { ...DEFAULT_THEME },
    sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
    provider: "openai",
    model: "gpt-4o-mini",
    reasoningEffort: "default",
    jobDescription: "",
    refinementSteps: DEFAULT_REFINEMENT_STEPS.map((s) => ({ ...s, id: `${s.id}-${Date.now()}` })),
  };
}

export function createDefaultEditorDraftFromSummary(summary: ResumeSummary, document: ResumeDocument): EditorDraft {
  return {
    document: structuredClone(document),
    templateId: "tpl-standard",
    theme: { ...DEFAULT_THEME },
    sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
    provider: "openai",
    model: "gpt-4o-mini",
    reasoningEffort: "default",
    jobDescription: "",
    refinementSteps: DEFAULT_REFINEMENT_STEPS.map((s) => ({ ...s, id: `${s.id}-${Date.now()}` })),
    baseResumeId: summary.id,
  };
}
