const SCORE_LINE = /^(.+?)\s+[█#\-*=.\u2588\u2593\u2592\u2591\s]+\s*(\d{1,2})\s*$/;
const SIMPLE_LINE = /^(.+?)\s+(\d{1,2})\s*$/;
const COLON_LINE = /^(.+?):\s*(\d{1,2})\s*$/;

export interface ResumeMatch {
  name: string;
  score: number;
}

export type ResumeCatalog = Record<string, Record<string, number>>;
export type ResumeAnalysisCatalog = Record<
  string,
  { name: string; category?: string; level: number }[]
>;

/** Canonical title token → matching aliases found in JD skill names. */
const TITLE_ALIASES: Record<string, string[]> = {
  ai: [
    'ai',
    'artificial intelligence',
    'llm',
    'llms',
    'rag',
    'agentic',
    'generative',
    'openai',
    'chatgpt',
    'bedrock',
    'sagemaker',
    'embeddings',
    'machine learning',
    'ml',
    'diffusion',
    'prompt',
  ],
  go: ['go', 'golang'],
  golang: ['go', 'golang'],
  nodejs: ['nodejs', 'node.js', 'node'],
  node: ['nodejs', 'node.js', 'node'],
  'c++': ['c++', 'cpp', 'cplusplus'],
  cpp: ['c++', 'cpp', 'cplusplus'],
  'c#': ['c#', 'csharp', 'c sharp', '.net', 'dotnet', 'asp.net'],
  csharp: ['c#', 'csharp', '.net', 'dotnet'],
  'react native': ['react native', 'reactnative'],
  mern: ['mern', 'mongo', 'express', 'react', 'node'],
  gis: ['gis', 'geospatial', 'postgis', 'mapbox', 'geofenc'],
  healthcare: ['healthcare', 'fhir', 'hipaa', 'hl7', 'clinical'],
  shopify: ['shopify', 'ecommerce', 'e-commerce'],
  wordpress: ['wordpress', 'cms', 'gutenberg'],
  application: ['desktop', 'qt', 'mfc', 'qml', 'native app'],
  desktop: ['desktop', 'qt', 'mfc', 'qml'],
  flutter: ['flutter', 'dart', 'ionic'],
  ionic: ['ionic', 'flutter'],
  android: ['android', 'kotlin', 'jetpack'],
  ios: ['ios', 'swift', 'swiftui', 'uikit'],
  rust: ['rust', 'tokio', 'actix'],
  python: ['python', 'fastapi', 'pytorch', 'pandas'],
  django: ['django'],
  angular: ['angular', 'rxjs', 'ngrx'],
  vue: ['vue', 'vue.js', 'vuejs', 'pinia'],
  react: ['react', 'next.js', 'nextjs', 'remix'],
  java: ['java', 'spring', 'jvm'],
  kotlin: ['kotlin'],
  php: ['php', 'laravel', 'symfony'],
  laravel: ['laravel', 'php'],
  ruby: ['ruby', 'rails'],
  rails: ['ruby', 'rails'],
  nextjs: ['next.js', 'nextjs', 'react'],
  remix: ['remix', 'react'],
};

function normalizeSkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[./]/g, '');
}

function parseSkillLine(rawLine: string): { skill: string; score: number } | null {
  let line = String(rawLine ?? '')
    .trim()
    .replace(/^[-*•]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s*/, '');
  if (!line || line.startsWith('---')) return null;

  for (const pattern of [SCORE_LINE, COLON_LINE, SIMPLE_LINE]) {
    const match = line.match(pattern);
    if (!match) continue;

    const score = Number(match[2]);
    if (!Number.isFinite(score) || score < 0 || score > 10) continue;

    let skill = match[1]
      .trim()
      .replace(/[█#\-*=.\u2588\u2593\u2592\u2591]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!skill || /^(output format|skill name|examples?)$/i.test(skill)) continue;

    return { skill, score };
  }

  const trailing = line.match(/^(.+?)\s+(\d{1,2})\s*$/);
  if (trailing) {
    const score = Number(trailing[2]);
    if (Number.isFinite(score) && score >= 0 && score <= 10) {
      const skill = trailing[1]
        .replace(/[█#\-*=.\u2588\u2593\u2592\u2591]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (skill) return { skill, score };
    }
  }

  return null;
}

export function parseSkillProfile(skillProfileText: string): Map<string, number> {
  const scores = new Map<string, number>();

  for (const line of String(skillProfileText ?? '').split('\n')) {
    const parsed = parseSkillLine(line);
    if (parsed) {
      scores.set(normalizeSkillName(parsed.skill), parsed.score);
    }
  }

  return scores;
}

/** Resume stack titles — prediction uses title tokens only. */
export function tokenizeResumeTitle(title: string): Set<string> {
  let raw = String(title ?? '');
  raw = raw.replace(/\(([^)]*\b(?:not|never|no)\b[^)]*)\)/gi, ' ');
  raw = raw.replace(/\(([^)]+)\)/g, ' $1 ');
  raw = raw.replace(/[/&,|]/g, ' + ');

  const parts = raw
    .split(/\+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const tokens = new Set<string>();
  for (const part of parts) {
    const cleaned = part
      .toLowerCase()
      .replace(/\b(?:for|web|scripting|with|and|the|a|an)\b/g, ' ')
      .replace(/[^a-z0-9+#.\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) continue;

    tokens.add(normalizeSkillName(cleaned));
    for (const word of cleaned.split(/[\s-]+/)) {
      const w = normalizeSkillName(word);
      if (w.length >= 2) tokens.add(w);
    }

    const aliases = TITLE_ALIASES[cleaned] || TITLE_ALIASES[normalizeSkillName(cleaned)];
    if (aliases) {
      for (const alias of aliases) tokens.add(normalizeSkillName(alias));
    }
  }

  for (const token of [...tokens]) {
    const aliases = TITLE_ALIASES[token];
    if (aliases) {
      for (const alias of aliases) tokens.add(normalizeSkillName(alias));
    }
  }

  return tokens;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleMatchesSkill(titleTokens: Set<string>, jdSkill: string): boolean {
  if (!jdSkill) return false;
  for (const token of titleTokens) {
    if (!token) continue;
    if (token === jdSkill) return true;
    if (token.length <= 2) {
      const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(token)}(?:[^a-z0-9]|$)`);
      if (re.test(jdSkill)) return true;
      continue;
    }
    if (jdSkill.includes(token) || token.includes(jdSkill)) return true;
  }
  return false;
}

export function scoreResumeByTitle(jdScores: Map<string, number>, resumeTitle: string): number {
  const titleTokens = tokenizeResumeTitle(resumeTitle);
  if (titleTokens.size === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;
  let hitWeight = 0;

  for (const [skill, jdScore] of jdScores) {
    if (jdScore <= 0) continue;
    const weight = jdScore * jdScore;
    totalWeight += weight;
    if (titleMatchesSkill(titleTokens, skill)) {
      weightedSum += weight;
      hitWeight += weight;
    }
  }

  if (totalWeight === 0) return 0;

  const coverage = weightedSum / totalWeight;
  const focus = hitWeight > 0 ? hitWeight / (hitWeight + totalWeight * 0.15) : 0;
  return Math.min(1, coverage * 0.85 + focus * 0.15);
}

/** Rank resume stacks by title vs JD skill profile (ignores analyzed skill JSON). */
export function rankResumes(
  jdSkillProfileText: string,
  resumesCatalog: ResumeCatalog | ResumeAnalysisCatalog,
  topN = 3,
): ResumeMatch[] {
  const jdScores = parseSkillProfile(jdSkillProfileText);
  if (jdScores.size === 0) {
    return [];
  }

  const ranked = Object.keys(resumesCatalog || {})
    .map((name) => ({
      name,
      score: scoreResumeByTitle(jdScores, name),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return ranked.slice(0, topN);
}
