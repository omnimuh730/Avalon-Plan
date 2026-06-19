import React from "react";
import { Briefcase, GraduationCap, Trash2 } from "lucide-react";
import { Badge } from "../../../components/ui";
import { cn } from "../../../lib/utils";
import type { CareerEntry, UserProfile } from "../../../data/settings/profile";

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/40 min-h-10"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary/40 min-h-10"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

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
        <Field label="First name" value={profile.firstName} onChange={(v) => onChange({ firstName: v })} />
        <Field label="Last name" value={profile.lastName} onChange={(v) => onChange({ lastName: v })} />
        <Field label="Age" value={profile.age} onChange={(v) => onChange({ age: v })} />
        <SelectField label="Gender" value={profile.gender} onChange={(v) => onChange({ gender: v })} options={["Male", "Female", "Non-binary", "Prefer not to say"]} />
        <SelectField label="Pronouns" value={profile.pronouns} onChange={(v) => onChange({ pronouns: v })} options={["they/them", "she/her", "he/him", "Prefer not to say"]} />
        <SelectField label="Orientation" value={profile.orientation} onChange={(v) => onChange({ orientation: v })} options={["Prefer not to say", "Straight", "LGBTQ+"]} />
        <Field label="Email" value={profile.email} onChange={(v) => onChange({ email: v })} type="email" />
        <Field label="Phone" value={profile.phone} onChange={(v) => onChange({ phone: v })} />
        <Field label="Gmail app password" value={profile.gmailAppPassword} onChange={(v) => onChange({ gmailAppPassword: v })} type="password" />
        <Field label="Street address" value={profile.street} onChange={(v) => onChange({ street: v })} />
        <Field label="City" value={profile.city} onChange={(v) => onChange({ city: v })} />
        <Field label="State" value={profile.state} onChange={(v) => onChange({ state: v })} />
        <Field label="Zip" value={profile.zip} onChange={(v) => onChange({ zip: v })} />
        <Field label="Country" value={profile.country} onChange={(v) => onChange({ country: v })} />
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
        <SelectField label="Hispanic / Latino" value={profile.hispanic} onChange={(v) => onChange({ hispanic: v })} options={["No", "Yes", "Prefer not to say"]} />
        <SelectField label="Race / ethnicity" value={profile.race} onChange={(v) => onChange({ race: v })} options={["Asian", "White", "Black", "Hispanic", "Prefer not to say"]} />
        <SelectField label="Visa / sponsorship" value={profile.visa} onChange={(v) => onChange({ visa: v })} options={["No sponsorship needed", "Require sponsorship", "Prefer not to say"]} />
        <SelectField label="Disability" value={profile.disability} onChange={(v) => onChange({ disability: v })} options={["No", "Yes", "Prefer not to say"]} />
        <SelectField label="Veteran status" value={profile.veteran} onChange={(v) => onChange({ veteran: v })} options={["No", "Yes", "Prefer not to say"]} />
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
        <Field label="Target role" value={profile.targetRole} onChange={(v) => onChange({ targetRole: v })} />
        <Field label="Desired salary (annual)" value={profile.desiredSalary} onChange={(v) => onChange({ desiredSalary: v })} />
        <SelectField label="Work authorization" value={profile.workAuth} onChange={(v) => onChange({ workAuth: v })} options={["Authorized to work in US", "Require sponsorship"]} />
        <SelectField label="Remote preference" value={profile.remotePreference} onChange={(v) => onChange({ remotePreference: v })} options={["Remote preferred", "Hybrid", "On-site OK"]} />
        <Field label="OpenAI API key" value={profile.openaiKey} onChange={(v) => onChange({ openaiKey: v })} type="password" />
        <SelectField label="OpenAI model" value={profile.openaiModel} onChange={(v) => onChange({ openaiModel: v })} options={["gpt-5-nano", "gpt-4o", "gpt-4o-mini"]} />
        <Field label="Deepseek API key" value={profile.deepseekKey} onChange={(v) => onChange({ deepseekKey: v })} type="password" />
        <Field label="Resume folder path" value={profile.resumeFolder} onChange={(v) => onChange({ resumeFolder: v })} />
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
                <input placeholder="Title" value={entry.title} onChange={(e) => onChange(timeline.map((x) => x.id === entry.id ? { ...x, title: e.target.value } : x))} className="bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none min-h-9" />
                <input placeholder="Organization" value={entry.org} onChange={(e) => onChange(timeline.map((x) => x.id === entry.id ? { ...x, org: e.target.value } : x))} className="bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none min-h-9" />
                <input type="month" value={entry.start} onChange={(e) => onChange(timeline.map((x) => x.id === entry.id ? { ...x, start: e.target.value } : x))} className="bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none min-h-9" />
                <input type="month" value={entry.end} onChange={(e) => onChange(timeline.map((x) => x.id === entry.id ? { ...x, end: e.target.value } : x))} className="bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none min-h-9" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
