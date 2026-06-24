import { API_BASE } from "@/lib/api-base";
import {
  buildProfileSavePayload,
  emptyProfile,
  mapProfileFromApi,
  type UserProfile,
} from "../data/settings/profile";

export type NotificationPrefs = {
  applications: boolean;
  interviews: boolean;
  jobs: boolean;
  agents: boolean;
  mail: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  applications: true,
  interviews: true,
  jobs: true,
  agents: true,
  mail: true,
};

async function parseJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function fetchAutoBidProfile(applierName: string): Promise<{
  profile: UserProfile;
  vendorAllowed: boolean;
  accountExists: boolean;
}> {
  const url = `${API_BASE.replace(/\/$/, "")}/personal/auto-bid-profile?applierName=${encodeURIComponent(applierName)}`;
  const res = await fetch(url);
  const data = (await parseJson(res)) as {
    success?: boolean;
    accountExists?: boolean;
    vendorAllowed?: boolean;
    profile?: Record<string, unknown>;
  } | null;

  if (!res.ok || !data?.success) {
    throw new Error("Could not load profile");
  }

  return {
    profile: mapProfileFromApi(data.profile),
    vendorAllowed: Boolean(data.vendorAllowed),
    accountExists: data.accountExists !== false,
  };
}

export async function saveAutoBidProfile(
  applierName: string,
  profile: UserProfile,
  vendorAllowed: boolean,
): Promise<{ success: boolean; error?: string }> {
  const url = `${API_BASE.replace(/\/$/, "")}/personal/auto-bid-profile`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildProfileSavePayload(profile, applierName, vendorAllowed)),
  });
  const data = (await parseJson(res)) as { success?: boolean; error?: string } | null;
  if (!res.ok || !data?.success) {
    return { success: false, error: data?.error || "Save failed" };
  }
  return { success: true };
}

export async function testLlmKey(
  provider: "openai" | "deepseek",
  apiKey: string,
): Promise<{ ok: boolean; message?: string; models?: string[] }> {
  const url = `${API_BASE.replace(/\/$/, "")}/personal/llm-key-check`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey }),
  });
  const data = (await parseJson(res)) as { ok?: boolean; message?: string; models?: string[] } | null;
  return { ok: Boolean(data?.ok), message: data?.message, models: data?.models };
}

export async function fetchNotificationPrefs(applierName: string): Promise<NotificationPrefs> {
  const url = `${API_BASE.replace(/\/$/, "")}/settings/notifications?applierName=${encodeURIComponent(applierName)}`;
  const res = await fetch(url);
  const data = (await parseJson(res)) as { success?: boolean; prefs?: Partial<NotificationPrefs> } | null;
  if (!res.ok || !data?.success) return DEFAULT_NOTIFICATION_PREFS;
  return { ...DEFAULT_NOTIFICATION_PREFS, ...data.prefs };
}

export async function saveNotificationPrefs(
  applierName: string,
  prefs: NotificationPrefs,
): Promise<{ success: boolean; error?: string }> {
  const url = `${API_BASE.replace(/\/$/, "")}/settings/notifications`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applierName, ...prefs }),
  });
  const data = (await parseJson(res)) as { success?: boolean; error?: string } | null;
  if (!res.ok || !data?.success) {
    return { success: false, error: data?.error || "Save failed" };
  }
  return { success: true };
}

export async function changePassword(
  name: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; message?: string }> {
  const url = `${API_BASE.replace(/\/$/, "")}/auth/change-password`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, currentPassword, newPassword }),
  });
  const data = (await parseJson(res)) as { success?: boolean; message?: string } | null;
  return { success: Boolean(data?.success), message: data?.message };
}

export { emptyProfile };
