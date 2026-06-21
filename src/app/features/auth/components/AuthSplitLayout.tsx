import type { ReactNode } from "react";
import { AuthHeroPanel } from "./AuthHeroPanel";

type AuthSplitLayoutProps = {
  children: ReactNode;
};

export function AuthSplitLayout({ children }: AuthSplitLayoutProps) {
  return (
    <div className="flex h-dvh min-h-dvh w-full overflow-hidden bg-background">
      <AuthHeroPanel />
      <div className="flex w-full lg:w-1/3 min-h-0 flex-col justify-center overflow-y-auto px-6 py-10 sm:px-10 xl:px-14 border-l border-border/60 bg-card">
        <div className="w-full max-w-sm mx-auto">{children}</div>
      </div>
    </div>
  );
}
