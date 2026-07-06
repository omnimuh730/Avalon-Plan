import React from "react";
import { Crown, Linkedin, Github, Globe } from "lucide-react";
import { Av } from "../../../components/ui";
import { computeProfileCompletion } from "../../../data/settings/profileCompletion";
import type { UserProfile } from "../../../data/settings/profile";
import { isProTier } from "../../../lib/pro";

export function ProfileBanner({ profile, tier }: { profile: UserProfile; tier?: string | null }) {
  const pct = computeProfileCompletion(profile);
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (pct / 100) * circumference;
  const displayName =
    profile.fullName.trim() || `${profile.firstName} ${profile.lastName}`.trim() || "Your profile";
  const pro = isProTier(tier);

  return (
    <div className="bg-gradient-to-br from-primary/10 via-card to-violet-500/5 border border-border rounded-2xl p-5 shadow-sm mb-4">
      <div className="flex flex-col md:flex-row md:items-center gap-5">
        <Av name={displayName} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <h2 className="text-xl font-bold text-foreground truncate">{displayName}</h2>
            {pro && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                <Crown className="w-3.5 h-3.5" />
                Pro
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 truncate">
            {[profile.city, profile.state, profile.country].filter(Boolean).join(", ") || "Add your location"}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs bg-secondary border border-border rounded-lg px-2.5 py-1 font-semibold">
              {profile.education.length} education
            </span>
            <span className="text-xs bg-secondary border border-border rounded-lg px-2.5 py-1 font-semibold">
              {profile.careers.length} roles
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 shrink-0">
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
        <div className="flex flex-col gap-2 shrink-0">
          {[
            { icon: Linkedin, label: "LinkedIn", href: profile.linkedin },
            { icon: Github, label: "GitHub", href: profile.github },
            { icon: Globe, label: "Portfolio", href: profile.portfolioUrl },
          ]
            .filter((l) => l.href?.trim())
            .map(({ icon: Icon, label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2 text-xs font-semibold hover:bg-muted min-h-9"
              >
                <Icon className="w-3.5 h-3.5" />
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
  disabled,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 mb-4 shadow-sm">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground">Allow vendor access</p>
        <p className="text-xs text-muted-foreground mt-0.5">Let approved vendors view your profile for referrals</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 disabled:opacity-50 ${enabled ? "bg-primary" : "bg-secondary border border-border"}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
