import { useState } from "react";
import { AthensSwitch } from "../../../components/forms";

const NOTIFICATION_GROUPS = [
  { id: "applications", label: "Application updates", description: "Status changes and recruiter replies" },
  { id: "interviews", label: "Interview reminders", description: "24h and 1h before scheduled interviews" },
  { id: "jobs", label: "New job matches", description: "When agents find high-match roles" },
  { id: "agents", label: "Agent run summaries", description: "Daily digest of agent activity" },
  { id: "mail", label: "Email digests", description: "Unread recruiter messages" },
];

export function NotificationsTab() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NOTIFICATION_GROUPS.map((g) => [g.id, true])),
  );

  return (
    <div className="max-w-2xl space-y-4">
      <div className="mb-2">
        <h2 className="text-lg font-bold text-foreground">Notifications</h2>
        <p className="text-sm text-muted-foreground">Choose what Athens should notify you about</p>
      </div>
      {NOTIFICATION_GROUPS.map((g) => (
        <div key={g.id} className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <AthensSwitch
            label={g.label}
            description={g.description}
            checked={prefs[g.id] ?? false}
            onCheckedChange={(checked) => setPrefs((p) => ({ ...p, [g.id]: checked }))}
          />
        </div>
      ))}
    </div>
  );
}
