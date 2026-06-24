const SECTION_HEADERS = new Set([
  "responsibilities",
  "responsibility",
  "qualification",
  "qualifications",
  "requirements",
  "required",
  "benefits",
  "about",
  "about the role",
  "about the job",
  "what you'll do",
  "what you will do",
  "who you are",
  "nice to have",
  "preferred",
]);

const LINKEDIN_BOILERPLATE =
  /^(represents the skills you have|find out how your skills align|you can easily click on the tags)/i;

export type JobDescriptionSection = {
  title: string;
  body: string;
};

export type ParsedJobDescription = {
  preamble: string;
  sections: JobDescriptionSection[];
};

function isSectionHeader(line: string): boolean {
  const key = line.trim().toLowerCase();
  if (SECTION_HEADERS.has(key)) return true;
  if (key.length > 48) return false;
  if (/[.!?]$/.test(key)) return false;
  return /^(what|who|about|qualification|requirement|responsibilit)/i.test(key);
}

/** Split raw JD text into titled sections for structured rendering. */
export function parseJobDescription(description: string): ParsedJobDescription {
  const lines = description.split("\n");
  const sections: JobDescriptionSection[] = [];
  let preambleLines: string[] = [];
  let current: { title: string; body: string[] } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (LINKEDIN_BOILERPLATE.test(line)) continue;

    if (isSectionHeader(line)) {
      if (current) {
        sections.push({ title: current.title, body: current.body.join("\n") });
      }
      current = { title: line, body: [] };
      continue;
    }

    if (current) current.body.push(line);
    else preambleLines.push(line);
  }

  if (current) {
    sections.push({ title: current.title, body: current.body.join("\n") });
  }

  return { preamble: preambleLines.join("\n"), sections };
}

/** Render body lines as bullet list when most lines look like list items. */
export function bodyAsListItems(body: string): string[] | null {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const bulletLike = lines.filter((l) => /^([•\-*]|\d+\.)\s/.test(l)).length;
  const longLines = lines.filter((l) => l.length > 120).length;
  if (bulletLike >= lines.length * 0.4) {
    return lines.map((l) => l.replace(/^([•\-*]|\d+\.)\s*/, ""));
  }
  if (longLines === 0 && lines.length >= 3) return lines;
  return null;
}
