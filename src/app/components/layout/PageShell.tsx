import React from "react";

export function PageShell({
  children,
  className = "",
  fullWidth = false,
}: {
  children: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={`flex-1 min-h-0 overflow-auto subtle-scroll ${className}`}>
      {fullWidth ? children : <div className="page-container min-h-full">{children}</div>}
    </div>
  );
}
