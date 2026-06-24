import type { UserProfile } from "../../../data/settings/profile";
import type { GeneratorIdentity } from "../../../types/resume";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function identityFromProfile(profile: UserProfile | Record<string, unknown>): GeneratorIdentity {
  const p = profile as UserProfile;
  const location = [str(p.city).trim(), str(p.state).trim()].filter(Boolean).join(", ");
  const careers = (Array.isArray(p.careers) ? p.careers : []).map((c) => {
    const start = [str(c.startYear), str(c.startMonth)].filter(Boolean).join(".");
    const end = c.endPresent ? "Present" : [str(c.endYear), str(c.endMonth)].filter(Boolean).join(".");
    const period = start || end ? `${start || "?"} – ${end || "?"}` : "";
    return { company: str(c.company), title: str(c.title), period };
  }).filter((c) => c.company || c.title);

  const education = (Array.isArray(p.education) ? p.education : []).map((e) => {
    const start = [str(e.startYear), str(e.startMonth)].filter(Boolean).join(".");
    const end = [str(e.endYear), str(e.endMonth)].filter(Boolean).join(".");
    const period = start || end ? `${start || "?"} – ${end || "?"}` : "";
    return { school: str(e.school), degree: str(e.diploma), period };
  }).filter((e) => e.school || e.degree);

  return {
    fullName: str(p.fullName).trim() || `${str(p.firstName)} ${str(p.lastName)}`.trim(),
    location,
    email: str(p.email).trim(),
    phone: str(p.phone).trim(),
    linkedin: str(p.linkedin).trim(),
    careers,
    education,
  };
}

export function generatorStorageKey(applierName: string | null | undefined): string {
  return `resumeGeneratorConfig:${applierName ?? "default"}`;
}

export function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
