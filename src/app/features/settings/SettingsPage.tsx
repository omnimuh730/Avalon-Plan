import React, { useState } from "react";
import { Settings, Globe } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { Pill } from "../../components/ui";
import { cn } from "../../lib/utils";
import { ProfileTab } from "./components/ProfileTab";

const INTEGRATIONS = [
  { n: "LinkedIn", st: "connected", d: "Import jobs and sync application status" },
  { n: "Indeed", st: "connected", d: "Job alerts and Easy Apply tracking" },
  { n: "Google Calendar", st: "connected", d: "Interview scheduling and reminders" },
  { n: "Notion", st: "disconnected", d: "Export prep notes and application tracker" },
  { n: "GitHub", st: "connected", d: "Showcase projects on applications" },
];

export function SettingsPage() {
  const [tab, setTab] = useState("profile");

  return (
    <PageShell>
      <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 w-fit mb-6 scroll-row">
        {["profile", "notifications", "integrations", "security"].map((t) => (
          <Pill key={t} active={tab === t} onClick={() => setTab(t)}>
            {t}
          </Pill>
        ))}
      </div>
      {tab === "profile" && <ProfileTab />}
      {tab === "integrations" && (
        <div className="space-y-4 max-w-2xl">
          {INTEGRATIONS.map((int) => (
            <div key={int.n} className="bg-card border border-border rounded-xl p-5 flex items-center gap-5 hover:shadow-md transition-all shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                <Globe className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-foreground">{int.n}</p>
                <p className="text-sm text-muted-foreground">{int.d}</p>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <span className={cn("text-sm font-bold capitalize", int.st === "connected" ? "text-emerald-600" : "text-muted-foreground")}>{int.st}</span>
                <button type="button" className={cn("text-sm px-4 py-2.5 rounded-xl font-bold transition-colors min-h-10", int.st === "connected" ? "bg-secondary text-muted-foreground hover:text-foreground border border-border" : "bg-primary text-white hover:bg-primary/90")}>
                  {int.st === "connected" ? "Manage" : "Connect"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(tab === "notifications" || tab === "security") && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <div className="text-center">
            <Settings className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="text-base font-bold capitalize">{tab} Settings</p>
            <p className="text-sm text-muted-foreground mt-1">Configuration panel</p>
          </div>
        </div>
      )}
    </PageShell>
  );
}
