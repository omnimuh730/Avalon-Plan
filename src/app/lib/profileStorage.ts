import type { UserProfile } from "../data/settings/profile";
import { DEFAULT_PROFILE } from "../data/settings/profile";

const KEY = "athens-profile";

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(KEY, JSON.stringify(profile));
}
