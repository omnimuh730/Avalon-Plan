import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "../../../components/ui";

export function ResumeGeneratorTab() {
  const [role, setRole] = useState("Senior Frontend Engineer");
  const [stack, setStack] = useState("React + TypeScript");
  const [tone, setTone] = useState("Professional");
  const [generated, setGenerated] = useState(false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-foreground">Resume generator</h3>
        <label className="block">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Target role</span>
          <input value={role} onChange={(e) => setRole(e.target.value)} className="mt-1.5 w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary/40 min-h-10" />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Tech stack</span>
          <select value={stack} onChange={(e) => setStack(e.target.value)} className="mt-1.5 w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm outline-none min-h-10">
            <option>React + TypeScript</option>
            <option>Python — Data</option>
            <option>Full Stack MERN</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Tone</span>
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="mt-1.5 w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm outline-none min-h-10">
            <option>Professional</option>
            <option>Concise</option>
            <option>Impact-focused</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setGenerated(true)}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10"
        >
          <Sparkles className="w-4 h-4" />
          Generate resume
        </button>
      </div>
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-foreground mb-4">Preview</h3>
        {generated ? (
          <div className="space-y-4 text-sm text-foreground/85 leading-relaxed">
            <div>
              <p className="text-lg font-bold text-foreground">Jordan Doe</p>
              <p className="text-muted-foreground">{role}</p>
            </div>
            <p>
              Results-driven engineer with 6+ years building high-performance web applications. Specialized in {stack} with a track record of shipping products used by millions.
            </p>
            <div>
              <p className="font-bold text-foreground mb-2">Experience</p>
              <p>Senior Software Engineer · Acme Corp · 2022–present</p>
              <ul className="list-disc pl-5 mt-1 text-muted-foreground">
                <li>Led migration to React 18, improving LCP by 40%</li>
                <li>Built design system adopted across 12 product teams</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["React", "TypeScript", "Node.js", "GraphQL"].map((s) => (
                <Badge key={s} v="blue">{s}</Badge>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Configure options and click Generate to preview your tailored resume.</p>
        )}
      </div>
    </div>
  );
}
