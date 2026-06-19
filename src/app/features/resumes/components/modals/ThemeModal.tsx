import React from "react";
import { Palette } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog";
import { cn } from "../../../../lib/utils";
import type { ResumeTheme } from "../../../../types/resume";

const FONTS = ["Source Sans 3", "Inter", "Georgia", "Helvetica", "IBM Plex Sans"];
const PALETTES = [
  { name: "Navy", accent: "#1f3a5f", text: "#0f172a" },
  { name: "Emerald", accent: "#047857", text: "#064e3b" },
  { name: "Burgundy", accent: "#7f1d1d", text: "#1c1917" },
  { name: "Royal", accent: "#1d4ed8", text: "#0f172a" },
  { name: "Slate", accent: "#475569", text: "#0f172a" },
  { name: "Teal", accent: "#0f766e", text: "#134e4a" },
  { name: "Plum", accent: "#6b21a8", text: "#1e1b4b" },
  { name: "Charcoal", accent: "#374151", text: "#111827" },
];

type ThemeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: ResumeTheme;
  onChange: (theme: ResumeTheme) => void;
};

export function ThemeModal({ open, onOpenChange, theme, onChange }: ThemeModalProps) {
  const set = (patch: Partial<ResumeTheme>) => onChange({ ...theme, ...patch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Theme
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-2">
          <Field label="Font">
            <select
              value={theme.font}
              onChange={(e) => set({ font: e.target.value })}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="Header align">
            <select
              value={theme.headerAlign}
              onChange={(e) => set({ headerAlign: e.target.value as ResumeTheme["headerAlign"] })}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
            </select>
          </Field>
          <Field label="Body size (pt)">
            <input type="number" step="0.5" value={theme.bodySizePt} onChange={(e) => set({ bodySizePt: +e.target.value })} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm" />
          </Field>
          <Field label="Name size (pt)">
            <input type="number" step="0.5" value={theme.nameSizePt} onChange={(e) => set({ nameSizePt: +e.target.value })} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm" />
          </Field>
          <Field label="Accent color">
            <div className="flex gap-2">
              <input type="color" value={theme.accentColor} onChange={(e) => set({ accentColor: e.target.value })} className="w-10 h-10 rounded cursor-pointer" />
              <input value={theme.accentColor} onChange={(e) => set({ accentColor: e.target.value })} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm flex-1 font-mono text-xs" />
            </div>
          </Field>
          <Field label="Text color">
            <div className="flex gap-2">
              <input type="color" value={theme.textColor} onChange={(e) => set({ textColor: e.target.value })} className="w-10 h-10 rounded cursor-pointer" />
              <input value={theme.textColor} onChange={(e) => set({ textColor: e.target.value })} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm flex-1 font-mono text-xs" />
            </div>
          </Field>
          <Field label="Paper size">
            <select value={theme.paperSize} onChange={(e) => set({ paperSize: e.target.value as ResumeTheme["paperSize"] })} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm">
              <option value="letter">Letter</option>
              <option value="a4">A4</option>
            </select>
          </Field>
          <Field label="Margin (in)">
            <input type="number" step="0.05" value={theme.marginIn} onChange={(e) => set({ marginIn: +e.target.value })} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm" />
          </Field>
        </div>
        <div className="mt-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Palettes</p>
          <div className="flex flex-wrap gap-2">
            {PALETTES.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => set({ accentColor: p.accent, textColor: p.text })}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border text-xs font-semibold hover:bg-secondary"
              >
                <span className="w-4 h-4 rounded-full" style={{ background: p.accent }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">{label}</label>
      {children}
    </div>
  );
}
