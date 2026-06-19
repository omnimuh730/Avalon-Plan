import React, { useState } from "react";
import { PageShell } from "../../components/layout/PageShell";
import { Pill } from "../../components/ui";
import { TabTransition } from "../../components/overlays";
import { ProfileTab } from "./components/ProfileTab";
import { NotificationsTab } from "./components/NotificationsTab";
import { SecurityTab } from "./components/SecurityTab";
import { IntegrationsTab } from "./components/IntegrationsTab";

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
      <TabTransition tabKey={tab}>
        {tab === "profile" && <ProfileTab />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "integrations" && <IntegrationsTab />}
        {tab === "security" && <SecurityTab />}
      </TabTransition>
    </PageShell>
  );
}
