import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApplier } from "@/context/applier-context";
import { ThemeToggle } from "../../../components/shared/ThemeToggle";
import { emptyCareer, emptyEducation, emptyProfile, type UserProfile } from "../../../data/settings/profile";
import {
  fetchAutoBidProfile,
  saveAutoBidProfile,
  testLlmKey,
} from "../../../services/profileApi";
import { ProfileBanner, VendorAccessRow } from "./ProfileBanner";
import {
  ProfileDisclosuresCard,
  ProfileIdentityCard,
  ProfileJobBidCard,
  type KeyCheck,
} from "./ProfileCards";
import { CareerTimeline } from "./CareerTimeline";
import { DefaultModelCard } from "./DefaultModelCard";

export function ProfileTab() {
  const { applier, applierReady } = useApplier();
  const [profile, setProfile] = useState<UserProfile>(() => emptyProfile());
  const [vendorAllowed, setVendorAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountMissing, setAccountMissing] = useState(false);
  const [keyChecks, setKeyChecks] = useState<{ openai: KeyCheck; deepseek: KeyCheck }>({
    openai: { state: "idle" },
    deepseek: { state: "idle" },
  });
  const [openaiModels, setOpenaiModels] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!applier?.name) {
      setProfile(emptyProfile());
      setVendorAllowed(false);
      setAccountMissing(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchAutoBidProfile(applier.name);
      setProfile(data.profile);
      setVendorAllowed(data.vendorAllowed);
      setAccountMissing(!data.accountExists);
    } catch {
      toast.error("Could not load profile");
      setProfile(emptyProfile());
    } finally {
      setLoading(false);
    }
  }, [applier?.name]);

  useEffect(() => {
    if (!applierReady) return;
    void load();
  }, [applierReady, load]);

  const patch = (p: Partial<UserProfile>) => setProfile((prev) => ({ ...prev, ...p }));

  const save = async () => {
    if (!applier?.name) {
      toast.warning("Sign in to save your profile");
      return;
    }
    setSaving(true);
    try {
      const res = await saveAutoBidProfile(applier.name, profile, vendorAllowed);
      if (res.success) {
        toast.success("Profile saved");
        setAccountMissing(false);
        await load();
      } else {
        toast.error(res.error || "Save failed");
      }
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const checkKey = async (provider: "openai" | "deepseek") => {
    const apiKey = provider === "openai" ? profile.openaiApiKey : profile.deepseekApiKey;
    if (!apiKey.trim()) {
      setKeyChecks((c) => ({ ...c, [provider]: { state: "fail", message: "Enter a key first." } }));
      return;
    }
    setKeyChecks((c) => ({ ...c, [provider]: { state: "checking" } }));
    try {
      const res = await testLlmKey(provider, apiKey);
      setKeyChecks((c) => ({
        ...c,
        [provider]: { state: res.ok ? "ok" : "fail", message: res.message },
      }));
      if (provider === "openai" && res.ok && res.models) {
        setOpenaiModels(res.models);
      }
    } catch {
      setKeyChecks((c) => ({ ...c, [provider]: { state: "fail", message: "Could not reach the backend." } }));
    }
  };

  if (!applierReady) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  if (!applier?.name) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground max-w-lg">
        Sign in to edit and save your auto-bid profile.
      </div>
    );
  }

  return (
    <div className="max-w-none w-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Auto-bid profile</h2>
          <p className="text-sm text-muted-foreground">Identity, preferences, and career history</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {accountMissing && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          No <span className="font-medium">{applier.name}</span> row in account_info yet. Create this account before saving the profile.
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-10 text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading profile…
        </div>
      ) : (
        <>
          <ProfileBanner profile={profile} />
          <VendorAccessRow enabled={vendorAllowed} onChange={setVendorAllowed} disabled={saving} />

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-4 items-start">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ProfileIdentityCard profile={profile} onChange={patch} />
              <div className="space-y-4">
                <ProfileDisclosuresCard profile={profile} onChange={patch} />
                <ProfileJobBidCard
                  profile={profile}
                  onChange={patch}
                  keyChecks={keyChecks}
                  onTestKey={(p) => void checkKey(p)}
                  openaiModels={openaiModels}
                />
                {applier?.name ? (
                  <DefaultModelCard
                    applierName={applier.name}
                    currentProvider={profile.defaultProvider}
                    currentModel={profile.defaultModel}
                    onSaved={(defaultProvider, defaultModel) => patch({ defaultProvider, defaultModel })}
                  />
                ) : null}
              </div>
            </div>

            <CareerTimeline
              education={profile.education}
              careers={profile.careers}
              onAddEducation={() => patch({ education: [...profile.education, emptyEducation()] })}
              onAddCareer={() => patch({ careers: [...profile.careers, emptyCareer()] })}
              onUpdateEducation={(index, p) =>
                patch({ education: profile.education.map((r, j) => (j === index ? { ...r, ...p } : r)) })
              }
              onUpdateCareer={(index, p) =>
                patch({ careers: profile.careers.map((r, j) => (j === index ? { ...r, ...p } : r)) })
              }
              onRemoveEducation={(index) => patch({ education: profile.education.filter((_, j) => j !== index) })}
              onRemoveCareer={(index) => patch({ careers: profile.careers.filter((_, j) => j !== index) })}
            />
          </div>
        </>
      )}
    </div>
  );
}
