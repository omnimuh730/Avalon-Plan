import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "../../../components/shared/ThemeToggle";
import { type UserProfile } from "../../../data/settings/profile";
import { loadProfile, saveProfile } from "../../../lib/profileStorage";
import { ProfileBanner, VendorAccessRow } from "./ProfileBanner";
import {
  ProfileIdentityCard,
  ProfileDisclosuresCard,
  ProfilePreferencesCard,
  CareerTimeline,
} from "./ProfileCards";

export function ProfileTab() {
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  const patch = (p: Partial<UserProfile>) => {
    setProfile((prev) => ({ ...prev, ...p }));
    setSaved(false);
  };

  const save = () => {
    saveProfile(profile);
    setSaved(true);
    toast.success("Profile saved successfully");
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Auto-bid profile</h2>
          <p className="text-sm text-muted-foreground">Identity, preferences, and career history</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            type="button"
            onClick={save}
            className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10"
          >
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
      <ProfileBanner profile={profile} />
      <VendorAccessRow enabled={profile.vendorAccess} onChange={(v) => patch({ vendorAccess: v })} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <ProfileIdentityCard profile={profile} onChange={patch} />
        <div className="space-y-5">
          <ProfileDisclosuresCard profile={profile} onChange={patch} />
          <ProfilePreferencesCard profile={profile} onChange={patch} />
        </div>
      </div>
      <CareerTimeline timeline={profile.timeline} onChange={(timeline) => patch({ timeline })} />
    </div>
  );
}
