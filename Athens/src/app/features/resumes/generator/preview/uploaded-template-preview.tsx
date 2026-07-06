import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { renderAsync } from "docx-preview";
import { fillResumeTemplateDocx } from "@/app/services/resumeApi";
import type { GeneratedContent } from "../types";
import { uploadedTemplateMongoId } from "../types";

const LETTER_WIDTH_PX = 816;
const LETTER_HEIGHT_PX = 1056;

export function UploadedTemplatePreview({
  templateId,
  ownerName,
  generated,
  generating,
}: {
  templateId: string;
  ownerName: string | null | undefined;
  generated: GeneratedContent | null;
  generating?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [docSize, setDocSize] = useState({ width: LETTER_WIDTH_PX, height: LETTER_HEIGHT_PX });
  const [rendered, setRendered] = useState(false);

  const sections = useMemo(() => {
    if (!generated) return {};
    return {
      summary: { summary: generated.summary },
      skills: { skills: generated.skills },
      experience: { experiences: generated.experience },
    };
  }, [generated]);

  const sectionsKey = useMemo(() => JSON.stringify(sections), [sections]);

  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, Math.max(0.1, el.clientWidth / docSize.width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [docSize.width]);

  useEffect(() => {
    const target = renderRef.current;
    if (!ownerName || !templateId) {
      if (target) target.innerHTML = "";
      setRendered(false);
      return;
    }
    if (!target) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      setRendered(false);
      target.innerHTML = "";
      void fillResumeTemplateDocx({
        templateId,
        ownerName,
        sections: sectionsKey === "{}" ? {} : JSON.parse(sectionsKey),
        fileName: "template-preview.docx",
      })
        .then(async (blob) => {
          if (cancelled) return;
          target.innerHTML = "";
          await renderAsync(blob, target, target, {
            breakPages: true,
            experimental: true,
            ignoreFonts: false,
            ignoreHeight: false,
            ignoreWidth: false,
            inWrapper: true,
            renderFooters: true,
            renderHeaders: true,
            useBase64URL: true,
          });
          if (cancelled) return;
          const wrapper = target.querySelector<HTMLElement>(".docx-wrapper") ?? target;
          const pages = Array.from(target.querySelectorAll<HTMLElement>("section.docx"));
          const firstPage = pages[0];
          const width = firstPage?.offsetWidth || wrapper.scrollWidth || LETTER_WIDTH_PX;
          const height = wrapper.scrollHeight || firstPage?.offsetHeight || LETTER_HEIGHT_PX;
          setDocSize({ width, height });
          setRendered(true);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : String(e));
          target.innerHTML = "";
          setRendered(false);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ownerName, templateId, sectionsKey]);

  const mongoId = uploadedTemplateMongoId(templateId);

  return (
    <div className="rounded-xl bg-neutral-200/70 dark:bg-black/40 p-4 overflow-auto max-h-[80vh] w-full">
      <div ref={fitRef} className="w-full flex justify-center min-h-[200px]">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-white/50 py-16">
            <Loader2 className="w-4 h-4 animate-spin" />
            Rendering template preview…
          </div>
        )}
        {!loading && error && (
          <div className="text-sm text-rose-500 py-16 text-center max-w-md">
            Could not render template preview: {error}
          </div>
        )}
        <div
          className={rendered && !error ? "block" : "hidden"}
          style={{
            width: Math.ceil(docSize.width * scale),
            minHeight: Math.ceil(docSize.height * scale),
          }}
        >
          <div
            ref={renderRef}
            className="uploaded-template-docx-preview origin-top-left"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: docSize.width,
            }}
          />
        </div>
        {!loading && !error && !rendered && (
          <div className="text-sm text-neutral-500 dark:text-white/50 py-16">
            {generating ? "Generating content…" : "Template preview will appear here."}
          </div>
        )}
      </div>
      <p className="text-[11px] text-neutral-400 dark:text-white/40 mt-2 text-center">
        Preview rendered from your uploaded DOCX template
        {mongoId ? ` (${mongoId.slice(0, 8)}…)` : ""}. Word export uses the same fill pipeline.
      </p>
    </div>
  );
}
