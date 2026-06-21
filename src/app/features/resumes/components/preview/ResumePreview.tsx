import React, { forwardRef } from "react";
import { cn } from "../../../../lib/utils";
import type {
  ResumeDocument,
  ResumeTemplateRef,
  ResumeTheme,
  SectionLayoutConfig,
  SectionId,
} from "../../../../types/resume";

type ResumePreviewProps = {
  document: ResumeDocument;
  template: ResumeTemplateRef;
  theme: ResumeTheme;
  sections: SectionLayoutConfig[];
  className?: string;
};

const SECTION_LABELS: Record<SectionId, string> = {
  summary: "Summary",
  experience: "Experience",
  skills: "Skills",
  education: "Education",
};

export const ResumePreview = forwardRef<HTMLDivElement, ResumePreviewProps>(
  function ResumePreview({ document: doc, template, theme, sections, className }, ref) {
    const sorted = [...sections].sort((a, b) => a.order - b.order);
    const isTwoCol = template.layout === "two-column";
    const isCompact = template.layout === "compact" || template.layout === "minimal";
    const isModern = template.layout === "modern" || template.layout === "bold";

    const paperStyle: React.CSSProperties = {
      fontFamily: theme.font + ", system-ui, sans-serif",
      color: theme.textColor,
      padding: `${theme.marginIn}in`,
      fontSize: `${theme.bodySizePt}pt`,
      lineHeight: isCompact ? 1.25 : 1.4,
    };

    const headerAlign = template.layout === "classic" ? "left" : theme.headerAlign;

    const renderSection = (id: SectionId) => {
      const cfg = sections.find((s) => s.id === id)!;
      const titleStyle: React.CSSProperties = {
        fontSize: `${cfg.titleSizePt}pt`,
        color: cfg.color,
        fontWeight: isModern ? 700 : 600,
        marginBottom: "0.35em",
        marginTop: "0.75em",
        borderBottom: isModern ? `2px solid ${theme.accentColor}` : undefined,
        paddingBottom: isModern ? "0.15em" : undefined,
      };

      switch (id) {
        case "summary":
          return (
            <section key={id}>
              <h2 style={titleStyle}>{SECTION_LABELS.summary}</h2>
              <p style={{ fontSize: `${cfg.bodySizePt}pt`, margin: 0 }}>{doc.summary}</p>
            </section>
          );
        case "experience":
          return (
            <section key={id}>
              <h2 style={titleStyle}>{SECTION_LABELS.experience}</h2>
              {doc.experiences.map((exp) => (
                <div key={exp.id} style={{ marginBottom: "0.6em" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.25em" }}>
                    <strong style={{ fontSize: `${cfg.bodySizePt + 0.5}pt` }}>
                      {exp.role} — {exp.company}
                    </strong>
                    <span style={{ fontSize: `${cfg.bodySizePt - 0.5}pt`, opacity: 0.75 }}>
                      {exp.startDate} – {exp.endDate}
                    </span>
                  </div>
                  <p style={{ margin: "0.1em 0 0.25em", fontSize: `${cfg.bodySizePt - 0.5}pt`, opacity: 0.75 }}>
                    {exp.location}
                  </p>
                  <ul style={{ margin: 0, paddingLeft: "1.1em" }}>
                    {exp.bullets.map((b, i) => (
                      <li key={i} style={{ fontSize: `${cfg.bodySizePt}pt`, marginBottom: "0.15em" }}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          );
        case "skills":
          return (
            <section key={id}>
              <h2 style={titleStyle}>{SECTION_LABELS.skills}</h2>
              {(
                [
                  ["Programming Languages", doc.skills.languages],
                  ["Frameworks", doc.skills.frameworks],
                  ["Databases", doc.skills.databases],
                  ["Cloud & DevOps", doc.skills.cloudDevOps],
                ] as const
              ).map(
                ([label, items]) =>
                  items.length > 0 && (
                    <p key={label} style={{ margin: "0.2em 0", fontSize: `${cfg.bodySizePt}pt` }}>
                      <strong>{label}:</strong> {items.join(", ")}
                    </p>
                  )
              )}
            </section>
          );
        case "education":
          return (
            <section key={id}>
              <h2 style={titleStyle}>{SECTION_LABELS.education}</h2>
              {doc.education.map((edu) => (
                <div key={edu.id} style={{ marginBottom: "0.4em" }}>
                  <strong style={{ fontSize: `${cfg.bodySizePt + 0.5}pt` }}>{edu.degree}</strong>
                  <span style={{ fontSize: `${cfg.bodySizePt}pt` }}> — {edu.school}</span>
                  <p style={{ margin: "0.1em 0", fontSize: `${cfg.bodySizePt - 0.5}pt`, opacity: 0.75 }}>
                    {edu.graduationDate} · {edu.location}
                  </p>
                </div>
              ))}
            </section>
          );
      }
    };

    const sidebarSections: SectionId[] = isTwoCol ? ["skills", "education"] : [];
    const mainSections = sorted.filter((s) => !sidebarSections.includes(s.id));

    const header = (
      <header
        style={{
          textAlign: headerAlign,
          marginBottom: "0.75em",
          borderLeft: template.layout === "modern" ? `4px solid ${theme.accentColor}` : undefined,
          paddingLeft: template.layout === "modern" ? "0.5em" : undefined,
        }}
      >
        <h1 style={{ fontSize: `${theme.nameSizePt}pt`, fontWeight: 700, margin: "0 0 0.15em", color: theme.accentColor }}>
          {doc.identity.fullName}
        </h1>
        <p style={{ margin: 0, fontSize: `${theme.bodySizePt}pt`, opacity: 0.85 }}>
          {[doc.identity.location, doc.identity.email, doc.identity.phone, doc.identity.linkedin]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>
    );

    return (
      <div
        ref={ref}
        className={cn("resume-page bg-white text-left shadow-lg mx-auto", className)}
        style={{
          ...paperStyle,
          width: theme.paperSize === "letter" ? "8.5in" : "210mm",
          minHeight: theme.paperSize === "letter" ? "11in" : "297mm",
        }}
      >
        {!isTwoCol && header}
        {isTwoCol ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1em" }}>
            <div>
              <div style={{ textAlign: "left", marginBottom: "0.5em" }}>
                <h1 style={{ fontSize: `${theme.nameSizePt * 0.75}pt`, fontWeight: 700, margin: 0, color: theme.accentColor }}>
                  {doc.identity.fullName}
                </h1>
                <p style={{ margin: "0.25em 0 0", fontSize: `${theme.bodySizePt - 1}pt`, opacity: 0.85 }}>
                  {doc.identity.email}
                </p>
                <p style={{ margin: "0.1em 0", fontSize: `${theme.bodySizePt - 1}pt`, opacity: 0.85 }}>
                  {doc.identity.phone}
                </p>
              </div>
              {sidebarSections.map((id) => renderSection(id))}
            </div>
            <div>
              {mainSections.map((s) => renderSection(s.id))}
            </div>
          </div>
        ) : (
          mainSections.map((s) => renderSection(s.id))
        )}
      </div>
    );
  }
);
