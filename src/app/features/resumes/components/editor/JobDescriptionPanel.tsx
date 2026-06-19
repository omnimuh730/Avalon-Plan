type JobDescriptionPanelProps = {
  value: string;
  onChange: (value: string) => void;
};

export function JobDescriptionPanel({ value, onChange }: JobDescriptionPanelProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-bold text-foreground mb-3">Job description</h3>
      <label className="text-xs font-semibold text-muted-foreground block mb-1.5">About the job</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste the job description here. The generator will tailor your resume to match role requirements…"
        rows={8}
        className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/40 resize-y min-h-[160px]"
      />
    </div>
  );
}
