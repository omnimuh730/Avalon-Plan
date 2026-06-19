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
    <div className={`h-full overflow-auto subtle-scroll ${className}`}>
      {fullWidth ? children : <div className="page-container">{children}</div>}
    </div>
  );
}
