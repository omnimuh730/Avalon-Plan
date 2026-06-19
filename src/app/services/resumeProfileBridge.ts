import { DEFAULT_PROFILE } from "../data/settings/profile";
import { DEFAULT_IDENTITY } from "../data/resumes/seedDocument";
import { getIdentityProfile, saveIdentityProfile } from "./resumeStorage";
import type { ResumeIdentity } from "../types/resume";

export type ResumeAiDefaults = {
  openaiKey: string;
  openaiModel: string;
  deepseekKey: string;
  defaultProvider: string;
  defaultModel: string;
};

const AI_DEFAULTS_KEY = "athens-resume-ai-defaults";

const DEFAULT_AI: ResumeAiDefaults = {
  openaiKey: "",
  openaiModel: "gpt-4o-mini",
  deepseekKey: "",
  defaultProvider: "openai",
  defaultModel: "gpt-4o-mini",
};

function profileToIdentity(): ResumeIdentity {
  const p = DEFAULT_PROFILE;
  return {
    fullName: `${p.firstName} ${p.lastName}`.trim(),
    location: `${p.city}, ${p.state}`.trim(),
    email: p.email,
    phone: p.phone,
    linkedin: p.linkedin,
  };
}

function isEmptyIdentity(identity: ResumeIdentity): boolean {
  return !identity.fullName?.trim() && !identity.email?.trim();
}

export async function loadDefaultIdentity(): Promise<ResumeIdentity> {
  const stored = await getIdentityProfile();
  if (stored && !isEmptyIdentity(stored)) return stored;

  const fallback = profileToIdentity();
  if (!isEmptyIdentity(fallback)) {
    await saveIdentityProfile(fallback);
    return fallback;
  }
  return stored ?? DEFAULT_IDENTITY;
}

export function getAiDefaults(): ResumeAiDefaults {
  try {
    const raw = localStorage.getItem(AI_DEFAULTS_KEY);
    if (raw) return { ...DEFAULT_AI, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return {
    ...DEFAULT_AI,
    openaiKey: DEFAULT_PROFILE.openaiKey,
    openaiModel: DEFAULT_PROFILE.openaiModel,
    deepseekKey: DEFAULT_PROFILE.deepseekKey,
  };
}

export function saveAiDefaults(defaults: ResumeAiDefaults): void {
  localStorage.setItem(AI_DEFAULTS_KEY, JSON.stringify(defaults));
}
