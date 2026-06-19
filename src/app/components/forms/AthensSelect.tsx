"use client";

import React from "react";
import { cn } from "../../lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { athensSelectTriggerClass } from "./formTokens";
import { FormField } from "./FormField";

export type AthensSelectOption = { value: string; label: string };

type AthensSelectProps = {
  label?: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  options: AthensSelectOption[];
  placeholder?: string;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
};

export function AthensSelect({
  label,
  hint,
  error,
  value,
  onChange,
  options,
  placeholder = "Select…",
  size = "default",
  className,
  disabled,
}: AthensSelectProps) {
  return (
    <FormField label={label} hint={hint} error={error} className={className}>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          size={size}
          className={cn(
            athensSelectTriggerClass,
            "border-border bg-secondary shadow-none focus-visible:ring-0 focus-visible:border-primary/40",
            size === "sm" && "min-h-9 h-9 text-xs",
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="rounded-xl border-border">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="rounded-lg">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}
