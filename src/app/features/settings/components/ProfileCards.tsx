import React from "react";
import { Briefcase, GraduationCap, Trash2 } from "lucide-react";
import { Badge } from "../../../components/ui";
import { AthensInput, AthensSelect, FormField } from "../../../components/forms";
import { cn } from "../../../lib/utils";
import type { CareerEntry, UserProfile } from "../../../data/settings/profile";

export function ProfileIdentityCard({
  profile,
  onChange,
}: {
  profile: UserProfile;
  onChange: (patch: Partial<UserProfile>) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <h3 className="text-base font-bold text-foreground mb-4">Identity</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="First name">
          <AthensInput value={profile.firstName} onChange={(e) => onChange({ firstName: e.target.value })} />
        </FormField>
        <FormField label="Last name">
          <AthensInput value={profile.lastName} onChange={(e) => onChange({ lastName: e.target.value })} />
        </FormField>
        <FormField label="Age">
          <AthensInput value={profile.age} onChange={(e) => onChange({ age: e.target.value })} />
        </FormField>
        <AthensSelect label="Gender" value={profile.gender} onChange={(v) => onChange({ gender: v })} options={["Male", "Female", "Non-binary", "Prefer not to say"].map((o) => ({ value: o, label: o }))} />
        <AthensSelect label="Pronouns" value={profile.pronouns} onChange={(v) => onChange({ pronouns: v })} options={["they/them", "she/her", "he/him", "Prefer not to say"].map((o) => ({ value: o, label: o }))} />
        <AthensSelect label="Orientation" value={profile.orientation} onChange={(v) => onChange({ orientation: v })} options={["Prefer not to say", "Straight", "LGBTQ+"].map((o) => ({ value: o, label: o }))} />
        <FormField label="Email">
          <AthensInput type="email" value={profile.email} onChange={(e) => onChange({ email: e.target.value })} />
        </FormField>
        <FormField label="Phone">
          <AthensInput value={profile.phone} onChange={(e) => onChange({ phone: e.target.value })} />
        </FormField>
        <FormField label="Gmail app password">
          <AthensInput type="password" value={profile.gmailAppPassword} onChange={(e) => onChange({ gmailAppPassword: e.target.value })} />
        </FormField>
        <FormField label="Street address">
          <AthensInput value={profile.street} onChange={(e) => onChange({ street: e.target.value })} />
        </FormField>
        <FormField label="City">
          <AthensInput value={profile.city} onChange={(e) => onChange({ city: e.target.value })} />
        </FormField>
        <FormField label="State">
          <AthensInput value={profile.state} onChange={(e) => onChange({ state: e.target.value })} />
        </FormField>
        <FormField label="Zip">
          <AthensInput value={profile.zip} onChange={(e) => onChange({ zip: e.target.value })} />
        </FormField>
        <FormField label="Country">
          <AthensInput value={profile.country} onChange={(e) => onChange({ country: e.target.value })} />
        </FormField>
      </div>
    </div>
  );
}

export function ProfileDisclosuresCard({
  profile,
  onChange,
}: {
  profile: UserProfile;
  onChange: (patch: Partial<UserProfile>) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <h3 className="text-base font-bold text-foreground mb-4">Voluntary disclosures</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AthensSelect label="Hispanic / Latino" value={profile.hispanic} onChange={(v) => onChange({ hispanic: v })} options={["No", "Yes", "Prefer not to say"].map((o) => ({ value: o, label: o }))} />
        <AthensSelect label="Race / ethnicity" value={profile.race} onChange={(v) => onChange({ race: v })} options={["Asian", "White", "Black", "Hispanic", "Prefer not to say"].map((o) => ({ value: o, label: o }))} />
        <AthensSelect label="Visa / sponsorship" value={profile.visa} onChange={(v) => onChange({ visa: v })} options={["No sponsorship needed", "Require sponsorship", "Prefer not to say"].map((o) => ({ value: o, label: o }))} />
        <AthensSelect label="Disability" value={profile.disability} onChange={(v) => onChange({ disability: v })} options={["No", "Yes", "Prefer not to say"].map((o) => ({ value: o, label: o }))} />
        <AthensSelect label="Veteran status" value={profile.veteran} onChange={(v) => onChange({ veteran: v })} options={["No", "Yes", "Prefer not to say"].map((o) => ({ value: o, label: o }))} />
      </div>
    </div>
  );
}

export function ProfilePreferencesCard({
  profile,
  onChange,
}: {
  profile: UserProfile;
  onChange: (patch: Partial<UserProfile>) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <h3 className="text-base font-bold text-foreground mb-4">Job search preferences</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Target role">
          <AthensInput value={profile.targetRole} onChange={(e) => onChange({ targetRole: e.target.value })} />
        </FormField>
        <FormField label="Desired salary (annual)">
          <AthensInput value={profile.desiredSalary} onChange={(e) => onChange({ desiredSalary: e.target.value })} />
        </FormField>
        <AthensSelect label="Work authorization" value={profile.workAuth} onChange={(v) => onChange({ workAuth: v })} options={["Authorized to work in US", "Require sponsorship"].map((o) => ({ value: o, label: o }))} />
        <AthensSelect label="Remote preference" value={profile.remotePreference} onChange={(v) => onChange({ remotePreference: v })} options={["Remote preferred", "Hybrid", "On-site OK"].map((o) => ({ value: o, label: o }))} />
      </div>
    </div>
  );
}

export function CareerTimeline({
  timeline,
  onChange,
}: {
  timeline: CareerEntry[];
  onChange: (entries: CareerEntry[]) => void;
}) {
  const add = (type: CareerEntry["type"]) => {
    onChange([
      ...timeline,
      { id: `new-${Date.now()}`, type, title: "", org: "", start: "2024-01", end: "" },
    ]);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h3 className="text-base font-bold text-foreground flex-1">Career timeline</h3>
        <button type="button" onClick={() => add("education")} className="text-sm px-4 py-2 rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300 font-bold min-h-10">
          + Education
        </button>
        <button type="button" onClick={() => add("role")} className="text-sm px-4 py-2 rounded-xl bg-primary/10 text-primary font-bold min-h-10">
          + Role
        </button>
      </div>
      <div className="space-y-4 max-h-96 overflow-y-auto subtle-scroll pl-2">
        {timeline.map((entry, i) => (
          <div key={entry.id} className="flex gap-4 relative">
            {i < timeline.length - 1 && <div className="absolute left-[19px] top-10 bottom-0 w-px bg-border" />}
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10", entry.type === "role" ? "bg-primary/10 text-primary" : "bg-violet-500/10 text-violet-600")}>
              {entry.type === "role" ? <Briefcase className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
            </div>
            <div className="flex-1 bg-secondary/30 border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  {entry.current && <Badge v="success">Current</Badge>}
                </div>
                <button type="button" onClick={() => onChange(timeline.filter((e) => e.id !== entry.id))} className="icon-btn text-muted-foreground hover:text-destructive w-8 h-8">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <AthensInput placeholder="Title" value={entry.title} onChange={(e) => onChange(timeline.map((x) => x.id === entry.id ? { ...x, title: e.target.value } : x))} />
                <AthensInput placeholder="Organization" value={entry.org} onChange={(e) => onChange(timeline.map((x) => x.id === entry.id ? { ...x, org: e.target.value } : x))} />
                <AthensInput type="month" value={entry.start} onChange={(e) => onChange(timeline.map((x) => x.id === entry.id ? { ...x, start: e.target.value } : x))} />
                <AthensInput type="month" value={entry.end} onChange={(e) => onChange(timeline.map((x) => x.id === entry.id ? { ...x, end: e.target.value } : x))} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
