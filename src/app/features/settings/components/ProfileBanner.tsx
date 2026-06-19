import React from "react";
import { Linkedin, Github, Globe, Shield } from "lucide-react";
import { Av } from "../../../components/ui";
import { profileCompletion, type UserProfile } from "../../../data/settings/profile";
import { display } from "../../../lib/utils";

export function ProfileBanner({ profile }: { profile: UserProfile }) {
  const pct = profileCompletion(profile);
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="bg-gradient-to-br from-primary/10 via-card to-violet-500/5 border border-border rounded-2xl p-6 shadow-sm mb-6">
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        <Av name={`${profile.firstName} ${profile.lastName}`} size="lg" />
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground" style={display}>
            {profile.firstName} {profile.lastName}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {profile.city}, {profile.state}, {profile.country}
          </p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs bg-secondary border border-border rounded-lg px-2.5 py-1 font-semibold">
              {profile.timeline.filter((t) => t.type === "education").length} education
            </span>
            <span className="text-xs bg-secondary border border-border rounded-lg px-2.5 py-1 font-semibold">
              {profile.timeline.filter((t) => t.type === "role").length} roles
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="6" className="text-secondary" />
              <circle
                cx="40"
                cy="40"
                r="36"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="text-emerald-500 transition-all duration-700"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">{pct}%</span>
          </div>
          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Complete</span>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { icon: Linkedin, label: "LinkedIn", href: profile.linkedin },
            { icon: Github, label: "GitHub", href: profile.github },
            { icon: Globe, label: "Portfolio", href: profile.portfolio },
          ].map(({ icon: Icon, label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-4 py-2 text-sm font-semibold hover:bg-muted min-h-10"
            >
              <Icon className="w-4 h-4" />
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function VendorAccessRow({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 bg-card border border-border rounded-xl p-5 mb-6 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
        <Shield className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-foreground">Allow vendor access</p>
        <p className="text-xs text-muted-foreground mt-0.5">Let approved vendors view your profile for referrals</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`w-11 h-6 rounded-full transition-colors relative ${enabled ? "bg-primary" : "bg-secondary border border-border"}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
