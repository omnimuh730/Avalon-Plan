import { ChevronDown, ChevronUp } from "lucide-react";
import { Field, Dropdown } from "../adapters/ui";
import { TemplateGlyph } from "./template-glyph";
import { TEMPLATES } from "../constants/templates";
import { FONT_OPTIONS, PALETTES } from "../constants/defaults";
import { inputCls, numCls } from "../styles";
import { SECTION_LABEL } from "../types";
import type { LayoutSection, PaperSize, ResumeTheme } from "../types";

export function TemplatePanel({
  templateId,
  onSelect,
}: {
  templateId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <p className="text-[11px] text-neutral-400 dark:text-white/40 mb-4">
        The <strong className="text-neutral-600 dark:text-white/70">template</strong> sets the layout (columns, header &amp; heading
        alignment, heading style). Use <strong className="text-neutral-600 dark:text-white/70">Theme</strong> to restyle it.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {TEMPLATES.map((t) => {
          const active = t.id === templateId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              className={`text-left rounded-xl border p-3 transition ${
                active
                  ? "border-sky-500 ring-1 ring-sky-500/40 bg-sky-50/50 dark:bg-sky-500/10"
                  : "border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5"
              }`}
            >
              <TemplateGlyph template={t} />
              <div className="text-xs font-medium mt-2">{t.name}</div>
              <div className="text-[10px] text-neutral-400 dark:text-white/40 leading-tight mt-0.5">{t.blurb}</div>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function ThemePanel({
  theme,
  onChange,
  onApplyPalette,
}: {
  theme: ResumeTheme;
  onChange: (patch: Partial<ResumeTheme>) => void;
  onApplyPalette: (accent: string, text: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label="Font">
          <Dropdown<string> value={theme.font} onChange={(font) => onChange({ font })} options={FONT_OPTIONS} />
        </Field>
        <Field label="Body size (pt)">
          <input
            type="number"
            step="0.5"
            min={7}
            max={16}
            className={inputCls}
            value={theme.baseSize}
            onChange={(e) => onChange({ baseSize: Number(e.target.value) || 10 })}
          />
        </Field>
        <Field label="Name size (pt)">
          <input
            type="number"
            step="1"
            min={14}
            max={40}
            className={inputCls}
            value={theme.nameSize}
            onChange={(e) => onChange({ nameSize: Number(e.target.value) || 22 })}
          />
        </Field>
        <Field label="Accent color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={theme.accent}
              onChange={(e) => onChange({ accent: e.target.value })}
              className="w-10 h-10 rounded-lg border border-neutral-200 dark:border-white/10 bg-transparent cursor-pointer"
            />
            <input className={`${inputCls} font-mono text-xs`} value={theme.accent} onChange={(e) => onChange({ accent: e.target.value })} />
          </div>
        </Field>
        <Field label="Text color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={theme.text}
              onChange={(e) => onChange({ text: e.target.value })}
              className="w-10 h-10 rounded-lg border border-neutral-200 dark:border-white/10 bg-transparent cursor-pointer"
            />
            <input className={`${inputCls} font-mono text-xs`} value={theme.text} onChange={(e) => onChange({ text: e.target.value })} />
          </div>
        </Field>
        <Field label="Header align">
          <Dropdown<"left" | "center">
            value={theme.headerAlign}
            onChange={(headerAlign) => onChange({ headerAlign })}
            options={[
              { value: "center", label: "Center" },
              { value: "left", label: "Left" },
            ]}
          />
        </Field>
        <Field label="Paper size">
          <Dropdown<PaperSize>
            value={theme.paper}
            onChange={(paper) => onChange({ paper })}
            options={[
              { value: "letter", label: "Letter", hint: '8.5" × 11"' },
              { value: "a4", label: "A4", hint: "210 × 297 mm" },
            ]}
          />
        </Field>
        <Field label="Margin (in)">
          <input
            type="number"
            step="0.05"
            min={0.25}
            max={1.5}
            className={inputCls}
            value={theme.margin}
            onChange={(e) => onChange({ margin: Number(e.target.value) || 0.6 })}
          />
        </Field>
      </div>
      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-white/40 mb-2">Palettes</div>
        <div className="flex flex-wrap gap-2">
          {PALETTES.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onApplyPalette(p.accent, p.text)}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-white/10 text-xs hover:bg-neutral-100 dark:hover:bg-white/5"
              title={p.name}
            >
              <span className="w-3.5 h-3.5 rounded-full" style={{ background: p.accent }} />
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function SectionLayoutPanel({
  layout,
  onPatch,
  onMove,
}: {
  layout: LayoutSection[];
  onPatch: (id: string, patch: Partial<LayoutSection>) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  return (
    <div className="space-y-2">
      {layout.map((s, i) => (
        <div
          key={s.id}
          className="flex items-center gap-2 flex-wrap rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.03] px-3 py-2"
        >
          <span className="text-xs font-medium flex-1 min-w-[120px] shrink-0">{SECTION_LABEL[s.type]}</span>
          <label className="flex items-center gap-1 text-[10px] text-neutral-400 dark:text-white/40" title="Title size (pt)">
            T
            <input
              type="number"
              step="0.5"
              min={8}
              max={20}
              className={numCls}
              value={s.titleSize}
              onChange={(e) => onPatch(s.id, { titleSize: Number(e.target.value) || 12 })}
            />
          </label>
          <label className="flex items-center gap-1 text-[10px] text-neutral-400 dark:text-white/40" title="Body size (pt)">
            B
            <input
              type="number"
              step="0.5"
              min={7}
              max={16}
              className={numCls}
              value={s.bodySize}
              onChange={(e) => onPatch(s.id, { bodySize: Number(e.target.value) || 10 })}
            />
          </label>
          <input
            type="color"
            value={s.titleColor}
            onChange={(e) => onPatch(s.id, { titleColor: e.target.value })}
            className="w-9 h-9 rounded-lg border border-neutral-200 dark:border-white/10 bg-transparent cursor-pointer shrink-0"
            title="Title color"
          />
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onMove(s.id, -1)}
              disabled={i === 0}
              className="w-8 h-8 grid place-items-center rounded-lg border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-40"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove(s.id, 1)}
              disabled={i === layout.length - 1}
              className="w-8 h-8 grid place-items-center rounded-lg border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-40"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
