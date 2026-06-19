import React from "react";
import { SearchField } from "./SearchField";
import { cn } from "../../lib/utils";

export type FilterOption = { value: string; label: string };

type ListToolbarProps = {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  filters?: {
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (v: string) => void;
  }[];
  sort?: {
    value: string;
    options: FilterOption[];
    onChange: (v: string) => void;
  };
  pageSize?: {
    value: number;
    options: number[];
    onChange: (v: number) => void;
  };
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters = [],
  sort,
  pageSize,
  actions,
  children,
  className,
}: ListToolbarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border py-3 -mx-1 px-1 mb-1",
        className,
      )}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <SearchField
          value={search}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          className="w-full sm:w-56 flex-1 sm:flex-none min-w-[180px]"
        />
        {filters.map((f) => (
          <label key={f.label} className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide hidden md:inline">
              {f.label}
            </span>
            <select
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 min-h-10"
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {sort && (
          <label className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide hidden md:inline">
              Sort
            </span>
            <select
              value={sort.value}
              onChange={(e) => sort.onChange(e.target.value)}
              className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 min-h-10"
            >
              {sort.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {pageSize && (
          <label className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide hidden md:inline">
              Per page
            </span>
            <select
              value={pageSize.value}
              onChange={(e) => pageSize.onChange(Number(e.target.value))}
              className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 min-h-10"
            >
              {pageSize.options.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        {children}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
