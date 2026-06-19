import React, { useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { TopNav } from "./components/layout/TopNav";
import { VIEW_COMPONENTS } from "./config/views";
import type { View } from "./types";

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const Page = VIEW_COMPONENTS[view];

  return (
    <div
      className="h-screen w-screen overflow-hidden bg-background text-foreground flex"
      style={{ fontFamily: "'Figtree',system-ui,sans-serif" }}
    >
      <Sidebar active={view} set={setView} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav active={view} />
        <main className="flex-1 min-h-0 overflow-hidden">
          <Page />
        </main>
      </div>
    </div>
  );
}
