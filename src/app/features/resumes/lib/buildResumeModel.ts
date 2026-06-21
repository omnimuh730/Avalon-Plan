import type { EditorDraft, GeneratorIdentity, ResumeDocument } from "../../../types/resume";
import { BUILTIN_TEMPLATES } from "../../../data/resumes/seedDocument";

const SECTION_TITLES: Record<string, string> = {
  summary: "Professional Summary",
  skills: "Skills",
  experience: "Experience",
  education: "Education",
};

export function buildResumeModel(draft: EditorDraft, identity: GeneratorIdentity | null) {
  const doc = draft.document;
  const template = BUILTIN_TEMPLATES.find((t) => t.id === draft.templateId) ?? BUILTIN_TEMPLATES[0];
  const sorted = [...draft.sections].sort((a, b) => a.order - b.order);

  const sections = sorted.map((s) => {
    const base = {
      type: s.id,
      title: SECTION_TITLES[s.id] ?? s.id,
      titleSizePt: s.titleSizePt,
      bodySizePt: s.bodySizePt,
      headingColor: s.color,
      headingStyle: template.layout === "modern" || template.layout === "bold" ? "bar" : "underline",
    };
    if (s.id === "summary") return { ...base, summary: doc.summary };
    if (s.id === "skills") {
      const groups = [
        { category: "Languages", items: doc.skills.languages },
        { category: "Frameworks", items: doc.skills.frameworks },
        { category: "Databases", items: doc.skills.databases },
        { category: "Cloud & DevOps", items: doc.skills.cloudDevOps },
      ].filter((g) => g.items.length);
      return { ...base, skills: groups };
    }
    if (s.id === "experience") {
      return {
        ...base,
        experience: doc.experiences.map((e) => ({
          title: e.role,
          company: e.company,
          period: `${e.startDate} – ${e.endDate}`,
          bullets: e.bullets,
        })),
      };
    }
    return {
      ...base,
      education: doc.education.map((e) => ({
        school: e.school,
        degree: e.degree,
        period: e.graduationDate,
      })),
    };
  });

  const id = identity ?? doc.identity;
  return {
    name: id.fullName || "Your Name",
    contact: [id.location, id.email, id.phone, id.linkedin].map((x) => (x ?? "").trim()).filter(Boolean),
    headerAlign: draft.theme.headerAlign,
    headingAlign: template.layout === "centered" ? "center" : "left",
    nameSizePt: draft.theme.nameSizePt,
    nameColor: draft.theme.accentColor,
    baseSizePt: draft.theme.bodySizePt,
    textColor: draft.theme.textColor,
    accentColor: draft.theme.accentColor,
    sections,
  };
}

export function fontStack(name: string): string {
  if (!name) return "sans-serif";
  if (name.includes(",")) return name;
  const quoted = /\s/.test(name) ? `"${name}"` : name;
  return `${quoted}, sans-serif`;
}

export async function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportResumeServer(
  format: "pdf" | "docx",
  payload: Record<string, unknown>,
  fileName: string,
  apiBase: string,
) {
  const endpoint = format === "pdf" ? "/personal/resume-pdf" : "/personal/resume-docx";
  const res = await fetch(`${apiBase.replace(/\/$/, "")}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  await downloadBlob(blob, fileName);
}
